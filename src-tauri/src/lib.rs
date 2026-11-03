mod files;
mod output_host;
mod source_guard;
#[cfg(feature = "pdf-probe")]
mod probe;
use serde::Serialize;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(files::FileAccess::default())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            files::select_native_open,
            files::select_native_save,
            files::read_native_text,
            files::write_native_bytes,
            files::release_native_file
        ]);
    // 受控探针只在 pdf-probe feature 下装配；默认构建里没有这条路径。
    #[cfg(feature = "pdf-probe")]
    let builder = builder.setup(|app| {
        probe::run(app.handle())?;
        Ok(())
    });
    builder
        .run(tauri::generate_context!())
        .expect("error while running MarkFlow application");
}
