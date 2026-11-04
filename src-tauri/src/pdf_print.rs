//! 静默 PDF 打印的复用机制。
//!
//! 一条路径：**隐藏宿主载文档 → 原生读就绪 → COM `PrintToPdf` → 同目录临时文件 → rename 提交**。
//! 探针（D1 的 PoC）与产品形态入口都走它，不重建 PoC（D7 边界 ✓）。
//!
//! 三条规格（D7 差异冻结清单 §3—§5）：
//!
//! - **目标由调用方给** ✓ —— 原生侧从授权里取路径 ✓，前端拿不到路径 ✓。
//! - **同目录临时提交** ✓ —— 目标只在最后那一步被触及 ✓，失败时原文件保持不变 ✓。
//! - **静默** ✓ —— 隐藏宿主 + 无打印面板 ✓；只有保存对话框是用户可见的 ✓。

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Url, WebviewUrl};

use crate::output_host;

/// 临时文件的序号：同进程内每次调用一个 ✓。
///
/// 名字的作用域是**每次调用** ✓，取的却是**整个进程**的标识 ✗——
/// 两次并发的打印会共用同一个暂存文件 ✓：后者覆盖前者的内容 ✓，
/// 前者的清理又把后者的文件删掉 ✓。进程号只保证跨进程不撞 ✓，同进程内还得有序号 ✓。
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// 下一个序号。
fn next_sequence() -> u64 {
    SEQUENCE.fetch_add(1, Ordering::Relaxed)
}

/// 就绪探测的上限。文档加载、字体与图片就绪都在这个窗口内完成。
const READINESS_TIMEOUT: Duration = Duration::from_secs(30);

/// 文档就绪的读数（D1c-1 的证据 ✓）。
#[derive(Debug, Clone, Default)]
pub struct Readiness {
    /// 是否取到过读数（取不到就是原生求值失败 ✓）。
    pub eval_ok: bool,
    /// 就绪条件是否全部成立。
    pub ready: bool,
    /// 读到的文档是不是目标文档（导航换文档时求值可能落在旧文档上 ✓）。
    pub is_expected_document: bool,
    /// 读到的那个文档的加载状态 ✓（`complete`／`loading` ✓）。
    pub ready_state: String,
    /// 读到的那个文档的标题 ✓（不是目标文件的标题 ✓——目标是文件 ✓，这里是文档 ✓）。
    pub title: String,
    /// 读到的那个文档的字体加载状态 ✓（`loaded`／`loading` ✓）。
    pub fonts_status: String,
    /// 读到的那个文档的**页面盒数量** ✓（不是尺寸 ✓——尺寸在下一项 ✓）。
    pub page_box_count: i64,
    /// **第一个**页面盒的尺寸 ✓（形如 `794x1123` ✓；不是全部盒的 ✓）。
    pub first_page_box_size: String,
    /// 读到的那个文档的图片总数 ✓。
    pub images_total: i64,
    /// 读到的那个文档里已解码的图片数 ✓（`loaded === total` 才是就绪 ✓）。
    pub images_loaded: i64,
}

/// 打印结果。
#[derive(Debug, Clone)]
pub struct PrintOutcome {
    /// 原生打印是否成功。
    pub ok: bool,
    /// 产出字节数。
    pub bytes: u64,
    /// 打印耗时。
    pub elapsed_ms: u128,
    /// 是否已 rename 提交到目标。
    pub committed: bool,
    /// 产出的 sha256（产物文件可不入库 ✓，hash 留证 ✓）。
    pub pdf_sha256: String,
    /// **临时文件清掉了没有** ✓：提交之后量一次 ✓，不写死 ✓——
    /// 提交要么把它改名成目标 ✓，要么删掉它 ✓，
    /// 而删不掉是有可能的 ✓（文件被占着 ✓），所以证据得是实测的 ✓。
    pub pdf_temp_removed: bool,
    /// 打印时的就绪读数。
    pub readiness: Readiness,
}

/// 打印失败。带诊断字段，便于日志说清"卡在哪" ✓。
#[derive(Debug, Clone)]
pub struct PrintFailure {
    /// 失败原因（稳定短语 ✓，不含路径 ✓）。
    pub reason: String,
    /// 临时文件是否写出来了。
    pub pdf_temp_exists: bool,
    /// 临时文件多大。
    pub pdf_temp_bytes: u64,
    /// 目标的父目录在不在。
    pub target_dir_exists: bool,
    /// **临时文件清掉了没有** ✓：清理的结果也得留证 ✓——
    /// 冻结清单要"超时 → 删除" ✓，而日志证明不了这件事发生没发生 ✓。
    /// 删不掉是有可能的 ✓（Windows 上文件被占着 ✓）。
    pub pdf_temp_removed: bool,
    /// 打印时的就绪读数（失败时也要有：它说明"文档起来了没有" ✓）。
    /// 装箱是为了别让 Err 变体过大 ✓。
    pub readiness: Box<Readiness>,
}

