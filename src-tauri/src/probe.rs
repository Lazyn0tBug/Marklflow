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
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use tauri::{Manager, Url, WebviewUrl};

use crate::config::{self, Config};
use crate::files::FileAccess;
use crate::logging;
use crate::pdf_print;
use crate::output_host;
use crate::source_guard;

/// 受控夹具的内容。探针页从 URL 拿到期望值，与实际读到的内容逐字比对。
pub const FIXTURE_CONTENT: &str = "MF-PROBE-FIXTURE-20261103";

/// 探针页在仓库中的路径。由开发服务器提供，与生产前端同源，不放宽生产 CSP。
const PROBE_PAGE_PATH: &str = "/tests/fixtures/architecture/pdf-probe-client.html";

/// 冻结样本的归档原件路径（按配置给的相对路径，按当前目录解析）。
///
/// **必须加载归档原件，不能走 dev server**：dev server 会往 HTML 里注入
/// react-refresh 前导与 vite client，注入后的字节与被记录了 SHA-256 的原件不是同一份
/// （实测 d09bc77b… vs 78aff00c…），打印出来的就不是那个被登记的产物。
///
/// 找不到原件就跳过就绪探测 ✓：没有原件就没有那份产物 ✓，探测出来的分页度量
/// 不是被登记的那份的 ✓ —— 那样的数字是假的 ✓。
fn frozen_sample_path(config: &Config, cwd: &Path) -> Option<PathBuf> {
    let path = config::resolve(cwd, &config.probe.sample);
    if path.is_file() {
        Some(path)
    } else {
        None
    }
}

