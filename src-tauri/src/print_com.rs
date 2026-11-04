//! 静默 PDF 输出的 COM 部分（Windows 专属）。
//!
//! 与 tauri 无关，故可被独立的交叉编译夹具直接编译验证
//! （见 `scripts/check-windows-com.ts` 的说明）。调用方负责取到控制器与环境。
//!
//! 与"打印"相关的两个事实：
//!
//! - **无对话框、无打印面板**：`PrintToPdf` 是静默接口，输出路径由我们给，
//!   用户看不到任何 UI。这正是 D1c-5 要的性质。
//! - **完成是异步回调**：错误与成功标志经 `ICoreWebView2PrintToPdfCompletedHandler`
//!   送达。**超时即失败**：迟到回调不得改写回执。

use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_7, ICoreWebView2Controller, ICoreWebView2Environment,
    ICoreWebView2Environment6, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
};
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, PCWSTR};

/// 打印的等待上限。超时即失败——迟到回调不得报成功。
const PRINT_TIMEOUT: Duration = Duration::from_secs(60);

/// "发起"阶段的等待上限：UI 线程把接收端送回来要不了这么久。
const SETUP_TIMEOUT: Duration = Duration::from_secs(30);

/// A4 的页面尺寸（英寸）。WebView2 的打印设置以英寸计。
const A4_WIDTH_IN: f64 = 210.0 / 25.4;
const A4_HEIGHT_IN: f64 = 297.0 / 25.4;

/// 打印结果：是否成功、产出字节数、耗时。
#[derive(Debug, Clone, Copy)]
pub struct ComPrintOutcome {
    pub ok: bool,
    pub bytes: u64,
    pub elapsed_ms: u128,
}

/// 完成回调的结果：错误（已是 `Result<(), Error>`）与成功标志。
///
/// **这是回调的载荷** ✓，不是打印的结果 ✓ —— 打印的结果是 `ComPrintOutcome` ✓
/// （多了提交与清理的读数 ✓）。名字短是因为它只在 COM 这一层用 ✓。
pub type PrintResult = Result<(windows::core::Result<()>, bool), String>;

/// **在 UI 线程发起**打印，返回完成结果的接收端。
///
/// COM 调用必须发生在 UI 线程（COM 对象线程亲和），故调用方须在 UI 线程调用本函数。
/// 本函数**不等待**：完成回调也在 UI 线程触发，若在此处等待就是自己等自己（死锁）。
/// 等待由 [`finish_print`] 在另一个线程完成。
pub fn start_print(
    controller: ICoreWebView2Controller,
    environment: ICoreWebView2Environment,
    target: &Path,
) -> Result<mpsc::Receiver<PrintResult>, String> {
    // 完成回调的第一个参数已经是 `Result<(), Error>`（HRESULT 在转换层就转过了），
    // 错误与成功标志一起到手。
    let (sender, receiver) = mpsc::channel::<PrintResult>();
    // 路径转宽字符串：必须活过 PrintToPdf 调用。
    //
    // **用 `encode_wide`，不用 `to_string_lossy` + `encode_utf16`** ✓：
    // Windows 的路径本来就是 UTF-16 ✓，而 `to_string_lossy` 会把**不配对的代理对**
    // 换成 U+FFFD ✓ —— 那是**合法但罕见**的 Windows 路径 ✓，
    // 转过去就成了**另一个路径** ✓（COM 会写到别处去 ✓）。
    // 这一层是 Windows 专属的 ✓（本模块只编在 Windows 上 ✓）✓，
    // 所以直接用 Windows 那套 API ✓，不必绕一圈 UTF-8 ✓。
    let wide: Vec<u16> = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let attempt = (|| -> Result<(), String> {
        let webview2 = unsafe { controller.CoreWebView2() }.map_err(|e| e.to_string())?;
        let webview7 = webview2.cast::<ICoreWebView2_7>().map_err(|e| e.to_string())?;
        let environment6 = environment
            .cast::<ICoreWebView2Environment6>()
            .map_err(|e| e.to_string())?;
        let settings = unsafe { environment6.CreatePrintSettings() }.map_err(|e| e.to_string())?;
        // 打印设置必须显式钉死：冻结样本有两条 @page 规则（A4 与 letter），
        // 不钉死则 PDF 页面尺寸与 HTML 页面盒对不上。
        unsafe {
            settings.SetPageWidth(A4_WIDTH_IN).map_err(|e| e.to_string())?;
            settings.SetPageHeight(A4_HEIGHT_IN).map_err(|e| e.to_string())?;
            settings.SetMarginTop(0.0).map_err(|e| e.to_string())?;
            settings.SetMarginBottom(0.0).map_err(|e| e.to_string())?;
            settings.SetMarginLeft(0.0).map_err(|e| e.to_string())?;
            settings.SetMarginRight(0.0).map_err(|e| e.to_string())?;
            settings
                .SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)
                .map_err(|e| e.to_string())?;
            // 背景：样本里唯一的 CSS 背景是裁切标记，正文图片是 <img>、
            // 公式是内联 <svg>，都不依赖背景——开着它才保住裁切标记。
            settings.SetShouldPrintBackgrounds(true).map_err(|e| e.to_string())?;
            settings
                .SetShouldPrintHeaderAndFooter(false)
                .map_err(|e| e.to_string())?;
        }
        // 发送端要留一份给错误路径：闭包拿走的是克隆。
        let handler_sender = sender.clone();
        let handler = PrintToPdfCompletedHandler::create(Box::new(move |code, ok| {
            let _ = handler_sender.send(Ok((code, ok)));
            Ok(())
        }));
        unsafe {
            webview7
                .PrintToPdf(PCWSTR(wide.as_ptr()), &settings, &handler)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })();
    if let Err(error) = attempt {
        let _ = sender.send(Err(error));
    }
    Ok(receiver)
}

