mod files;
use serde::Serialize;

#[derive(Serialize)]
pub struct PlatformInfo {
    os: &'static str,
    arch: &'static str,
    version: &'static str,
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        version: env!("CARGO_PKG_VERSION"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(files::FileAccess::default())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            files::select_native_open,
            files::select_native_save,
            files::read_native_text,
            files::write_native_bytes,
            files::release_native_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkFlow application");
}
