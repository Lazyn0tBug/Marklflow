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
use std::sync::mpsc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Url, WebviewUrl};

use crate::output_host;

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
    pub is_target: bool,
    pub ready_state: String,
    pub title: String,
    pub fonts_status: String,
    pub page_boxes: i64,
    pub page_box_size: String,
    pub images_total: i64,
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
    pub sha256: String,
    /// 打印时的就绪读数。
    pub readiness: Readiness,
}

/// 打印失败。带诊断字段，便于日志说清"卡在哪" ✓。
#[derive(Debug, Clone)]
pub struct PrintFailure {
    /// 失败原因（稳定短语 ✓，不含路径 ✓）。
    pub reason: String,
    /// 临时文件是否写出来了。
    pub temp_exists: bool,
    /// 临时文件多大。
    pub temp_bytes: u64,
    /// 目标的父目录在不在。
    pub target_dir_exists: bool,
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
            temp_exists: false,
            temp_bytes: 0,
            target_dir_exists: target.parent().map(|dir| dir.is_dir()).unwrap_or(false),
            readiness: Box::new(Readiness::default()),
        });
    }
    // 上一次运行的残留先清掉：打印要的是一个干净的临时文件。
    let _ = std::fs::remove_file(&temp);
    let url = match Url::from_file_path(document) {
        Ok(url) => url,
        Err(()) => {
            return Err(PrintFailure {
                reason: "文档路径无法作为文件地址".to_owned(),
                temp_exists: false,
                temp_bytes: 0,
                target_dir_exists: true,
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
                temp_exists: false,
                temp_bytes: 0,
                target_dir_exists: true,
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
            let temp_exists = temp.is_file();
            let temp_bytes = std::fs::metadata(&temp).map(|meta| meta.len()).unwrap_or(0);
            let _ = std::fs::remove_file(&temp);
            Err(PrintFailure {
                reason,
                temp_exists,
                temp_bytes,
                target_dir_exists: target.parent().map(|dir| dir.is_dir()).unwrap_or(false),
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
    let path = std::env::temp_dir().join(format!("markflow-print-{}.html", std::process::id()));
    std::fs::write(&path, html).map_err(|_| PrintFailure {
        reason: "打印内容暂存失败".to_owned(),
        temp_exists: false,
        temp_bytes: 0,
        target_dir_exists: true,
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
    let committed = commit_pdf(temp, target);
    let sha256 = file_sha256(temp);
    Ok(PrintOutcome {
        ok: printed.ok,
        bytes: printed.bytes,
        elapsed_ms: printed.elapsed_ms,
        committed,
        sha256,
        readiness,
    })
}

/// 目标同目录的临时文件：同卷，才能 rename 提交。
fn temp_path(target: &Path) -> PathBuf {
    let mut name = target
        .file_name()
        .map(|value| value.to_os_string())
        .unwrap_or_default();
    name.push(format!(".tmp-{}", std::process::id()));
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

/// 提交：把临时文件 rename 到目标 ✓。目标只在这一步被触及 ✓。
fn commit_pdf(temp: &Path, target: &Path) -> bool {
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
        let is_target = text_of(&value, "href")
            .to_lowercase()
            .contains(&expected);
        last = Readiness {
            eval_ok: true,
            is_target,
            ready: is_target
                && value
                    .get("ready")
                    .and_then(|entry| entry.as_bool())
                    .unwrap_or(false),
            ready_state: text_of(&value, "ready_state"),
            title: text_of(&value, "title"),
            fonts_status: text_of(&value, "fonts_status"),
            page_boxes: number_of(&value, "page_boxes"),
            page_box_size: text_of(&value, "page_box_size"),
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
struct NativePrint{
    ok:bool,
    bytes:u64,
    elapsed_ms:u128,
}

/// 调原生打印（Windows 走 COM ✓；其它平台没有这个能力 ✓）。
fn print_com_print(
    window: &tauri::WebviewWindow,
    temp: &Path,
) -> Result<NativePrint, String> {
    #[cfg(target_os = "windows")]
    {
        let outcome = crate::print_com::print_to_pdf(window, temp)?;
        return Ok(NativePrint{
            ok:outcome.ok,
            bytes:outcome.bytes,
            elapsed_ms:outcome.elapsed_ms,
        });
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, temp);
        Err("静默 PDF 输出只支持 Windows（依赖 WebView2 的 PrintToPdf）".to_owned())
    }
}
