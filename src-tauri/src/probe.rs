//! 受控探针装配（仅 `pdf-probe` feature，默认关闭）。
//!
//! 受控授权**不经 IPC** 铸造：`invoke_handler` 不变，不新增前端铸造命令，也不新增 IPC 通道。
//! 授权复用生产侧 `FileAccess` 的既有形态（path + writable + UUID key），
//! key 经探针页 URL 的查询串交付，探针页从 `location.search` 取。
//!
//! 装配后的两个载体：
//!
//! - 主窗口被导航到探针页，其身份仍是 ("main","main")，在允许范围内；
//! - 输出宿主承载同一个探针页，其身份是 ("pdf-output","pdf-output")，不在允许范围内。
//!
//! 两者的差别只有身份，因此允许与拒绝的证据出自同一条生产路径。

use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use tauri::{Manager, Url, WebviewUrl};

use crate::files::FileAccess;
use crate::logging;
use crate::output_host;
use crate::source_guard;

/// 受控夹具的内容。探针页从 URL 拿到期望值，与实际读到的内容逐字比对。
pub const FIXTURE_CONTENT: &str = "MF-PROBE-FIXTURE-20261103";

/// 探针页在仓库中的路径。由开发服务器提供，与生产前端同源，不放宽生产 CSP。
const PROBE_PAGE_PATH: &str = "/tests/fixtures/architecture/pdf-probe-client.html";

/// 报告的读取超时。探针页要跑完通道阳性、受控读取与选择器尝试。
const REPORT_TIMEOUT: Duration = Duration::from_secs(60);

/// 探针装配的失败类别。
///
/// 只记类别，不记异常原文：异常原文可能带本地路径，而契约禁止完整本地路径入日志。
#[derive(Debug, Clone, Copy)]
enum ProbeError {
    /// 配置里没有 devUrl：应用自身的源无从取得。
    NoAppOrigin,
    /// 受控夹具或受控授权的建立失败。
    Fixture,
    /// 输出宿主创建失败。
    Host,
}

impl ProbeError {
    /// 记进日志的稳定类别。
    fn category(self) -> &'static str {
        match self {
            ProbeError::NoAppOrigin => "no-app-origin",
            ProbeError::Fixture => "fixture-failed",
            ProbeError::Host => "host-failed",
        }
    }
}

/// 装配探针并留下运行证据。调用方负责把日志作为阶段证据。
///
/// **装配失败不拖住应用启动**：探针是测试路径，失败只记一条中止原因。
pub fn run(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    match assemble(app) {
        Ok(()) => Ok(()),
        Err(error) => {
            logging::probe_span().in_scope(|| {
                tracing::warn!(event = "probe_abort", reason = error.category());
            });
            Ok(())
        }
    }
}

