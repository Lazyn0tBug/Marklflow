//! 静默 PDF 输出的宿主侧（把窗口接到 COM 打印上）。
//!
//! COM 部分与编排部分都在 [`crate::print_com`]（Windows 专属，与 tauri 无关，
//! 可被交叉编译夹具验证）；本模块只负责从 Tauri 的窗口取到 WebView2 的
//! 控制器与环境，并把它交给编排。
//!
//! **两步不可颠倒**：发起在 UI 线程（COM 亲和），等待在后台线程（完成回调也在 UI 线程，
//! 在 UI 线程上等就是自己等自己）。

use std::path::Path;

#[cfg(target_os = "windows")]
pub use crate::print_com::PrintOutcome;

/// 非 Windows 平台没有打印结果可言（只有失败），故这个形状只服务于类型一致。
#[cfg(not(target_os = "windows"))]
#[allow(dead_code)]
#[derive(Debug, Clone, Copy)]
pub struct PrintOutcome {
    pub ok: bool,
    pub bytes: u64,
    pub elapsed_ms: u128,
}

/// 把窗口里的当前页面静默打印到 `target`。
///
/// 失败时给出可诊断的原因（错误码、超时、平台不支持），不吞错。
#[cfg(target_os = "windows")]
pub fn print_to_pdf(window: &tauri::WebviewWindow, target: &Path) -> Result<PrintOutcome, String> {
    // 窗口句柄得**拥有**一份：`with_webview` 的闭包是 `'static` 的。
    let window = window.clone();
    crate::print_com::print_dispatch(target, move |path, setup_sender| {
        window
            .with_webview(move |platform| {
                let attempt = crate::print_com::start_print(
                    platform.controller(),
                    platform.environment(),
                    &path,
                );
                let _ = setup_sender.send(attempt);
            })
            .map_err(|e| e.to_string())
    })
}

/// 非 Windows 平台没有 WebView2，也就没有静默打印能力。
#[cfg(not(target_os = "windows"))]
pub fn print_to_pdf(
    _window: &tauri::WebviewWindow,
    _target: &Path,
) -> Result<PrintOutcome, String> {
    Err("静默 PDF 输出只支持 Windows（依赖 WebView2 的 PrintToPdf）".to_owned())
}