/// 打印阶段的内部失败：原因与就绪读数 ✓。
struct PrintError{
    reason:String,
    readiness:Box<Readiness>,
}

/// 打印一份文档（本地文件）到目标。
///
/// 流程：确保目标目录在 ✓ → 清掉上次的临时文件 ✓ → 建隐藏宿主载文档 ✓ →
/// 等就绪 ✓ → 打印到同目录临时文件 ✓ → rename 提交 ✓ → 关宿主 ✓。
/// 失败时临时文件被删 ✓，目标不被触及 ✓。
pub fn print_document_to_pdf(
    app: &AppHandle,
    document: &Path,
    target: &Path,
) -> Result<PrintOutcome, PrintFailure> {
    let temp = temp_path(target);
    // 目标目录要先在：打印写的是同目录的临时文件。
    if let Err(reason) = prepare_target(target) {
        return Err(PrintFailure {
            reason,
            pdf_temp_exists: false,
            pdf_temp_bytes: 0,
            target_dir_exists: target.parent().map(|dir| dir.is_dir()).unwrap_or(false),
            pdf_temp_removed: true,
            readiness: Box::new(Readiness::default()),
        });
    }
    // 本次的临时文件按调用唯一 ✓，所以没有旧文件要清 ✓。
    // 崩在打印里的那一次留下的残骸由人看 ✓（同目录的 `*.tmp-<pid>-*` ✓）。
    let _ = std::fs::remove_file(&temp);
    let url = match Url::from_file_path(document) {
        Ok(url) => url,
        Err(()) => {
            return Err(PrintFailure {
                reason: "文档路径无法作为文件地址".to_owned(),
                pdf_temp_exists: false,
                pdf_temp_bytes: 0,
                target_dir_exists: true,
                pdf_temp_removed: true,
                readiness: Box::new(Readiness::default()),
            });
        }
    };
    // 文档的文件名：就绪探测要确认"读到的是这份文档" ✓。
    let document_name = document
        .file_name()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    // 隐藏宿主：打印期间不可见（D1c-5 的"无窗口闪现" ✓）。
    let window = match output_host::create(app, WebviewUrl::External(url)) {
        Ok(window) => window,
        Err(_) => {
            return Err(PrintFailure {
                reason: "打印宿主创建失败".to_owned(),
                pdf_temp_exists: false,
                pdf_temp_bytes: 0,
                target_dir_exists: true,
                pdf_temp_removed: true,
                readiness: Box::new(Readiness::default()),
            });
        }
    };
    let outcome = print_ready_document(&window, &temp, target, &document_name);
    // 丢句柄不等于关窗：窗口仍在应用的窗口表里（D7 清理项 ✓）。
    let _ = window.close();
    match outcome {
        Ok(outcome) => Ok(outcome),
        Err(PrintError{reason, readiness}) => {
            let pdf_temp_exists = temp.is_file();
            let pdf_temp_bytes = std::fs::metadata(&temp).map(|meta| meta.len()).unwrap_or(0);
            Err(PrintFailure {
                reason,
                pdf_temp_exists,
                pdf_temp_bytes,
                target_dir_exists: target.parent().map(|dir| dir.is_dir()).unwrap_or(false),
                // 清理的结果也要留证 ✓：删不掉是有可能的 ✓（文件被占着 ✓）。
                pdf_temp_removed: cleanup_temp(&temp),
                readiness,
            })
        }
    }
}

/// 打印一段 HTML 到目标（产品形态的输入）。
///
/// HTML 先写成临时文件再按文档装载 ✓ —— 与 Web 路径印的是同一份冻结 HTML ✓
/// （同一份 CSP ✓、同一份分页 ✓）。
pub fn print_html_to_pdf(
    app: &AppHandle,
    html: &str,
    target: &Path,
) -> Result<PrintOutcome, PrintFailure> {
    let staged = stage_html(html)?;
    let result = print_document_to_pdf(app, &staged, target);
    let _ = std::fs::remove_file(&staged);
    result
}