/// 探针装配。失败时给出失败类别，不给异常原文。
fn assemble(app: &tauri::AppHandle) -> Result<(), ProbeError> {
    let fixture_dir = tempfile::tempdir().map_err(|_| ProbeError::Fixture)?;
    let fixture: PathBuf = fixture_dir.path().join("probe-fixture.md");
    fs::write(&fixture, FIXTURE_CONTENT).map_err(|_| ProbeError::Fixture)?;

    // 受控授权：读、写两种角色分别签发（不经 IPC）。
    let access = app.state::<FileAccess>();
    let read_grant = access
        .grant(fixture.clone(), false)
        .map_err(|_| ProbeError::Fixture)?;
    let write_grant = access
        .grant(fixture.clone(), true)
        .map_err(|_| ProbeError::Fixture)?;

    // 探针页 URL 的源取自**配置**，不取自窗口的当前 URL：窗口在初载落地前是
    // about:blank，据此算出来的源是错的——交付宿主上就是这么变成白屏的。
    let url = probe_url(app, &read_grant.key, &write_grant.key)?;

    // 探针装配的 span：根 span 的直接子。
    let probe = logging::probe_span();

    // 输出宿主承载同一个探针页：身份是 ("pdf-output","pdf-output")，不在允许范围内。
    let output = output_host::create(app, WebviewUrl::External(url.clone()))
        .map_err(|_| ProbeError::Host)?;
    let output_label = output.label().to_owned();
    // 登记为可写日志的探针输出实例（仅 pdf-probe 构建生效）：页面不能自报身份获得允许。
    logging::register_probe_instance(&source_guard::Identity::from_labels(
        output_label.as_str(),
        output_label.as_str(),
    ));

    // 事件循环在 setup 钩子返回之后才启动：eval 的回调要经事件循环送达，
    // 因此报告读取必须放到后台线程，否则在 setup 里读会一直等到超时。
    let handle = app.clone();
    let read_key = read_grant.key.clone();
    let write_key = write_grant.key.clone();
    let fixture_dir = fixture_dir;
    std::thread::spawn(move || {
        probe.in_scope(|| {
        let main_window = handle.get_webview_window("main");
        let output_window = handle.get_webview_window(&output_label);
        let mut initial_target: Option<Url> = None;
        let mut loaded = false;
        if let Some(window) = &main_window {
            // 先等主窗口的初始页面落地（URL 不是 about:blank）：Windows 上 webview 的
            // 初次加载可能还没发出，这时抢先导航会让窗口停在 about:blank。
            loaded = wait_initial_load(window, Duration::from_secs(30));
            initial_target = window.url().ok();
            let initial_url = window.url().map(|value| value.to_string()).unwrap_or_default();
            tracing::info!(
                    event = "probe_initial_load",
                host = "main",
                loaded = loaded,
                url = initial_url.as_str(),
            );
        }
        // 主窗口实际所在的源必须与配置里的源一致：不一致说明应用不是从 dev server
        // 起的，探针页就不同源，IPC 会被拒——那样的证据是假的。
        let window_origin = initial_target.as_ref().map(origin_of).unwrap_or_default();
        let configured_origin = origin_of(&url);
        let same_origin = window_origin.is_empty() || window_origin == configured_origin;
        // 源可达性在导航**之前**判：源不可达就别导航，把主窗口留在应用自己的页面上。
        // 源检查记在探针 span 内：事件落在契约规定的 span 里，不悬空。
        let source_reachable = source_is_reachable(&url);
        probe.in_scope(|| {
            tracing::info!(
                event = "probe_source_check",
                page_origin = configured_origin.as_str(),
                reachable = source_reachable,
            );
        });
        // 中止原因**只出一条**：探针页没就位的原因有几种，但一次运行记一条，
        // 否则同一 span 里的同名事件会被判成重复输出。
        let abort_reason = if !loaded {
            Some("主窗口初始页面未落地，无法把探针页挂上去")
        } else if !same_origin {
            Some("应用源与配置源不一致：探针页必须与主窗口同源")
        } else if !source_reachable {
            Some("探针页源不可达：应用与探针页必须同源，且该源须在运行")
        } else {
            None
        };
        if let Some(reason) = abort_reason {
            probe.in_scope(|| {
                tracing::warn!(event = "probe_abort", reason = reason);
            });
        }
        // 探针页没就位就不导航：把主窗口留在应用自己的页面上。
        let navigation = match (&main_window, abort_reason) {
            (Some(window), None) => Some(navigate_to_probe(window, &url)),
            _ => None,
        };
        let (navigated, attempted, navigate_error) =
            navigation.unwrap_or((false, false, String::new()));
        let page_path = url_path(&url);
        tracing::info!(
            event = "probe_navigation",
            host = "main",
            navigated,
            navigate_error = navigate_error.as_str(),
            // 只记路径：查询串里带受控授权的 key。
            url = page_path.as_str(),
        );
        // 探针没就位时不读报告：等满超时也读不到，白等一分钟。
        // 主窗口也要导回初始页——探针失败不该把应用留在坏页面上。
        if !navigated {
            // 试过导航却没成位：把主窗口导回初始页——探针失败不该把应用留在坏页面上。
            let restored = if attempted {
                match (&main_window, &initial_target) {
                    (Some(window), Some(target)) => window.navigate(target.clone()).is_ok(),
                    _ => false,
                }
            } else {
                false
            };
            tracing::warn!(
                event = "probe_report_unreadable",
                host = "main",
                reason = if restored {
                    "探针页未就位：无报告可读，主窗口已导回初始页面"
                } else {
                    "探针页未就位：无报告可读"
                },
            );
        }

        // 页面报告由 Rust 读回：这是 **native 侧对页面结果的读数**，内容仍是页面自述。
        if navigated {
            if let Some(window) = &main_window {
                if let Some(report) = read_report(window, REPORT_TIMEOUT, "main") {
                    log_observed_report("main", &report);
                }
            }
            if let Some(window) = &output_window {
                if let Some(report) = read_report(window, REPORT_TIMEOUT, "output") {
                    log_observed_report("output", &report);
                }
            }
        }

        // 探针专用回收：撤销两份受控授权。正常 release_native_file 的业务清理不受影响。
        // 不记 key 片段：契约禁止用凭据片段做关联，也禁止日志出现凭据的派生值。
        let access = handle.state::<FileAccess>();
        access.revoke(&read_key);
        access.revoke(&write_key);
        // 夹具目录随 TempDir 离开作用域而删除：先删，再记事实——不提前宣称已删除。
        drop(fixture_dir);
        tracing::info!(
            event = "probe_cleanup",
            revoked = true,
            revoked_grants = 2,
            fixture_removed = true,
        );
        // 受控验收入口直接读取健康状态，并把状态与观察来源抄进日志。
        let health = logging::health();
        logging::log_span().in_scope(|| tracing::info!(
            event = "log_health",
            observed_by = "probe",
            dropped = health.dropped,
            rejected = health.rejected,
            write_failures = health.write_failures,
            rotate_failures = health.rotate_failures,
            delete_failures = health.delete_failures,
            file_unavailable = health.file_unavailable,
            stdout_failed = health.stdout_failed,
        ));
        });
    });

    Ok(())
}

