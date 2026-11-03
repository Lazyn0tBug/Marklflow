//! 受控探针装配（仅 `pdf-probe` feature，默认关闭）。
//!
//! 受控授权**不经 IPC** 铸造：`invoke_handler` 不变，不新增前端铸造命令，也不新增 IPC 通道。
//! 授权复用生产侧 `FileAccess` 的既有形态（path + writable + UUID key），
//! key 经探针页 URL 的查询串交付，探针页从 `location.search` 取。
//!
//! 装配后的两个载体：
//! - 主窗口被导航到探针页，其身份仍是 ("main","main")，在允许范围内；
//! - 输出宿主承载同一个探针页，其身份是 ("pdf-output","pdf-output")，不在允许范围内。
//! 两者的差别只有身份，因此允许与拒绝的证据出自同一条生产路径。

use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use tauri::{Manager, Url, WebviewUrl};

use crate::files::FileAccess;
use crate::output_host;

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

    // 主窗口导航到探针页：身份仍是 ("main","main")，在允许范围内。
    let main = app.get_webview_window("main").ok_or("缺少主窗口")?;
    main.navigate(url.clone())?;

    // 输出宿主承载同一个探针页：身份是 ("pdf-output","pdf-output")，不在允许范围内。
    let output = output_host::create(app, WebviewUrl::External(url.clone()))?;
    let output_label = output.label().to_owned();

    // 事件循环在 setup 钩子返回之后才启动：eval 的回调要经事件循环送达，
    // 因此报告读取必须放到后台线程，否则在 setup 里读会一直等到超时。
    let handle = app.clone();
    let read_key = read_grant.key.clone();
    let write_key = write_grant.key.clone();
    let fixture_dir = fixture_dir;
    std::thread::spawn(move || {
        let main_window = handle.get_webview_window("main");
        let output_window = handle.get_webview_window(&output_label);
        let mut navigated = false;
        if let Some(window) = &main_window {
            wait_page_ready(window, Duration::from_secs(30));
            // 只在探针页还没就位时导航：重复导航会让探针页跑第二遍，
            // 而第一遍已经撤销了受控授权，第二遍的读取就会拿到 unknown-file-key。
            if window.url().map(|current| current == url).unwrap_or(false) {
                navigated = true;
            } else {
                for _ in 0..5 {
                    if window.navigate(url.clone()).is_ok() {
                        std::thread::sleep(Duration::from_millis(700));
                        if window.url().map(|current| current == url).unwrap_or(false) {
                            navigated = true;
                            break;
                        }
                    }
                }
            }
        }
        println!(
            "PDF-PROBE navigation navigated={navigated} main_url={}",
            main_window
                .as_ref()
                .and_then(|window| window.url().ok())
                .map(|value| value.to_string())
                .unwrap_or_default()
        );

        let main_report = main_window.as_ref().and_then(|window| read_report(window, REPORT_TIMEOUT));
        let output_report = output_window.as_ref().and_then(|window| read_report(window, REPORT_TIMEOUT));
        println!("PDF-PROBE main {}", main_report.clone().unwrap_or_default());
        println!("PDF-PROBE output {}", output_report.clone().unwrap_or_default());
        println!(
            "PDF-PROBE output_host label={output_label} instances={}",
            output_host::instance_count()
        );

        // 探针专用回收：撤销两份受控授权。正常 release_native_file 的业务清理不受影响。
        let access = handle.state::<FileAccess>();
        access.revoke(&read_key);
        access.revoke(&write_key);
        println!(
            "PDF-PROBE cleanup revoked read={read_key} write={write_key} fixture_removed_on_drop=true"
        );
        drop(fixture_dir);
    });

    Ok(())
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

/// 等页面的初始加载就绪。
fn wait_page_ready(window: &tauri::WebviewWindow, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let (sender, receiver) = mpsc::channel();
        if window
            .eval_with_callback("document.readyState", move |value| {
                let _ = sender.send(value);
            })
            .is_err()
        {
            return false;
        }
        if let Ok(raw) = receiver.recv_timeout(Duration::from_millis(800)) {
            if raw.contains("complete") {
                return true;
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

/// 读取探针页写在 DOM 里的报告，等到它标记完成或超时。
fn read_report(window: &tauri::WebviewWindow, timeout: Duration) -> Option<String> {
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
            println!("PDF-PROBE eval raw={raw:?}");
            printed = true;
        }
        if raw.contains("\"done\"") {
            return Some(raw);
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    None
}