/// 把 HTML 暂存成文件。
///
/// 不用 `tempfile::NamedTempFile` ✓：它在 Windows 上独占打开 ✓，
/// WebView2 就读不到那个文件 ✓。故自己写、自己删 ✓。
fn stage_html(html: &str) -> Result<PathBuf, PrintFailure> {
    // 名字按调用唯一 ✓：并发的两次打印不会共用一个暂存文件 ✓。
    let path = std::env::temp_dir().join(format!(
        "markflow-print-{}-{}.html",
        std::process::id(),
        next_sequence()
    ));
    std::fs::write(&path, html).map_err(|_| PrintFailure {
        reason: "打印内容暂存失败".to_owned(),
        pdf_temp_exists: false,
        pdf_temp_bytes: 0,
        target_dir_exists: true,
        pdf_temp_removed: true,
        readiness: Box::new(Readiness::default()),
    })?;
    Ok(path)
}

/// 等文档就绪，然后打印到临时文件并提交。
fn print_ready_document(
    window: &tauri::WebviewWindow,
    temp: &Path,
    target: &Path,
    expected_name: &str,
) -> Result<PrintOutcome, PrintError> {
    let (ready, readiness) = wait_ready(window, expected_name);
    if !ready {
        return Err(PrintError{
            reason:"文档未在期限内达到就绪条件".to_owned(),
            readiness:Box::new(readiness),
        });
    }
    let printed = print_com_print(window, temp).map_err(|reason| PrintError{
        reason,
        readiness:Box::new(readiness.clone()),
    })?;
    // 机制说成功不等于产物可用 ✓：**0 字节不进目标** ✓——
    // 否则回执会说 saved ✓，而文件里什么都没有 ✓。
    // 顺带把"哈希为空串的哈希"挡在外面 ✓（空串的 sha256 是个合法但无意义的值 ✓）。
    if printed.bytes == 0 {
        return Err(PrintError{
            reason:"打印产出为空：没有字节可提交".to_owned(),
            readiness:Box::new(readiness.clone()),
        });
    }
    // 哈希要在**改名之前**取 ✓：提交就是把临时文件 rename 成目标 ✓，
    // rename 之后那个路径已经不存在了 ✓，那时再取只会得到空串 ✓。
    let pdf_sha256 = file_sha256(temp);
    let committed = commit_pdf(temp, target);
    // 清理的结果也得留证 ✓：提交要么把它改名成目标 ✓，要么删掉它 ✓——
    // 删不掉是有可能的 ✓（文件被占着 ✓），所以这里**量一次** ✓，不写死 ✓。
    let pdf_temp_removed = !temp.exists();
    Ok(PrintOutcome {
        ok: printed.ok,
        bytes: printed.bytes,
        elapsed_ms: printed.elapsed_ms,
        committed,
        pdf_sha256,
        pdf_temp_removed,
        readiness,
    })
}

/// 目标同目录的临时文件：同卷，才能 rename 提交。
///
/// **名字按调用唯一** ✓：并发的两次打印（哪怕打到同一个目标 ✓）不会共用一个临时文件 ✓。
fn temp_path(target: &Path) -> PathBuf {
    let mut name = target
        .file_name()
        .map(|value| value.to_os_string())
        .unwrap_or_default();
    name.push(format!(".tmp-{}-{}", std::process::id(), next_sequence()));
    target.with_file_name(name)
}

/// 确保目标的父目录存在 ✓（打印写的是同目录的临时文件 ✓）。
fn prepare_target(target: &Path) -> Result<(), String> {
    let Some(dir) = target.parent() else {
        return Ok(());
    };
    if dir.as_os_str().is_empty() || dir.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(dir)
        .map(|_| ())
        .map_err(|_| "输出目录不存在且无法创建".to_owned())
}

/// 清掉临时文件，并报告**清掉了没有** ✓。
///
/// 删不掉是有可能的 ✓（Windows 上文件被占着 ✓）——
/// 所以清理的结果也得留证 ✓（冻结清单要"超时 → 删除" ✓，
/// 而日志证明不了这件事发生没发生 ✓）。
fn cleanup_temp(temp: &Path) -> bool {
    let _ = std::fs::remove_file(temp);
    !temp.exists()
}

