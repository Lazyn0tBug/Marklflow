mod config;
mod files;
mod hash;
mod logging;
mod output_host;
// 静默打印：**生产构建的一部分** ✓（M9 接入 ✓）—— Windows 走 COM ✓，
// 其它平台在 `files.rs` 那侧明说没有这个能力 ✓ ✓。
// 探针复用同一份实现 ✓ —— 不再另建一份 ✓。
#[cfg(target_os = "windows")]
mod print_com;
#[cfg(target_os = "windows")]
mod print_host;
// **死代码随平台与特性各占一半** ✓：
// - 探针读的那部分（就绪读数 ✓、产物的读数 ✓、受控打印 ✓）在**默认构建**里没人读 ✓；
// - 生产读的那部分（静默打印 ✓、HTML 暂存 ✓）在**非 Windows** 上没人读 ✓（静默打印是 Windows 专属 ✓）。
// 只有「Windows + 带探针特性」这一种形状里两边都在用 ✓ —— 其余三种各有一半是死的 ✓。
// 故除那一种之外放过死代码告警 ✓；那一种照常被 lint ✓ ✓（它才是真正全用上的形状 ✓ ✓）。
#[cfg_attr(not(all(target_os = "windows", feature = "pdf-probe")), allow(dead_code))]
mod pdf_print;
mod source_guard;
#[cfg(feature = "pdf-probe")]
mod probe;
use serde::Serialize;
use tauri::{Emitter,Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    os: &'static str,
    arch: &'static str,
    version: &'static str,
    window_label: String,
    webview_label: String,
}

/// 平台信息兼作调用方身份回报：窗口与 webview 的 label 配对由原生注入取出。
/// 该命令不受来源守卫限制（它不碰文件、对话框与授权），但承担 D1a-6 的身份回报职责。
#[tauri::command]
fn get_platform_info(webview: tauri::Webview) -> PlatformInfo {
    let identity = source_guard::Identity::from_labels(webview.window().label(), webview.label());
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        version: env!("CARGO_PKG_VERSION"),
        window_label: identity.window_label.into_owned(),
        webview_label: identity.webview_label.into_owned(),
    }
}

/// 运行期配置里前端要知道的那些 ✓。
///
/// **只报应用自己的配置** ✓（不碰文件 ✓、不碰授权 ✓）✓，所以不受来源守卫管 ✓ ——
/// 与 `get_platform_info` 同类 ✓ ✓。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePrefs {
    /// 导出的根：`web` 或 `native` ✓。
    export_root: &'static str,
    /// 这个平台有没有静默 PDF 的能力 ✓（Windows 之外没有 ✓）。
    native_pdf_available: bool,
}

/// 取运行期配置里前端要知道的那些 ✓。
#[tauri::command]
fn get_runtime_prefs() -> RuntimePrefs {
    RuntimePrefs {
        export_root: config::config().export.effective_root(),
        native_pdf_available: cfg!(target_os = "windows"),
    }
}

/// web 侧日志回传：**只写日志，不铸任何授权**。
///
/// 这是方案 §4 的 L2：命令只把事件写进日志，不碰 `FileAccess`，发不出任何能力。
/// 返回稳定结果（accepted／dropped／rejected）：accepted 只表示已校验并入队，不表示已落盘。
#[tauri::command]
fn log_event(webview: tauri::Webview, payload: String) -> Result<String, String> {
    Ok(logging::record_web_event(&webview, payload).to_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(files::FileAccess::default())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            log_event,
            get_runtime_prefs,
            files::select_native_open,
            files::select_native_save,
            files::read_native_text,
            files::print_native_pdf,
            files::write_native_bytes,
            files::write_native_sync,
            files::detect_native_target,
            files::is_native_same_directory,
            files::is_native_target_present,
            files::release_native_file
        ]);
    // 日志基座在业务事件之前就位：守卫判定属安全事件，任何构建都该留痕。
    // 受控探针只在 pdf-probe feature 下装配；默认构建里没有这条路径。
    let builder = builder.setup(|_app| {
        // **当前目录是运行期的根** ✓：配置从这儿读 ✓，日志落在这儿 ✓，
        // 配置里的相对路径也按这儿解析 ✓ —— 一个根 ✓，不留第二个答案 ✓。
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let (loaded, source) = config::load(&cwd);
        config::set_config(loaded);
        let config = config::config();
        logging::init(&config.log, source, feature_name());
        // 探针要用应用句柄 ✓；默认构建里没有探针 ✓，句柄也就没人要 ✓。
        #[cfg(feature = "pdf-probe")]
        probe::run(_app.handle(), config, &cwd)?;
        Ok(())
    });
    // 拖放进来的文件：与选择器同一套授权与身份 ✓（§5.4）。
    // 事件只带授权与身份，不带路径 ✓；页面不能凭它反推路径 ✓。
    let builder = builder.on_window_event(|window, event| {
        let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event else {
            return;
        };
        // 只认主窗口：探针的输出宿主不是落文档的地方 ✓。
        if window.label() != "main" {
            return;
        }
        let access = window.state::<files::FileAccess>();
        let dropped = files::grant_dropped(paths.clone(), &access);
        if dropped.is_empty() {
            return;
        }
        let _ = window.emit("native-files-dropped", files::DroppedFiles { files: dropped });
    });
    builder
        .build(tauri::generate_context!())
        .expect("error while building MarkFlow application")
        .run(|_app, event| {
            // Tauri exits the process after the event loop; code after run is not reached.
            // Exit is final, unlike ExitRequested which may still be cancelled.
            if matches!(event, tauri::RunEvent::Exit) {
                logging::shutdown(feature_name());
            }
        });
}

/// 本次构建的探针特征名（记进运行标记）。
fn feature_name() -> &'static str {
    if cfg!(feature = "pdf-probe") {
        "pdf-probe"
    } else {
        "default"
    }
}