/// 把主窗口导航到探针页。返回（是否就位、是否试过、导航错误）。
///
/// 只在探针页还没就位时导航：重复导航会让探针页跑第二遍，
/// 而第一遍已经撤销了受控授权，第二遍的读取就会拿到 unknown-file-key。
fn navigate_to_probe(window: &tauri::WebviewWindow, url: &Url) -> (bool, bool, String) {
    if window.url().map(|current| current == *url).unwrap_or(false) {
        return (true, false, String::new());
    }
    for _ in 0..5 {
        match window.navigate(url.clone()) {
            Ok(()) => {
                std::thread::sleep(Duration::from_millis(700));
                if window.url().map(|current| current == *url).unwrap_or(false) {
                    return (true, true, String::new());
                }
            }
            Err(error) => return (false, true, error.to_string()),
        }
    }
    (false, true, String::new())
}

/// 记下 Rust 侧对页面报告的读数。
///
/// 这是 **native 侧对页面结果的读数**：内容仍是页面自述，不因此成为原生证实。
fn log_observed_report(host: &str, raw: &str) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        tracing::warn!(event = "page_report_observed", host, parsed = false);
        return;
    };
    let text = |key: &str| {
        value
            .get(key)
            .and_then(|entry| entry.as_str())
            .unwrap_or("")
            .to_owned()
    };
    let outcome_text = |key: &str, field: &str| {
        value
            .get(key)
            .and_then(|entry| entry.get(field))
            .and_then(|entry| entry.as_str())
            .unwrap_or("")
            .to_owned()
    };
    let outcome_ok = |key: &str| {
        value
            .get(key)
            .and_then(|entry| entry.get("ok"))
            .and_then(|entry| entry.as_bool())
            .unwrap_or(false)
    };
    let role = text("role");
    let identity_window = text("identity_window");
    let read_error = outcome_text("read", "error");
    let select_error = outcome_text("select", "error");
    let release_error = outcome_text("releaseAttempt", "error");
    tracing::info!(
        event = "page_report_observed",
        host,
        role = role.as_str(),
        read_ok = outcome_ok("read"),
        read_error = read_error.as_str(),
        read_matches_fixture = value
            .get("readMatchesFixture")
            .and_then(|entry| entry.as_bool())
            .unwrap_or(false),
        select_error = select_error.as_str(),
        release_error = release_error.as_str(),
        identity_window = identity_window.as_str(),
    );
}

/// URL 的路径部分：查询串里带受控授权的 key，不进日志。
fn url_path(url: &Url) -> String {
    url.path().to_owned()
}

/// 探针页 URL：与主窗口同源，查询串带两份 key 与期望内容。
///
/// 源取自**配置里的 devUrl**（应用自身的源），不取自窗口的当前 URL：
/// 窗口在初载落地前是 about:blank，据此算出来的源是错的——交付宿主上
/// 就是这么把主窗口导航成 about:blank、屏幕全白的。
/// 配置里没有 devUrl 时返回失败。生产构建的页面由 tauri 协议提供，与配置里的
/// 源不是同一个——那种情况下运行期会由同源判定中止（见 assemble 里的来源比对）。
fn probe_url(
    app: &tauri::AppHandle,
    read_key: &str,
    write_key: &str,
) -> Result<Url, ProbeError> {
    let origin = app
        .config()
        .build
        .dev_url
        .clone()
        .ok_or(ProbeError::NoAppOrigin)?;
    Ok(probe_url_from(origin, read_key, write_key))
}

