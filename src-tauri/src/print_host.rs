//! 静默 PDF 输出的宿主侧（把窗口接到 COM 打印上）。
//!
//! COM 部分在 [`crate::print_com`]（Windows 专属，与 tauri 无关，可被交叉编译夹具验证）；
//! 本模块负责从 Tauri 的窗口取到 WebView2 的控制器与环境，并调度到 UI 线程。
//!
//! **两步不可颠倒**：发起在 UI 线程（COM 亲和），等待在后台线程（完成回调也在 UI 线程，
//! 在 UI 线程上等就是自己等自己）。

use std::path::Path;
#[cfg(target_os = "windows")]
use std::sync::mpsc;
#[cfg(target_os = "windows")]
use std::time::Instant;

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
pub fn print_to_pdf(
    window: &tauri::WebviewWindow,
    target: &Path,
) -> Result<crate::print_com::PrintOutcome, String> {
    let started = Instant::now();
    // 发起阶段的结果也要穿过 UI 线程：with_webview 的闭包只能返回 ()。
    let (setup_sender, setup_receiver) =
        mpsc::channel::<Result<mpsc::Receiver<crate::print_com::PrintResult>, String>>();
    window
        .with_webview(move |platform| {
            let attempt = crate::print_com::start_print(
                platform.controller(),
                platform.environment(),
                target,
            );
            let _ = setup_sender.send(attempt);
        })
        .map_err(|e| e.to_string())?;
    let receiver = match setup_receiver.recv_timeout(std::time::Duration::from_secs(30)) {
        Ok(Ok(receiver)) => receiver,
        Ok(Err(error)) => return Err(error),
        Err(_) => return Err("打印未发起：与 UI 线程的调度中断".to_owned()),
    };
    crate::print_com::finish_print(receiver, target, started)
}

/// 非 Windows 平台没有 WebView2，也就没有静默打印能力。
#[cfg(not(target_os = "windows"))]
pub fn print_to_pdf(
    _window: &tauri::WebviewWindow,
    _target: &Path,
) -> Result<PrintOutcome, String> {
    Err("静默 PDF 输出只支持 Windows（依赖 WebView2 的 PrintToPdf）".to_owned())
}