/// 提交：把临时文件 rename 到目标 ✓。目标只在这一步被触及 ✓。
fn commit_pdf(temp: &Path, target: &Path) -> bool {
    // **0 字节不提交** ✓：机制说成功不等于产物可用 ✓——
    // 空文件 rename 进目标，就是"回执说 saved 而文件里什么都没有" ✓。
    // 这一步是唯一触及目标的地方 ✓，所以不变量放在这里 ✓。
    if std::fs::metadata(temp).map(|meta| meta.len()).unwrap_or(0) == 0 {
        let _ = std::fs::remove_file(temp);
        return false;
    }
    match std::fs::rename(temp, target) {
        Ok(()) => true,
        Err(_) => {
            let _ = std::fs::remove_file(temp);
            false
        }
    }
}

/// 文件的 sha256 ✓（产物可不入库 ✓，hash 留证 ✓）。
fn file_sha256(path: &Path) -> String {
    use sha2::{Digest, Sha256};
    std::fs::read(path)
        .ok()
        .map(|bytes| {
            Sha256::digest(&bytes)
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect()
        })
        .unwrap_or_default()
}

/// 就绪探测脚本：读文档的加载状态、字体、图片与页面盒。
///
/// 只读不写 ✓；不执行作者脚本 ✓。字体与图片的"就绪"用状态而非 Promise 查询 ✓。
const READINESS_SCRIPT: &str = r#"(()=>{
  const boxes=[...document.querySelectorAll('.pagedjs_page')];
  const images=[...document.images];
  const fonts=document.fonts?document.fonts.status:'unknown';
  const loaded=images.filter(image=>image.complete&&image.naturalWidth>0).length;
  return {
    href:location.href,
    ready_state:document.readyState,
    title:document.title,
    fonts_status:fonts,
    page_boxes:boxes.length,
    page_box_size:boxes.length?boxes[0].offsetWidth+'x'+boxes[0].offsetHeight:'',
    images_total:images.length,
    images_loaded:loaded,
    ready:document.readyState==='complete'&&fonts==='loaded'&&loaded===images.length,
  };
})()"#;

/// 等文档就绪：文档完成 + 字体已加载 + 图片已解码 + 页面盒在。
///
/// **不用固定睡眠** ✓：轮询的是条件 ✓，条件成立即返回 ✓。
fn wait_ready(window: &tauri::WebviewWindow, expected: &str) -> (bool, Readiness) {
    let deadline = Instant::now() + READINESS_TIMEOUT;
    let mut last = Readiness::default();
    let expected = expected.to_lowercase();
    while Instant::now() < deadline {
        let (sender, receiver) = mpsc::channel();
        if window
            .eval_with_callback(READINESS_SCRIPT, move |value| {
                let _ = sender.send(value);
            })
            .is_err()
        {
            break;
        }
        let Ok(raw) = receiver.recv_timeout(Duration::from_millis(800)) else {
            std::thread::sleep(Duration::from_millis(200));
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
            continue;
        };
        // 文档身份先于就绪：导航到新页时求值可能落在**旧文档**上，
        // 而旧文档也可能"看起来就绪"（加载完成、字体已加载）——那就白读了。
        let matches_expected = text_of(&value, "href")
            .to_lowercase()
            .contains(&expected);
        last = Readiness {
            eval_ok: true,
            is_expected_document: matches_expected,
            ready: matches_expected
                && value
                    .get("ready")
                    .and_then(|entry| entry.as_bool())
                    .unwrap_or(false),
            ready_state: text_of(&value, "ready_state"),
            title: text_of(&value, "title"),
            fonts_status: text_of(&value, "fonts_status"),
            page_box_count: number_of(&value, "page_boxes"),
            first_page_box_size: text_of(&value, "page_box_size"),
            images_total: number_of(&value, "images_total"),
            images_loaded: number_of(&value, "images_loaded"),
        };
        if last.ready {
            return (true, last);
        }
    }
    (false, last)
}

/// 就绪读数里的字符串字段。
fn text_of(value: &serde_json::Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|entry| entry.as_str())
        .unwrap_or("")
        .to_owned()
}

/// 就绪读数里的数字字段。
fn number_of(value: &serde_json::Value, key: &str) -> i64 {
    value.get(key).and_then(|entry| entry.as_i64()).unwrap_or_default()
}

/// 原生打印的结果（平台中立 ✓：Windows 走 COM ✓，其它平台没有这个能力 ✓）。
struct NativePrintResult{
    ok:bool,
    bytes:u64,
    elapsed_ms:u128,
}

