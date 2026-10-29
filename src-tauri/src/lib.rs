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
        .invoke_handler(tauri::generate_handler![get_platform_info])
        .run(tauri::generate_context!())
        .expect("error while running MarkFlow application");
}
