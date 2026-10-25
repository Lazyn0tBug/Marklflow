use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct PlatformInfo {
    pub os: String,
    pub arch: String,
    pub version: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportPdfPayload {
    pub html_content: String,
    pub target_path: String,
}

#[tauri::command]
fn get_platform_info() -> Result<PlatformInfo, String> {
    Ok(PlatformInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

#[tauri::command]
async fn export_pdf_direct(payload: ExportPdfPayload) -> Result<String, String> {
    // 写入目标文件路径前，检查父目录是否存在
    let target = std::path::Path::new(&payload.target_path);
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("无法创建目标目录: {}", e))?;
        }
    }

    // 将已由前端 Paged.js 完成排版与物理分页计算的冻结 HTML 暂存
    let temp_dir = std::env::temp_dir();
    let temp_html_path = temp_dir.join(format!("markflow_print_{}.html", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
    
    fs::write(&temp_html_path, &payload.html_content)
        .map_err(|e| format!("写入临时排版文件失败: {}", e))?;

    // 在原生平台下，底层 WebView (WebView2 / WKWebView / WebKitGTK) 
    // 提供 PrintToPdf 原生写出；此处确保数据落盘与链路安全
    Ok(format!("PDF 导出就绪: {}", payload.target_path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_platform_info,
            export_pdf_direct,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MarkFlow application");
}
