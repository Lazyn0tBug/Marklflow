//! 静默 PDF 输出的宿主侧（把窗口接到 COM 打印上）。
//!
//! COM 部分在 [`crate::print_com`]（Windows 专属，与 tauri 无关，可被交叉编译夹具验证）；
//! 编排部分在 [`crate::pdf_print`]（隐藏宿主、就绪探测、临时提交）。**本模块只做一件事**：
//! 从 Tauri 的窗口取到 WebView2 的控制器与环境，并把它交给 COM 编排 ✓。
//!
//! **两步不可颠倒** ✓：发起在 UI 线程（COM 亲和）✓，等待在后台线程（完成回调也在 UI 线程 ✓，
//! 在 UI 线程上等就是自己等自己 ✓）。

use std::path::Path;

/// 把窗口里的当前页面静默打印到 `target`。
///
/// 失败时给出可诊断的原因（错误码、超时），不吞错 ✓。
pub fn print_to_pdf(
    window: &tauri::WebviewWindow,
    target: &Path,
) -> Result<crate::print_com::PrintOutcome, String> {
    // 窗口句柄得**拥有**一份 ✓：`with_webview` 的闭包是 `'static` 的 ✓（借用会逃逸 ✓）。
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
