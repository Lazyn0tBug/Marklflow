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

/// 装配探针并打印两份报告。调用方负责记录输出作为阶段证据。
pub fn run(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let fixture_dir = tempfile::tempdir()?;
    let fixture: PathBuf = fixture_dir.path().join("probe-fixture.md");
    fs::write(&fixture, FIXTURE_CONTENT)?;

    // 受控授权：读、写两种角色分别签发（不经 IPC）。
    let access = app.state::<FileAccess>();
    let read_grant = access.grant(fixture.clone(), false)?;
    let write_grant = access.grant(fixture.clone(), true)?;

    let url = probe_url(app, &read_grant.key, &write_grant.key)?;
    let page_origin = origin_of(&url);

    // 探针装配的 span：根 span 的直接子。
    let probe = logging::probe_span();

    // 主窗口导航到探针页：身份仍是 ("main","main")，在允许范围内。
    let source_reachable = source_is_reachable(&url);
    tracing::info!(
        event = "probe_source_check",
        page_origin = page_origin.as_str(),
        reachable = source_reachable,
    );
    if !source_reachable {
        tracing::warn!(
            event = "probe_abort",
            reason = "探针页源不可达：应用与探针页必须同源，且该源须在运行",
        );
    }
    // 主窗口的导航放到后台线程：先等它的初始页面落地，再导航到探针页。
    // 在 setup 钩子里抢先导航会与初次加载相撞，窗口会停在 about:blank。

    // 输出宿主承载同一个探针页：身份是 ("pdf-output","pdf-output")，不在允许范围内。
    let output = output_host::create(app, WebviewUrl::External(url.clone()))?;
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
        let mut navigated = false;
        let mut navigate_error = String::new();
        if let Some(window) = &main_window {
            // 先等主窗口的初始页面落地（URL 不是 about:blank）：Windows 上 webview 的
            // 初次加载可能还没发出，这时抢先导航会让窗口停在 about:blank。
            let initial = wait_initial_load(window, Duration::from_secs(30));
            let initial_url = window.url().map(|value| value.to_string()).unwrap_or_default();
            tracing::info!(
                    event = "probe_initial_load",
                host = "main",
                loaded = initial,
                url = initial_url.as_str(),
            );
            if !initial {
                tracing::warn!(
                            event = "probe_abort",
                    reason = "主窗口初始页面未落地，无法把探针页挂上去",
                );
            }
            // 只在探针页还没就位时导航：重复导航会让探针页跑第二遍，
            // 而第一遍已经撤销了受控授权，第二遍的读取就会拿到 unknown-file-key。
            if window.url().map(|current| current == url).unwrap_or(false) {
                navigated = true;
            } else {
                for _ in 0..5 {
                    match window.navigate(url.clone()) {
                        Ok(()) => {
                            std::thread::sleep(Duration::from_millis(700));
                            if window.url().map(|current| current == url).unwrap_or(false) {
                                navigated = true;
                                break;
                            }
                        }
                        Err(error) => {
                            navigate_error = error.to_string();
                            break;
                        }
                    }
                }
            }
        }
        let page_path = url_path(&url);
        tracing::info!(
            event = "probe_navigation",
            host = "main",
            navigated,
            navigate_error = navigate_error.as_str(),
            // 只记路径：查询串里带受控授权的 key。
            url = page_path.as_str(),
        );

        // 页面报告由 Rust 读回：这是 **native 侧对页面结果的读数**，内容仍是页面自述。
        if let Some(window) = &main_window {
            if let Some(report) = read_report(window, REPORT_TIMEOUT) {
                log_observed_report("main", &report);
            }
        }
        if let Some(window) = &output_window {
            if let Some(report) = read_report(window, REPORT_TIMEOUT) {
                log_observed_report("output", &report);
            }
        }

        // 探针专用回收：撤销两份受控授权。正常 release_native_file 的业务清理不受影响。
        let access = handle.state::<FileAccess>();
        access.revoke(&read_key);
        access.revoke(&write_key);
        let read_prefix = logging::credential_prefix(&read_key);
        let write_prefix = logging::credential_prefix(&write_key);
        tracing::info!(
            event = "probe_cleanup",
            read_key_prefix = read_prefix.as_str(),
            write_key_prefix = write_prefix.as_str(),
            revoked = true,
            fixture_removed_on_drop = true,
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
        drop(fixture_dir);
        });
    });

    Ok(())
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
fn probe_url(
    app: &tauri::AppHandle,
    read_key: &str,
    write_key: &str,
) -> Result<Url, Box<dyn std::error::Error>> {
    let main = app.get_webview_window("main").ok_or("缺少主窗口")?;
    let origin = main.url()?;
    let mut url = origin;
    url.set_path(PROBE_PAGE_PATH);
    url.set_query(Some(&format!(
        "readKey={}&writeKey={}&expect={}",
        read_key,
        write_key,
        FIXTURE_CONTENT
    )));
    Ok(url)
}

/// 探针页源的 origin。
fn origin_of(url: &Url) -> String {
    match (url.host_str(), url.port_or_known_default()) {
        (Some(host), Some(port)) => format!("{host}:{port}"),
        _ => url.to_string(),
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
fn read_report(window: &tauri::WebviewWindow, timeout: Duration) -> Option<String> {
    let current = window
        .url()
        .map(|value| value.to_string())
        .unwrap_or_default();
    if current == "about:blank" {
        tracing::warn!(
            event = "probe_report_unreadable",
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
        reason = "探针页未在超时内标记完成",
    );
    None
}