/// 调原生打印（Windows 走 COM ✓；其它平台没有这个能力 ✓）。
fn print_com_print(
    window: &tauri::WebviewWindow,
    temp: &Path,
) -> Result<NativePrintResult, String> {
    #[cfg(target_os = "windows")]
    {
        // 宿主侧胶水：取控制器与环境 → 交给 COM 编排 ✓（见 `print_host.rs` ✓）。
        let outcome = crate::print_host::print_to_pdf(window, temp)?;
        Ok(NativePrintResult{
            ok:outcome.ok,
            bytes:outcome.bytes,
            elapsed_ms:outcome.elapsed_ms,
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, temp);
        Err("静默 PDF 输出只支持 Windows（依赖 WebView2 的 PrintToPdf）".to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_staged_document_gets_its_own_file() {
        // 名字按调用唯一 ✓：并发的两次打印不会共用一个暂存文件 ✓——
        // 否则后写的覆盖先写的 ✓，先写的清理又把后写的删掉 ✓。
        let first = stage_html("<p>first</p>").unwrap();
        let second = stage_html("<p>second</p>").unwrap();
        assert_ne!(first, second);
        assert_eq!(std::fs::read_to_string(&first).unwrap(), "<p>first</p>");
        assert_eq!(std::fs::read_to_string(&second).unwrap(), "<p>second</p>");
        let _ = std::fs::remove_file(&first);
        let _ = std::fs::remove_file(&second);
    }

    #[test]
    fn every_call_gets_its_own_temporary_file_next_to_the_target() {
        // 目标的临时文件同样按调用唯一 ✓：并发的两次打印（哪怕打到同一个目标 ✓）
        // 不会共用一个临时文件 ✓。
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("out.pdf");
        let first = temp_path(&target);
        let second = temp_path(&target);
        assert_ne!(first, second);
        // 仍在目标的同目录 ✓：同卷才能 rename 提交 ✓。
        assert_eq!(first.parent().unwrap(), dir.path());
        assert_eq!(second.parent().unwrap(), dir.path());
    }

    #[test]
    fn a_temp_file_is_cleaned_and_that_is_reported() {
        let dir = tempfile::tempdir().unwrap();
        let temp = dir.path().join("out.pdf.tmp");
        std::fs::write(&temp, b"x").unwrap();
        assert!(cleanup_temp(&temp));
        assert!(!temp.exists());
    }

    #[test]
    fn a_temp_file_that_was_never_there_counts_as_cleaned() {
        let dir = tempfile::tempdir().unwrap();
        assert!(cleanup_temp(&dir.path().join("never-existed.tmp")));
    }

    #[cfg(windows)]
    #[test]
    fn a_locked_temp_file_cannot_be_cleaned_and_that_is_reported() {
        // Windows 上被打开的文件不能删 ✓：所以清理的结果必须留证 ✓，
        // 否则"超时 → 删除"这条永远证明不了 ✓。
        // `share_mode` 来自这个扩展 trait ✓；打开文件的类型是 `std::fs::OpenOptions` ✓
        // （`std::os::windows::fs::OpenOptions` 是私有的 ✓，写错了编不过 ✓）。
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let temp = dir.path().join("out.pdf.tmp");
        std::fs::write(&temp, b"x").unwrap();
        let locked = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0x0000_0001 | 0x0000_0002) // deny FILE_SHARE_DELETE
            .open(&temp)
            .unwrap();
        assert!(!cleanup_temp(&temp));
        drop(locked);
    }

    #[test]
    fn a_product_with_bytes_is_committed() {
        let dir = tempfile::tempdir().unwrap();
        let temp = dir.path().join("out.pdf.tmp");
        let target = dir.path().join("out.pdf");
        std::fs::write(&temp, b"%PDF-1.7\n").unwrap();
        assert!(commit_pdf(&temp, &target));
        assert_eq!(std::fs::read(&target).unwrap(), b"%PDF-1.7\n");
        assert!(!temp.exists());
    }

    #[test]
    fn an_empty_product_is_not_committed() {
        // 机制说成功不等于产物可用：空文件不进目标。
        let dir = tempfile::tempdir().unwrap();
        let temp = dir.path().join("out.pdf.tmp");
        let target = dir.path().join("out.pdf");
        std::fs::write(&temp, b"").unwrap();
        assert!(!commit_pdf(&temp, &target));
        // 目标没被触及 ✓，临时文件被清掉 ✓（不留残骸 ✓）。
        assert!(!target.exists());
        assert!(!temp.exists());
    }

    #[test]
    fn a_missing_product_is_not_committed() {
        let dir = tempfile::tempdir().unwrap();
        let temp = dir.path().join("out.pdf.tmp");
        let target = dir.path().join("out.pdf");
        assert!(!commit_pdf(&temp, &target));
        assert!(!target.exists());
    }
}