/// 发起并等待打印。
///
/// `dispatch` 被调用一次，它负责在 **UI 线程**上真正发起（取控制器与环境、调用
/// `PrintToPdf`），并把"完成结果的接收端"经 `setup_sender` 送回来。
///
/// **路径由本函数拥有一份**再交给 `dispatch`：`dispatch` 往往是 `'static` 的闭包
/// （`with_webview` 要求如此），借用函数参数会编译不过——borrowed data escapes。
/// 路径在这里转成 `PathBuf` 交出去，闭包便能真正拥有它。
///
/// 等待在**当前线程**完成（通常是后台线程）：完成回调在 UI 线程触发，
/// 在 UI 线程上等就是自己等自己。
pub fn print_dispatch(
    target: &Path,
    dispatch: impl FnOnce(
            PathBuf,
            mpsc::Sender<Result<mpsc::Receiver<PrintResult>, String>>,
        ) -> Result<(), String>
        + Send
        + 'static,
) -> Result<ComPrintOutcome, String> {
    let started = Instant::now();
    let owned = target.to_path_buf();
    let (setup_sender, setup_receiver) =
        mpsc::channel::<Result<mpsc::Receiver<PrintResult>, String>>();
    dispatch(owned, setup_sender)?;
    let receiver = match setup_receiver.recv_timeout(SETUP_TIMEOUT) {
        Ok(Ok(receiver)) => receiver,
        Ok(Err(error)) => return Err(error),
        Err(_) => return Err("打印未发起：与 UI 线程的调度中断".to_owned()),
    };
    finish_print(receiver, target, started)
}

/// 等打印完成（**后台线程**调用）。超时即失败：迟到回调不得报成功。
pub fn finish_print(
    receiver: mpsc::Receiver<PrintResult>,
    target: &Path,
    started: Instant,
) -> Result<ComPrintOutcome, String> {
    match receiver.recv_timeout(PRINT_TIMEOUT) {
        Ok(Ok((code, ok))) => {
            if code.is_ok() && ok {
                let bytes = std::fs::metadata(target).map(|meta| meta.len()).unwrap_or(0);
                Ok(ComPrintOutcome {
                    ok: true,
                    bytes,
                    elapsed_ms: started.elapsed().as_millis(),
                })
            } else {
                Err(format!("打印未成功：{code:?}，成功标志 {ok}"))
            }
        }
        Ok(Err(error)) => Err(error),
        Err(_) => Err("打印超时：原生完成回调未在期限内送达".to_owned()),
    }
}