/// 静默 PDF 的输出目标路径（按配置给的相对路径，按当前目录解析）。
fn pdf_output_path(config: &Config, cwd: &Path) -> PathBuf {
    config::resolve(cwd, &config.probe.pdf_output)
}

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
pub fn run(
    app: &tauri::AppHandle,
    config: &Config,
    cwd: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    match assemble(app, config, cwd) {
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
fn assemble(app: &tauri::AppHandle, config: &Config, cwd: &Path) -> Result<(), ProbeError> {
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
    let url = probe_url(
        app,
        &read_grant.key,
        &write_grant.key,
        config.probe.product_print,
    )?;

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
    // 配置与当前目录进线程：线程要活过 setup ✓，借用活不到那里 ✓ —— 各带一份 ✓。
    let config = config.clone();
    let cwd = cwd.to_path_buf();
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
        // 页面报告由 Rust 读回：这是 **native 侧对页面结果的读数**，内容仍是页面自述。
        //
        // **不以导航的 URL 比较为前提**：那个比较是脆的（探针页的 URL 带查询串 ✓），
        // 误判为"没导航"就会连报告一起丢掉。故一律读——页面真没起来的话，
        // 读报告会等到超时，正好也是一条证据（"页面没就位" ✓）。
        let mut main_report_read = false;
        // 两个护栏都来自配置 ✓（不再是环境变量 ✓）：给的不是正整数就按默认值走 ✓。
        let ready_timeout = Duration::from_secs(config.probe.page_ready_timeout_seconds);
        let total_timeout = Duration::from_secs(config.probe.report_timeout_seconds);
        if let Some(window) = &main_window {
            if let Some(report) = read_report(window, ready_timeout, total_timeout, "main") {
                log_observed_report("main", &report);
                main_report_read = true;
            }
        }
        if let Some(window) = &output_window {
            if let Some(report) = read_report(window, ready_timeout, total_timeout, "output") {
                log_observed_report("output", &report);
            }
        }

        // 探针没就位时把主窗口导回初始页——探针失败不该把应用留在坏页面上。
        // 判据用"主窗口的报告读到没有" ✓，不用导航的 URL 比较 ✓。
        if !main_report_read {
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

        // 就绪探测：打印宿主载的就是**归档原件**，用原生 eval 读它的 DOM。
        // 这是 D1c-1 的就绪判据原型，也是 TBD-11 的决定性验证：
        // 原生受控脚本执行若不受冻结样本的 CSP 约束，就能读到页面盒、字体与图片状态。
        // 探针页的证据已在此之前读完，导航走不影响。
        // D1c：就绪后静默打印，输出到目标同目录的临时文件，再 rename 提交。
        // 失败时原文件保持不变：目标只在最后那一步被 rename 触及。
        match frozen_sample_path(&config, &cwd) {
            Some(sample) => {
                let target = pdf_output_path(&config, &cwd);
                match pdf_print::print_document_to_pdf(&handle, &sample, &target) {
                    Ok(outcome) => {
                        tracing::info!(
                            event = "probe_readiness",
                            host = "print",
                            eval_ok = outcome.readiness.eval_ok,
                            is_expected_document = outcome.readiness.is_expected_document,
                            ready = outcome.readiness.ready,
                            ready_state = outcome.readiness.ready_state.as_str(),
                            fonts_status = outcome.readiness.fonts_status.as_str(),
                            page_box_count = outcome.readiness.page_box_count,
                            first_page_box_size = outcome.readiness.first_page_box_size.as_str(),
                            images_total = outcome.readiness.images_total,
                            images_loaded = outcome.readiness.images_loaded,
                            title = outcome.readiness.title.as_str(),
                        );
                        tracing::info!(
                            event = "probe_pdf",
                            ok = outcome.ok,
                            bytes = outcome.bytes,
                            elapsed_ms = outcome.elapsed_ms,
                            committed = outcome.committed,
                            pdf_sha256 = outcome.pdf_sha256.as_str(),
                            // 清理的结果也是**实测的** ✓：提交要么改名成目标 ✓，
                            // 要么删掉它 ✓，删不掉是有可能的 ✓（文件被占着 ✓）。
                            pdf_temp_removed = outcome.pdf_temp_removed,
                        );
                    }
                    Err(failure) => {
                        tracing::info!(
                            event = "probe_readiness",
                            host = "print",
                            eval_ok = failure.readiness.eval_ok,
                            is_expected_document = failure.readiness.is_expected_document,
                            ready = failure.readiness.ready,
                            ready_state = failure.readiness.ready_state.as_str(),
                            fonts_status = failure.readiness.fonts_status.as_str(),
                            page_box_count = failure.readiness.page_box_count,
                            first_page_box_size = failure.readiness.first_page_box_size.as_str(),
                            images_total = failure.readiness.images_total,
                            images_loaded = failure.readiness.images_loaded,
                            title = failure.readiness.title.as_str(),
                        );
                        tracing::warn!(
                            event = "probe_pdf",
                            ok = false,
                            reason = failure.reason.as_str(),
                            pdf_temp_exists = failure.pdf_temp_exists,
                            pdf_temp_bytes = failure.pdf_temp_bytes,
                            target_dir_exists = failure.target_dir_exists,
                            // **清理的结果也留证** ✓：冻结清单要"超时 → 删除" ✓，
                            // 而日志证明不了删没删掉 ✓（文件被占着就删不掉 ✓）。
                            pdf_temp_removed = failure.pdf_temp_removed,
                        );
                    }
                }
            }
            _ => {
                tracing::warn!(
                    event = "probe_pdf",
                    ok = false,
                    reason = "受控样本不可用",
                );
            }
        }

        // 探针专用宿主用完即关：**丢掉 Rust 句柄不等于关窗**（窗口仍在应用的窗口表里），
        // 残留的隐藏宿主就是 D1c-4「无残留宿主」不成立的原因。主窗口是应用自己的，不关。
        for host in [&output_window].into_iter().flatten() {
            let _ = host.close();
        }

        // 探针跑完把主窗口导回应用自己的页面：探针是测试路径，不该把用户留在探针页上。
        // 报告已在此之前读完，导回不影响证据。
        let app_restored = match (&main_window, &initial_target) {
            (Some(window), Some(target)) => window.navigate(target.clone()).is_ok(),
            _ => false,
        };

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
            app_restored = app_restored,
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
    // 产品形态打印的结果（D7-1 的验收证据 ✓）：回执或取消标记 ✓。
    let product_print = value
        .get("productPrint")
        .map(|entry| match entry {
            serde_json::Value::String(text) => text.clone(),
            other => other.to_string(),
        })
        .unwrap_or_default();
    tracing::info!(
        event = "page_report_observed",
        host,
        product_print = product_print.as_str(),
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
    product_print: bool,
) -> Result<Url, ProbeError> {
    let origin = app
        .config()
        .build
        .dev_url
        .clone()
        .ok_or(ProbeError::NoAppOrigin)?;
    Ok(probe_url_from(origin, read_key, write_key, product_print))
}

/// 由应用源构造探针页 URL：路径换成探针页，查询串带两份 key 与期望内容。
///
/// 纯函数：源的路径与查询串一律被替换，不从源里继承任何内容 ✓；
/// **产品形态打印这个开关是参数** ✓，不是读环境得来的 ✓ —— 环境是隐式输入 ✓，
/// 读它的地方一旦被别处的环境污染 ✓，单测就红 ✓（交付宿主上就红过一次 ✓）。
fn probe_url_from(
    mut origin: Url,
    read_key: &str,
    write_key: &str,
    product_print: bool,
) -> Url {
    origin.set_path(PROBE_PAGE_PATH);
    // 产品形态的打印（D7-1 的验收驱动）默认不做 ✓：它要人在原生保存对话框里选目标 ✓，
    // 会打断探针页其余步骤 ✓。要不要做由配置说了算 ✓。
    let product_print = if product_print { "&productPrint=1" } else { "" };
    origin.set_query(Some(&format!(
        "readKey={}&writeKey={}&expect={}{}",
        read_key,
        write_key,
        FIXTURE_CONTENT,
        product_print
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
        // **URL 不是 about:blank 不等于页面加载完了**：初次加载还在进行时导航会被覆盖
        // （交付宿主上就是这样丢了探针页）。故还要等文档真的完成。
        if current != "about:blank" && !current.is_empty() && document_is_complete(window) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

/// 文档是否已加载完成（`document.readyState === 'complete'`）。
///
/// 宿主发起的求值不受页面 CSP 约束，故探针页与冻结样本都能这样读。
fn document_is_complete(window: &tauri::WebviewWindow) -> bool {
    let (sender, receiver) = mpsc::channel();
    if window
        .eval_with_callback("document.readyState", move |value| {
            let _ = sender.send(value);
        })
        .is_err()
    {
        return false;
    }
    matches!(receiver.recv_timeout(Duration::from_millis(800)), Ok(value) if value.contains("complete"))
}

/// 读取探针页写在 DOM 里的报告，等到它标记完成或超时。
///
/// **两个界，都是探针层的护栏，不是需求** ✓：见 `PAGE_READY_TIMEOUT` 与 `REPORT_TIMEOUT` ✓。
///
/// 放弃时记的 `phase` 说明是哪个界先到的 ✓：
/// `page_ready` = 页面压根没产出读数 ✓（页面没就位 ✓），
/// `report` = 页面有读数但没标记完成 ✓。
fn read_report(
    window: &tauri::WebviewWindow,
    ready_timeout: Duration,
    total_timeout: Duration,
    host: &str,
) -> Option<String> {
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
    let started = Instant::now();
    let ready_deadline = started + ready_timeout;
    let total_deadline = started + total_timeout;
    let mut printed = false;
    // 页面有没有产出读数 ✓：没有就是"页面没就位" ✓。
    let mut spoke = false;
    loop {
        let now = Instant::now();
        if now >= total_deadline {
            tracing::warn!(
                event = "probe_report_timeout",
                host = host,
                phase = if spoke { "report" } else { "page_ready" },
                ready_timeout_ms = ready_timeout.as_millis(),
                total_timeout_ms = total_timeout.as_millis(),
                reason = "探针页未在期限内标记完成",
            );
            return None;
        }
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
        if !spoke && has_reading(&raw) {
            spoke = true;
        }
        // 启动护栏：页面在期限内一个字都没说，就是"页面没就位" ✓。
        if !spoke && now >= ready_deadline {
            tracing::warn!(
                event = "probe_report_timeout",
                host = host,
                phase = "page_ready",
                ready_timeout_ms = ready_timeout.as_millis(),
                total_timeout_ms = total_timeout.as_millis(),
                reason = "探针页未就位：期限内没有产出任何读数",
            );
            return None;
        }
        if raw.contains("\"done\"") {
            return Some(raw);
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// 页面有没有产出读数。
///
/// eval 的结果被序列化成 JSON 文本 ✓：报告元素不在时是 `""` ✓，
/// 报告还是初始空壳时是 `{}` ✓——两者都算"还没产出读数" ✓。
/// 有的平台给的是未经序列化的原样文本 ✓，故引号一并剥掉 ✓。
fn has_reading(raw: &str) -> bool {
    let trimmed = raw.trim();
    let bare = trimmed.trim_matches('"');
    !bare.is_empty() && bare != "{}"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_probe_url_replaces_the_path_and_the_query_of_the_origin() {
        let origin = Url::parse("http://127.0.0.1:3000/app/index.html?stale=1").unwrap();
        let url = probe_url_from(origin, "read-key", "write-key", false);
        assert_eq!(url.path(), PROBE_PAGE_PATH);
        assert_eq!(url.host_str(), Some("127.0.0.1"));
        assert_eq!(url.port(), Some(3000));
        assert_eq!(
            url.query(),
            Some("readKey=read-key&writeKey=write-key&expect=MF-PROBE-FIXTURE-20261103")
        );
    }

    #[test]
    fn the_product_print_switch_is_a_parameter_and_not_an_ambient_one() {
        // 开关是参数 ✓：环境里有没有那个变量都一样 ✓。
        // 交付宿主上就因为环境里留着上一轮的值而红过一次 ✓。
        let origin = Url::parse("http://127.0.0.1:3000/app/index.html").unwrap();
        let url = probe_url_from(origin, "read-key", "write-key", true);
        assert_eq!(
            url.query(),
            Some("readKey=read-key&writeKey=write-key&expect=MF-PROBE-FIXTURE-20261103&productPrint=1")
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