/// 由应用源构造探针页 URL：路径换成探针页，查询串带两份 key 与期望内容。
///
/// 纯函数：源的路径与查询串一律被替换，不从源里继承任何内容。
fn probe_url_from(mut origin: Url, read_key: &str, write_key: &str) -> Url {
    origin.set_path(PROBE_PAGE_PATH);
    origin.set_query(Some(&format!(
        "readKey={}&writeKey={}&expect={}",
        read_key,
        write_key,
        FIXTURE_CONTENT
    )));
    origin
}

/// 探针页源的 origin：只取 host:port。
///
/// **不回退成整个 URL**：查询串里带着受控授权的 key，整个 URL 进日志就是凭据泄露。
fn origin_of(url: &Url) -> String {
    match (url.host_str(), url.port_or_known_default()) {
        (Some(host), Some(port)) => format!("{host}:{port}"),
        _ => "none".to_owned(),
    }
}

/// 探针页源是否可达。源不可达时导航必然失败，报告必然空，先分清这两种情况。
fn source_is_reachable(url: &Url) -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    let Some(host) = url.host_str() else {
        return false;
    };
    let port = url.port_or_known_default().unwrap_or(80);
    let Ok(mut addresses) = (host, port).to_socket_addrs() else {
        return false;
    };
    match addresses.next() {
        Some(address) => TcpStream::connect_timeout(&address, Duration::from_secs(2)).is_ok(),
        None => false,
    }
}

/// 等主窗口的初始页面落地：URL 不是 about:blank 即视为已加载。
fn wait_initial_load(window: &tauri::WebviewWindow, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let current = window
            .url()
            .map(|value| value.to_string())
            .unwrap_or_default();
        if current != "about:blank" && !current.is_empty() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

/// 读取探针页写在 DOM 里的报告，等到它标记完成或超时。
fn read_report(window: &tauri::WebviewWindow, timeout: Duration, host: &str) -> Option<String> {
    let current = window
        .url()
        .map(|value| value.to_string())
        .unwrap_or_default();
    if current == "about:blank" {
        tracing::warn!(
            event = "probe_report_unreadable",
            host = host,
            reason = "该窗口未加载任何页面（about:blank），报告无从产生",
        );
        return None;
    }
    let deadline = Instant::now() + timeout;
    let mut printed = false;
    while Instant::now() < deadline {
        let (sender, receiver) = mpsc::channel();
        let script = "(()=>{const el=document.querySelector('[data-probe-report]');if(!el)return '';try{return JSON.parse(el.textContent||'{}')}catch(error){return ''}})()";
        if window
            .eval_with_callback(script, move |value| {
                let _ = sender.send(value);
            })
            .is_err()
        {
            return None;
        }
        let Ok(raw) = receiver.recv_timeout(Duration::from_millis(800)) else {
            std::thread::sleep(Duration::from_millis(200));
            continue;
        };
        if !printed {
            tracing::debug!(event = "probe_eval_raw", raw = raw.as_str());
            printed = true;
        }
        if raw.contains("\"done\"") {
            return Some(raw);
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    tracing::warn!(
        event = "probe_report_timeout",
        host = host,
        reason = "探针页未在超时内标记完成",
    );
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_probe_url_replaces_the_path_and_the_query_of_the_origin() {
        let origin = Url::parse("http://127.0.0.1:3000/app/index.html?stale=1").unwrap();
        let url = probe_url_from(origin, "read-key", "write-key");
        assert_eq!(url.path(), PROBE_PAGE_PATH);
        assert_eq!(url.host_str(), Some("127.0.0.1"));
        assert_eq!(url.port(), Some(3000));
        assert_eq!(
            url.query(),
            Some("readKey=read-key&writeKey=write-key&expect=MF-PROBE-FIXTURE-20261103")
        );
    }

    #[test]
    fn the_origin_never_falls_back_to_the_whole_url() {
        // 无 host 的 URL（about: 方案）不能整串回退：查询串里带着受控授权的 key，
        // 整串进日志就是凭据泄露——交付宿主上就是这么泄过一次。
        let url = Url::parse("about:%2Ftests/x.html?readKey=secret").unwrap();
        assert_eq!(origin_of(&url), "none");
        assert!(!origin_of(&url).contains("secret"));
    }

    #[test]
    fn the_origin_of_a_real_source_is_host_and_port() {
        let url = Url::parse("http://127.0.0.1:3000/tests/x.html").unwrap();
        assert_eq!(origin_of(&url), "127.0.0.1:3000");
    }
}
