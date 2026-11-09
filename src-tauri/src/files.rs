use serde::Serialize;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri_plugin_dialog::DialogExt;

use crate::logging;
use crate::logging::WebCommand;
use crate::source_guard;

/// 取调用方身份并按允许范围判定。拒绝时返回共享稳定拒绝码。
/// 五个受保护入口都在任何文件、对话框或授权撤销的副作用之前调用它。
/// 判定结果留痕：守卫决策是安全事件，任何构建都该可观测。
fn ensure_allowed(command: &str, identity: &source_guard::Identity) -> Result<(), String> {
    match source_guard::check_source(identity, source_guard::ALLOWED_CALLERS) {
        Ok(()) => {
            tracing::info!(
                event = "source_decision",
                    decision = "allow",
                command = command,
                window = identity.window_label.as_ref(),
                webview = identity.webview_label.as_ref(),
            );
            Ok(())
        }
        Err(code) => {
            tracing::warn!(
                event = "source_decision",
                    decision = "deny",
                command = command,
                reason_code = code,
                window = identity.window_label.as_ref(),
                webview = identity.webview_label.as_ref(),
            );
            Err(code.to_owned())
        }
    }
}

/// 在命令 span 内执行命令体。
///
/// span 名为 `command`，是根 span 的直接子；判定与结果都记在该 span 内，
/// 事件名取契约的最小原生事件集（`source_decision`、`operation_result`）。
///
/// 守卫只在这里判定一次：放行记 `source_decision=allow`；拒绝时命令体不会执行，
/// 故由本层补一条 `operation_result=denied`——每个命令 span 都有结果事件，
/// 拒绝的最终结果不会只存在于守卫的返回值里。
///
/// **命令名由枚举给出** ✓：参数是 `WebCommand` ✓，名字由 `logging::command_name` 统一出 ✓——
/// 于是"受保护的命令"与"页面可回传的命令"**不可能各说各话** ✓：
/// 新加一个受保护命令而忘了进枚举 ✓，**编译不过** ✓。
/// 命令体拿到的是同一个名字 ✓，所以日志里的命令名与页面回传的名字必然一致 ✓。
fn in_command_span<T>(
    command: WebCommand,
    webview: &tauri::Webview,
    body: impl FnOnce(std::time::Instant, &'static str) -> Result<T, String>,
) -> Result<T, NativeFailure> {
    let name = logging::command_name(command);
    let identity =
        source_guard::Identity::from_labels(webview.window().label(), webview.label());
    let span = logging::command_span(
        name,
        identity.window_label.as_ref(),
        identity.webview_label.as_ref(),
    );
    span.in_scope(|| {
        let started = std::time::Instant::now();
        if let Err(code) = ensure_allowed(name, &identity) {
            tracing::warn!(
                event = "operation_result",
                result = "denied",
                command = name,
                reason_code = code.as_str(),
                elapsed_ms = started.elapsed().as_millis(),
            );
            return Err(NativeFailure::from_code(code));
        }
        body(started, name).map_err(|code| failure_with_limit(code, command))
    })
}

/// **这一类失败带上上限** ✓ ⇒ ⇒ 前端能说清"多少" ✓（§8.5 ✓）。
///
/// **只有"超过大小上限"这一类带** ✓ ⇒ ⇒ 其余不带 ✓ ⇒ ⇒ 前端不必猜 ✓。
fn failure_with_limit(code: String, command: WebCommand) -> NativeFailure {
    let limit_bytes = if code == FILE_TOO_LARGE {
        limit_for(command)
    } else {
        None
    };
    NativeFailure { code, limit_bytes }
}

/// **这条命令的上限** ✓：**谁拥有这个事实，谁给出这个参数** ✓（§8.5 ✓）。
///
/// **没有上限的命令是 None** ✓ ⇒ ⇒ 那类失败不带参数 ✓。
fn limit_for(command: WebCommand) -> Option<u64> {
    match command {
        WebCommand::ReadNativeText => Some(READ_LIMIT),
        WebCommand::WriteNativeBytes => Some(WRITE_LIMIT as u64),
        WebCommand::WriteNativeSync => Some(WRITE_LIMIT as u64),
        _ => None,
    }
}

pub const READ_LIMIT: u64 = 50 * 1024 * 1024;
pub const WRITE_LIMIT: usize = 100 * 1024 * 1024;
#[derive(Default)]
pub struct FileAccess(
    Mutex<HashMap<String, Grant>>,
    /// 规范名 → 随机 token（§3.3）：同一文件在本次进程内被多次选中，token 相同 ✓。
    Mutex<HashMap<PathBuf, String>>,
);
struct Grant {
    path: PathBuf,
    writable: bool,
    /// **应用手上是哪个版本** ✓：读进来或写出去那一刻的字节摘要 ✓（§3.4 ✓）。
    ///
    /// **摘要只存在原生侧** ✓ ⇒ ⇒ 应用侧拿不到值 ✓ ⇒ ⇒ 只问一句 ✓
    /// ⇒ ⇒ 这就是 `is_native_synced` 回答的那句 ✓。
    digest: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedFile {
    /// 授权的标识 ✓：**路径不在这里** ✓（前端只拿得到 key ✓）。
    pub(crate) key: String,
    /// 选中的文件名 ✓（展示用 ✓；不是完整路径 ✓）。
    name: String,
    /// 选中文件的字节数 ✓（打开时读的文件大小 ✓；新建的文件是 0 ✓）。
    size: u64,
    /// 文件引用（会话内）✓：同一文件在本次进程内被多次选中，token 相同 ✓（§3.3）。
    /// 只用于**归属与聚焦** ✓；同步永远按授权里的实际路径执行 ✓。
    pub(crate) reference: String,
}
/// 原生命令失败的**稳定机器码** ✓（§9）：前端按码分流 ✓，拒绝不再靠子串匹配 ✓。
/// 用户可见的文案由前端按码映射 ✓：原生侧不产出用户文案 ✓（跨平台的文案要一致 ✓）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFailure {
    /// 稳定机器码。
    pub code: String,
    /// **可展示的上限** ✓：**只有"超过大小上限"这一类有** ✓ ⇒ ⇒ 其余是没有 ✓。
    ///
    /// **谁拥有这个事实，谁给出这个参数** ✓（§8.5 ✓）⇒ ⇒ 前端能说清"多少" ✓
    /// ⇒ ⇒ 文案里不用猜 ✓。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_bytes: Option<u64>,
}
/// **超过大小上限**这一类的机器码 ✓：一处定义 ✓ ⇒ ⇒ 命令体据此把上限带出去 ✓。
const FILE_TOO_LARGE: &str = "file-too-large";
impl NativeFailure {
    fn from_code(code: String) -> Self {
        NativeFailure {
            code,
            limit_bytes: None,
        }
    }
}

/// IO 失败按原因细分 ✓：UI 要能区分"文件被移走"与"磁盘写不进去"（§9）。
/// 目标不存在 / 权限不足 / 其余，各有自己的机器码 ✓。
fn io_error(error: &std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => "native-target-missing".into(),
        std::io::ErrorKind::PermissionDenied => "native-permission-denied".into(),
        _ => "native-io-failed".into(),
    }
}

/// 系统对话框自身的失败。**与取消不同** ✓：取消是"未选" ✓（`Ok(None)` ✓），
/// 对话框故障才有码 ✓（§9）。
fn dialog_error(_: impl std::fmt::Display) -> String {
    "native-dialog-failed".into()
}

/// 内部状态不可用（互斥锁中毒）——不是 IO 失败 ✓。
fn internal_error(_: impl std::fmt::Display) -> String {
    "native-internal-failed".into()
}
impl FileAccess {
    /// 签发授权。生产入口只经由五个受保护命令；探针在受控初始化里直接调用它铸造受控授权。
    pub(crate) fn grant(&self, path: PathBuf, writable: bool) -> Result<SelectedFile, String> {
        // A name that is not valid UTF-8 is still a usable path: show it lossily
        // instead of failing the whole selection.
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .ok_or("invalid-file-name")?;
        let size = match path.metadata() {
            Ok(meta) if meta.is_file() => meta.len(),
            Ok(_) => return Err("not-a-file".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => 0,
            Err(e) => return Err(io_error(&e)),
        };
        let key = uuid::Uuid::new_v4().to_string();
        let reference = self.reference_of(&path)?;
        self.0
            .lock()
            .map_err(internal_error)?
            .insert(key.clone(), Grant { path, writable, digest: None });
        Ok(SelectedFile {
            key,
            name,
            size,
            reference,
        })
    }
    /// 取授权里的路径。**写必须可写；读时可写蕴含可读** ✓：
    /// 打开用户选中的文件时签发的授权读、写都有 ✓，写回原文件走同一次打开的 key ✓；
    /// 反过来，只读授权不能被当写授权用 ✓（"用错了"不是"没碰它" ✓）。
    fn path(&self, key: &str, writable: bool) -> Result<PathBuf, String> {
        let grants = self.0.lock().map_err(internal_error)?;
        let grant = grants.get(key).ok_or("unknown-file-key")?;
        if writable && !grant.writable {
            return Err("file-capability-mismatch".into());
        }
        Ok(grant.path.clone())
    }
    /// 文件引用（会话内）：**规范名 → 随机 token** ✓（§3.3）。
    ///
    /// token 是随机的 ✓，不是路径的摘要 ✓：路径熵低 ✓，摘要可被字典枚举还原 ✓，
    /// 等于把"路径不出原生侧"削弱成"需要暴力枚举才能反推" ✓。
    /// 规范化只做操作系统层面的 canonicalize ✓（解析符号链接与相对分量 ✓），
    /// **不做大小写折叠** ✓：大小写不敏感的文件系统上 `A.md` 与 `a.md` 常常是同一个文件 ✓，
    /// 而跨平台的字符串规范化规则本设计明确拒绝制定 ✓。
    fn reference_of(&self, path: &Path) -> Result<String, String> {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let mut references = self.1.lock().map_err(internal_error)?;
        if let Some(token) = references.get(&canonical) {
            return Ok(token.clone());
        }
        let token = uuid::Uuid::new_v4().to_string();
        references.insert(canonical, token.clone());
        Ok(token)
    }
    /// 撤销授权。探针用它在受控初始化结束时回收自己的授权；
    /// 正常的 release_native_file 业务清理不受影响。
    #[allow(dead_code)]
    pub(crate) fn revoke(&self, key: &str) {
        if let Ok(mut grants) = self.0.lock() {
            grants.remove(key);
        }
    }
    /// 记下"应用手上是哪个版本" ✓：读进来或写出去那一刻的字节摘要 ✓（§3.4 ✓）。
    ///
    /// **记的是磁盘上那份的摘要** ✓ ⇒ ⇒ 回答"还是那一版吗"时比的是同一件事 ✓。
    fn record_digest(&self, key: &str, digest: &str) -> Result<(), String> {
        let mut grants = self.0.lock().map_err(internal_error)?;
        let grant = grants.get_mut(key).ok_or("unknown-file-key")?;
        grant.digest = Some(digest.to_owned());
        Ok(())
    }
    /// **这个文件还是应用手上那一版吗** ✓（§3.1 ✓）。
    ///
    /// **答案在原生侧给** ✓ ⇒ ⇒ 应用侧既拿不到摘要、也不需要自己比 ✓（§3.4 ✓）。
    /// **没有记过版本 ⇒ ⇒ 回答不了** ✓ ⇒ ⇒ 那是内部状态不可用 ✓ ⇒ ⇒ 不是"变了" ✓。
    fn synced(&self, key: &str) -> Result<bool, String> {
        let (path, digest) = {
            let grants = self.0.lock().map_err(internal_error)?;
            let grant = grants.get(key).ok_or("unknown-file-key")?;
            let digest = grant
                .digest
                .clone()
                .ok_or_else(|| "native-internal-failed".to_string())?;
            (grant.path.clone(), digest)
        };
        // **比的是当前磁盘上那份** ✓ ⇒ ⇒ 外部改过就答"不是" ✓。
        // **先看大小** ✓ ⇒ ⇒ 超过读上限的文件一定不是应用手上那一版 ✓
        // ⇒ ⇒ 不必为了答一句话把它整个读进来 ✓。
        let length = std::fs::metadata(&path).map_err(|e| io_error(&e))?.len();
        if length > READ_LIMIT {
            return Ok(false);
        }
        let bytes = std::fs::read(&path).map_err(|e| io_error(&e))?;
        Ok(crate::hash::sha256_hex(&bytes) == digest)
    }
    /// **写回要复核的那一份** ✓：授权里记的"应用手上那一版" ✓。
    ///
    /// **原生侧自己取** ✓ ⇒ ⇒ 前端不传期望摘要 ✓ ⇒ ⇒ 应用侧没有第二份事实会漂 ✓（§3.4 ✓）。
    /// **没有记过版本 ⇒ ⇒ 复核不了** ✓ ⇒ ⇒ 那是内部状态不可用 ✓ ⇒ ⇒ 不是"变了" ✓。
    fn expected_digest(&self, key: &str) -> Result<String, String> {
        let grants = self.0.lock().map_err(internal_error)?;
        let grant = grants.get(key).ok_or("unknown-file-key")?;
        grant
            .digest
            .clone()
            .ok_or_else(|| "native-internal-failed".to_string())
    }
}
/// **读到的内容与它的版本** ✓：一次读，两样东西 ✓。
///
/// **摘要算的就是应用拿到的��份字节** ✓ ⇒ ⇒ 记下来的就是"应用手上那一版" ✓
/// ⇒ ⇒ 不是另读一遍 ✓（§3.4 ✓）。
#[derive(Debug)]
pub struct ReadContent {
    /// 应用拿到的那份文本 ✓。
    pub text: String,
    /// 那份字节的摘要 ✓：**留在原生侧** ✓ ⇒ ⇒ 应用侧拿不到这个值 ✓。
    pub digest: String,
}

/// **读原始字节** ✓：上限与失败原因照旧 ✓。
pub fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|e| io_error(&e))?;
    if !file.metadata().map_err(|e| io_error(&e))?.is_file() {
        return Err("not-a-file".into());
    }
    let mut bytes = Vec::new();
    file.take(READ_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| io_error(&e))?;
    if bytes.len() as u64 > READ_LIMIT {
        return Err(FILE_TOO_LARGE.into());
    }
    Ok(bytes)
}

/// 字节按文本解 ✓：严格 UTF-8 ✓，只去开头的 BOM ✓（与 Web 的 TextDecoder 一致 ✓）。
fn decode_text(bytes: Vec<u8>) -> Result<String, String> {
    let text = String::from_utf8(bytes).map_err(|_| "invalid-utf8".to_string())?;
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned())
}

/// **读一份文件** ✓：文本与版本一起 ✓ ⇒ ⇒ 摘要与内容出自同一次读 ✓。
pub fn read_content(path: &Path) -> Result<ReadContent, String> {
    let bytes = read_bytes(path)?;
    let digest = crate::hash::sha256_hex(&bytes);
    let text = decode_text(bytes)?;
    Ok(ReadContent { text, digest })
}
/// **写回一份文件** ✓：同目录临时文件 + rename ✓（原子替换 ✓）。
///
/// **复核在临时文件写完之后、最终替换之前** ✓ ⇒ ⇒ 检查与替换的间隔最短 ✓
/// ⇒ ⇒ 外部进程想插进来得挤进这两步之间 ✓。
///
/// **期望摘要是可选的** ✓ ⇒ ⇒ **不给**就是无条件写 ✓（新文件 ✓、另存为选的新目标 ✓）
/// ⇒ ⇒ **给了**就是"只在这个版本上写" ✓ ⇒ ⇒ 匹配才提交 ✓ ⇒ ⇒ 不匹配 ⇒ 清理临时文件 ✓
/// ⇒ ⇒ 报 `write-target-changed` ✓ ⇒ ⇒ **调用方自己决定下一步** ✓。
pub fn commit_bytes(path: &Path, bytes: &[u8], expected: Option<&str>) -> Result<(), String> {
    if bytes.len() > WRITE_LIMIT {
        return Err(FILE_TOO_LARGE.into());
    }
    // Reject symbolic links rather than silently replacing their directory entry.
    match std::fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() => {
            return Err("not-a-regular-target".into())
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(io_error(&e)),
        _ => {}
    }
    let parent = path.parent().ok_or("invalid-target")?;
    // The temporary file is created 0600; the target keeps its own permission bits.
    #[cfg(unix)]
    let existing_mode = std::fs::metadata(path).ok().map(|meta| meta.permissions().mode());
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| io_error(&e))?;
    #[cfg(unix)]
    if let Some(mode) = existing_mode {
        let _ = temp.as_file().set_permissions(std::fs::Permissions::from_mode(mode));
    }
    temp.write_all(bytes).map_err(|e| io_error(&e))?;
    temp.as_file().sync_all().map_err(|e| io_error(&e))?;
    // **临时文件已就位、还没替换** ✓ ⇒ ⇒ 这是复核的最后一刻 ✓。
    // **比对的是目标当前的摘要** ✓ ⇒ ⇒ 外部改过就答"变了" ✓ ⇒ ⇒ 不动它 ✓。
    if let Some(expected) = expected {
        let current = std::fs::read(path).map_err(|e| io_error(&e))?;
        if crate::hash::sha256_hex(&current) != expected {
            // **临时文件随这一句一起被丢掉** ✓ ⇒ ⇒ 目录不留残骸 ✓。
            return Err("write-target-changed".into());
        }
    }
    temp.persist(path).map_err(|e| io_error(&e.error))?;
    // The rename is only durable once the directory entry reaches the disk.
    #[cfg(unix)]
    if let Ok(dir) = File::open(parent) {
        let _ = dir.sync_all();
    }
    Ok(())
}
#[tauri::command]
pub async fn select_native_open(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    access: tauri::State<'_, FileAccess>,
) -> Result<Option<Vec<SelectedFile>>, NativeFailure> {
    in_command_span(WebCommand::SelectNativeOpen, &webview, |started, cmd| {
        let outcome = paths_of(app, access);
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(files) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = cmd,
                    count = files.as_ref().map(|items| items.len()).unwrap_or(0),
                    elapsed_ms = elapsed,
                );
                Ok(files)
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = cmd,
                    reason_code = code,
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
}

/// 选择器与拖放共用同一份扩展名清单 ✓（§5.4：两条入口的行为一致 ✓）。
const OPENABLE_EXTENSIONS: [&str; 5] = ["md", "markdown", "txt", "html", "htm"];

/// 这个路径是不是可打开的文档（按扩展名 ✓；大小写不敏感 ✓）。
fn is_openable(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            OPENABLE_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
        .unwrap_or(false)
}

/// 拖放进来的文件：与选择器**同一套授权与身份** ✓（§5.4）——
/// 于是"拖进来的是刚才打开的那个文件"这种去重照样成立 ✓。
/// 只带授权与身份，**不带路径** ✓。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedFiles {
    pub files: Vec<SelectedFile>,
}

/// 给拖进来的文件签发授权。
///
/// 不可打开的直接忽略 ✓：**不铸授权** ✓ ⇒ 不留一份要回收的授权 ✓。
/// 铸出来的是读 + 写 ✓：与选择器一样 ✓（§3.2）。
pub fn grant_dropped(paths: Vec<PathBuf>, access: &FileAccess) -> Vec<SelectedFile> {
    paths
        .into_iter()
        .filter(|path| is_openable(path))
        .filter_map(|path| access.grant(path, true).ok())
        .collect()
}

/// 打开文件对话框并为选中的文件签发**读 + 写**授权 ✓：写能力只在用户显式触发保存时使用 ✓，
/// 建立授权本身不写任何字节 ✓。写回原文件不必再选一次 ✓。
fn paths_of(
    app: tauri::AppHandle,
    access: tauri::State<'_, FileAccess>,
) -> Result<Option<Vec<SelectedFile>>, String> {
    let paths = app
        .dialog()
        .file()
        .add_filter("Documents", &OPENABLE_EXTENSIONS)
        .blocking_pick_files();
    paths
        .map(|items| {
            let mut selected = Vec::new();
            for item in items {
                match item
                    .into_path()
                    .map_err(dialog_error)
                    .and_then(|path| access.grant(path, true))
                {
                    Ok(file) => selected.push(file),
                    Err(failure) => {
                        let mut grants = access.0.lock().map_err(internal_error)?;
                        for file in selected {
                            grants.remove(&file.key);
                        }
                        return Err(failure);
                    }
                }
            }
            Ok(selected)
        })
        .transpose()
}
#[tauri::command]
pub async fn select_native_save(
    app: tauri::AppHandle,
    webview: tauri::Webview,
    access: tauri::State<'_, FileAccess>,
    name: String,
) -> Result<Option<SelectedFile>, NativeFailure> {
    in_command_span(WebCommand::SelectNativeSave, &webview, |started, cmd| {
        if name.is_empty() || name.contains(['/', '\\', '\0']) || name == "." || name == ".." {
            tracing::warn!(
                event = "operation_result",
                        result = "error",
                command = cmd,
                reason_code = "invalid-file-name",
                elapsed_ms = started.elapsed().as_millis(),
            );
            return Err("invalid-file-name".into());
        }
        let granted = app
            .dialog()
            .file()
            .set_file_name(name)
            .blocking_save_file()
            .map(|p| access.grant(p.into_path().map_err(dialog_error)?, true))
            .transpose();
        let elapsed = started.elapsed().as_millis();
        match granted {
            Ok(file) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = cmd,
                    granted = file.is_some(),
                    elapsed_ms = elapsed,
                );
                Ok(file)
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = cmd,
                    reason_code = code,
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
}
#[tauri::command]
pub async fn read_native_text(
    webview: tauri::Webview,
    access: tauri::State<'_, FileAccess>,
    key: String,
) -> Result<String, NativeFailure> {
    in_command_span(WebCommand::ReadNativeText, &webview, |started, cmd| {
        // 授权解析失败也是命令结果：早退路径同样记 operation_result，不留空白。
        let outcome = access.path(&key, false).and_then(|path| {
            // **摘要算的就是应用拿到的这份字节** ✓ ⇒ ⇒ 记下的就是"应用手上那一版" ✓。
            let content = read_content(&path)?;
            access.record_digest(&key, &content.digest)?;
            Ok(content.text)
        });
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(text) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = cmd,
                    bytes = text.len(),
                    elapsed_ms = elapsed,
                );
                Ok(text)
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = cmd,
                    reason_code = code,
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
}
/// **写回原文件** ✓：**与通用字节写入分开** ✓（§3.2 ✓）。
///
/// **通用入口只写选择器刚给的新目标** ✓ ⇒ ⇒ 那里没有"应用手上那一版" ✓
/// ⇒ ⇒ 无从复核 ✓。**原文件写回必须走这里** ✓ ⇒ ⇒ 复核是这条命令自带的 ✓
/// ⇒ ⇒ 前端不能选择不复核 ✓。
///
/// **期望摘要由原生侧取** ✓ ⇒ ⇒ 前端不传 ✓ ⇒ ⇒ 应用侧没有第二份事实会漂 ✓（§3.4 ✓）。
///
/// **复核在提交前** ✓ ⇒ ⇒ 目标被外部改过 ⇒ ⇒ 报 `write-target-changed` ✓
/// ⇒ ⇒ **不写它** ✓ ⇒ ⇒ 草稿与文件两边都不动 ✓ ⇒ ⇒ 交给用户决定 ✓（§6.1 ✓）。
#[tauri::command]
pub async fn write_native_sync(
    webview: tauri::Webview,
    access: tauri::State<'_, FileAccess>,
    key: String,
    bytes: Vec<u8>,
) -> Result<(), NativeFailure> {
    in_command_span(WebCommand::WriteNativeSync, &webview, |started, cmd| {
        let outcome = access.path(&key, true).and_then(|path| {
            // **要复核的那一份** ✓：授权里记的"应用手上那一版" ✓（§6.1 ✓）。
            let expected = access.expected_digest(&key)?;
            commit_bytes(&path, &bytes, Some(&expected))?;
            // **写出去的那份就是应用手上那一版** ✓ ⇒ ⇒ 记下来 ✓ ⇒ ⇒ 之后答"是" ✓。
            access.record_digest(&key, &crate::hash::sha256_hex(&bytes))?;
            Ok(())
        });
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(()) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = cmd,
                    bytes = bytes.len(),
                    elapsed_ms = elapsed,
                );
                Ok(())
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = cmd,
                    reason_code = code,
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
}
#[tauri::command]
pub async fn write_native_bytes(
    webview: tauri::Webview,
    access: tauri::State<'_, FileAccess>,
    key: String,
    bytes: Vec<u8>,
) -> Result<(), NativeFailure> {
    in_command_span(WebCommand::WriteNativeBytes, &webview, |started, cmd| {
        let outcome = access.path(&key, true).and_then(|path| {
            // **通用入口不复核** ✓ ⇒ ⇒ 它写的是选择器刚给的目标 ✓ ⇒ ⇒ 那里没有基线 ✓。
            // **原文件写回走 `write_native_sync`** ✓ ⇒ ⇒ 那条才复核 ✓（§3.2 ✓）。
            commit_bytes(&path, &bytes, None)?;
            // **写出去的那份就是应用手上那一版** ✓ ⇒ ⇒ 记下来 ✓ ⇒ ⇒ 之后答"是" ✓。
            access.record_digest(&key, &crate::hash::sha256_hex(&bytes))?;
            Ok(())
        });
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(()) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = cmd,
                    bytes = bytes.len(),
                    elapsed_ms = elapsed,
                );
                Ok(())
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = cmd,
                    reason_code = code,
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
}
/// **问一句：这个文件还是应用手上那一版吗** ✓（§3.1 ✓）。
///
/// **只回一句是或不是** ✓ ⇒ ⇒ 摘要值不出原生侧 ✓ ⇒ ⇒ 应用侧没有第二份事实会漂 ✓（§3.4 ✓）。
/// **应用侧拿到的就是这一个布尔** ✓ ⇒ ⇒ "无法证明"由应用侧记 null ✓（§2.3 ✓）。
#[tauri::command]
pub async fn is_native_synced(
    webview: tauri::Webview,
    access: tauri::State<'_, FileAccess>,
    key: String,
) -> Result<bool, NativeFailure> {
    in_command_span(WebCommand::IsNativeSynced, &webview, |started, cmd| {
        let outcome = access.synced(&key);
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(synced) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = cmd,
                    synced,
                    elapsed_ms = elapsed,
                );
                Ok(synced)
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = cmd,
                    reason_code = code,
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
}
/// 产品形态打印的回执与留证读数。
///
/// **回执与证据是两回事** ✓：回执给调用方（页面）✓，证据进日志 ✓。
/// 字节数、是否提交、临时文件清掉了没有，都是原生侧的观测 ✓——
/// 页面自述证明不了"提交成功才 saved" ✓，原生侧能证明 ✓。
struct PrintReceipt {
    /// 回执：**目标提交成功才是 `saved`** ✓；否则 `not-committed` ✓。
    receipt: &'static str,
    /// 产出的字节数 ✓。
    bytes: u64,
    /// 目标是否已提交 ✓（rename 成功才是提交 ✓）。
    committed: bool,
    /// **临时文件清掉了没有** ✓：提交要么把它改名成目标 ✓，要么删掉它 ✓，
    /// 而删不掉是有可能的 ✓（文件被占着 ✓）——清理的结果也得留证 ✓。
    pdf_temp_removed: bool,
}

/// 打印失败的读数：人读的原因 ✓ + 清理的结果 ✓。
///
/// 原因给页面 ✓（人读 ✓），日志用稳定码 ✓；
/// 清理的结果两边都要 ✓——冻结清单要"超时 → 删除" ✓，
/// 而日志证明不了删没删 ✓。
struct PrintFailureReading {
    /// 人读的原因短语 ✓。
    ///
    /// 默认构建里没人读它 ✓：命令边界只给固定码 ✓（原因不是码 ✓），
    /// 读它的是探针 ✓ ⇒ 而探针的打印路径是 Windows 专属 ✓ ⇒
    /// 于是只有「Windows + 带探针特性」这一种形状里它活着 ✓ ⇒
    /// 与本仓"死代码随平台与特性各占一半"的约定一致 ✓。
    #[cfg_attr(not(all(target_os = "windows", feature = "pdf-probe")), allow(dead_code))]
    reason: String,
    /// 临时文件清掉了没有 ✓。
    pdf_temp_removed: bool,
}

impl From<String> for PrintFailureReading {
    fn from(reason: String) -> Self {
        // 授权没解析出来 ✓：打印压根没开始 ✓，没有临时文件 ✓，也就没有可清的东西 ✓。
        PrintFailureReading {
            reason,
            pdf_temp_removed: true,
        }
    }
}

/// 把一段 HTML 静默打印成 PDF，落到用户在原生保存对话框里选定的目标。
///
/// 目标由 `select_native_save` 的授权给出（key）——**路径只在原生侧可见** ✓（前端拿不到 ✓）。
/// 打印完即释放该授权 ✓（成功失败都释放 ✓）。
/// 回执：**目标提交成功才 saved** ✓；失败时原文件保持不变 ✓。
///
/// 这是 D7 的产品形态入口 ✓；**不接生产 UI** ✓（M9 才接 ✓）。
#[tauri::command]
pub async fn print_native_pdf(
    webview: tauri::Webview,
    app: tauri::AppHandle,
    access: tauri::State<'_, FileAccess>,
    html: String,
    key: String,
) -> Result<String, NativeFailure> {
    // **走来源守卫** ✓：这个命令写文件 ✓，守卫是本项目唯一的隔离层 ✓。
    in_command_span(WebCommand::PrintNativePdf, &webview, |started, cmd| {
        let outcome = print_native_pdf_impl(&app, &access, &html, &key);
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(receipt) => {
                if receipt.committed {
                    tracing::info!(
                        event = "operation_result",
                        result = "ok",
                        command = cmd,
                        bytes = receipt.bytes,
                        elapsed_ms = elapsed,
                        committed = receipt.committed,
                        pdf_temp_removed = receipt.pdf_temp_removed,
                    );
                } else {
                    // 印出来了但没提交成功：原文件还在，**不是 saved** ✓。
                    // 稳定码给证据看 ✓（人读的原因在返回值里 ✓）。
                    tracing::warn!(
                        event = "operation_result",
                        result = "error",
                        command = cmd,
                        reason_code = "print-not-committed",
                        bytes = receipt.bytes,
                        elapsed_ms = elapsed,
                        committed = receipt.committed,
                        pdf_temp_removed = receipt.pdf_temp_removed,
                    );
                }
                Ok(receipt.receipt.to_owned())
            }
            Err(failure) => {
                tracing::warn!(
                    event = "operation_result",
                    result = "error",
                    command = cmd,
                    reason_code = "print-failed",
                    elapsed_ms = elapsed,
                    committed = false,
                    // 清理的结果也留证 ✓：失败路径上的临时文件同样可能删不掉 ✓。
                    pdf_temp_removed = failure.pdf_temp_removed,
                );
                // 打印路径的失败原因是**诊断句**（"打印宿主创建失败"）✓，不是机器码 ✓：
                // 命令边界只给稳定的码 ✓（§3.1：打印路径不在 M4a 的范围 ✓）。
                // 诊断句留在原生侧 ✓：探针按它取证 ✓（它直接读 impl 的回执 ✓）。
                Err("print-failed".to_owned())
            }
        }
    })
}

/// 取授权里的目标路径。
///
/// **取不到也把授权用掉** ✓：这次尝试已经用过它了 ✓——
/// 否则只读授权会活下来 ✓，"成败都释放"那句话就不成立 ✓。
///
/// **拿只读授权当写授权用，授权同样被用掉** ✓：这不是"没碰它"，是"用错了" ✓——
/// 授权是给这次尝试的 ✓，不是给以后随便什么时候的 ✓。
/// 页面若误传了只读的 key ✓，那个读能力会一并失效 ✓（较狠 ✓，但是有意的 ✓）。
///
/// 只有打印入口这么做 ✓：读入口的授权要活到正常清理 ✓（探针连着读两次 ✓）。
#[allow(dead_code)]
fn consume_grant(access: &FileAccess, key: &str) -> Result<PathBuf, String> {
    match access.path(key, true) {
        Ok(path) => Ok(path),
        Err(code) => {
            access.revoke(key);
            Err(code)
        }
    }
}

/// 静默打印的实现。**生产构建的一部分** ✓（M9 接入 ✓）：Windows 走 COM ✓。
#[cfg(target_os = "windows")]
fn print_native_pdf_impl(
    app: &tauri::AppHandle,
    access: &FileAccess,
    html: &str,
    key: &str,
) -> Result<PrintReceipt, PrintFailureReading> {
    // 授权里的路径才是目标：前端只知道 key ✓。
    let target = consume_grant(access, key)?;
    let outcome = crate::pdf_print::print_html_to_pdf(app, html, &target).map_err(|failure| {
        PrintFailureReading {
            reason: failure.reason,
            pdf_temp_removed: failure.pdf_temp_removed,
        }
    });
    // 无论成败都释放授权：目标已定，继续留着没有意义 ✓。
    access.revoke(key);
    outcome.map(|outcome| PrintReceipt {
        receipt: if outcome.committed { "saved" } else { "not-committed" },
        bytes: outcome.bytes,
        committed: outcome.committed,
        pdf_temp_removed: outcome.pdf_temp_removed,
    })
}

/// **没有静默打印能力的平台** ✓（Windows 之外 ✓ —— 依赖 WebView2 的 PrintToPdf ✓）。
#[cfg(not(target_os = "windows"))]
fn print_native_pdf_impl(
    _app: &tauri::AppHandle,
    _access: &FileAccess,
    _html: &str,
    _key: &str,
) -> Result<PrintReceipt, PrintFailureReading> {
    Err(PrintFailureReading {
        reason: "静默 PDF 打印只支持 Windows（依赖 WebView2 的 PrintToPdf）".to_owned(),
        // 没有临时文件，也没有可清的东西 ✓。
        pdf_temp_removed: true,
    })
}

#[tauri::command]
pub fn release_native_file(
    webview: tauri::Webview,
    access: tauri::State<'_, FileAccess>,
    key: String,
) -> Result<(), NativeFailure> {
    in_command_span(WebCommand::ReleaseNativeFile, &webview, |started, cmd| {
        let outcome = access
            .0
            .lock()
            .map_err(internal_error)
            .map(|mut grants| {
                grants.remove(&key);
            });
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(()) => {
                tracing::info!(
                    event = "operation_result",
                    result = "ok",
                    command = cmd,
                    elapsed_ms = elapsed,
                );
                Ok(())
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                    result = "error",
                    command = cmd,
                    reason_code = code.as_str(),
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn read_text_accepts_limit_and_rejects_one_byte_over() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("boundary.md");
        let mut file = File::create(&path).unwrap();
        file.write_all(&vec![b'a'; READ_LIMIT as usize]).unwrap();
        drop(file);
        assert_eq!(read_content(&path).unwrap().text.len() as u64, READ_LIMIT);
        let mut file = File::create(&path).unwrap();
        file.write_all(&vec![b'a'; READ_LIMIT as usize + 1])
            .unwrap();
        drop(file);
        assert_eq!(read_content(&path).unwrap_err(), "file-too-large");
    }

    #[test]
    fn read_text_is_strict_utf8_and_removes_only_initial_bom() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("utf8.md");
        std::fs::write(&path, "\u{feff}中文🙂".as_bytes()).unwrap();
        assert_eq!(read_content(&path).unwrap().text, "中文🙂");
        std::fs::write(&path, [0xE4, 0xB8]).unwrap();
        assert_eq!(read_content(&path).unwrap_err(), "invalid-utf8");
        std::fs::write(&path, [0xC0, 0xAF]).unwrap();
        assert_eq!(read_content(&path).unwrap_err(), "invalid-utf8");
        std::fs::write(&path, [0xEF, 0xBB, 0xBF, b'x', 0xEF, 0xBB, 0xBF]).unwrap();
        assert_eq!(read_content(&path).unwrap().text, "x\u{feff}");
    }

    #[test]
    fn commit_bytes_replaces_exactly_and_keeps_directory_clean() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("saved.md");
        std::fs::write(&path, b"old bytes").unwrap();
        commit_bytes(&path, "新🙂内容".as_bytes(), None).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), "新🙂内容".as_bytes());
        let new_path = dir.path().join("new.md");
        commit_bytes(&new_path, b"new target", None).unwrap();
        assert_eq!(std::fs::read(&new_path).unwrap(), b"new target");
        let empty_path = dir.path().join("empty.md");
        std::fs::write(&empty_path, b"").unwrap();
        assert_eq!(read_content(&empty_path).unwrap().text, "");
        commit_bytes(&empty_path, b"", None).unwrap();
        assert_eq!(std::fs::read(&empty_path).unwrap(), b"");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 3);
    }

    #[test]
    fn failed_commit_preserves_existing_target_and_cleans_temporary_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("target-directory");
        std::fs::create_dir(&path).unwrap();
        std::fs::write(path.join("keep"), b"intact").unwrap();
        assert_eq!(
            commit_bytes(&path, b"replacement", None).unwrap_err(),
            "not-a-regular-target"
        );
        assert_eq!(std::fs::read(path.join("keep")).unwrap(), b"intact");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn size_limit_is_checked_before_creating_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("target.md");
        std::fs::write(&path, b"original").unwrap();
        assert_eq!(
            commit_bytes(&path, &vec![0; WRITE_LIMIT + 1], None).unwrap_err(),
            "file-too-large"
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn io_failures_are_told_apart_by_reason() {
        // 目标不存在与权限不足要能分开：UI 要区分"文件被移走"与"磁盘写不进去"（§9）。
        assert_eq!(
            io_error(&std::io::Error::from(std::io::ErrorKind::NotFound)),
            "native-target-missing"
        );
        assert_eq!(
            io_error(&std::io::Error::from(std::io::ErrorKind::PermissionDenied)),
            "native-permission-denied"
        );
        assert_eq!(
            io_error(&std::io::Error::from(std::io::ErrorKind::BrokenPipe)),
            "native-io-failed"
        );
        // 对话框故障与取消不同：取消是"未选"，没有码。
        assert_eq!(dialog_error("dialog exploded"), "native-dialog-failed");
        assert_eq!(internal_error("poisoned"), "native-internal-failed");
    }

    #[test]
    fn the_failure_shape_is_an_object_with_a_code() {
        // 前端按**对象**读失败 ✓（不再靠子串匹配 ✓）：形状固定为 {code} ✓。
        let value=serde_json::to_value(NativeFailure::from_code("native-io-failed".to_owned())).unwrap();
        assert_eq!(value, serde_json::json!({"code":"native-io-failed"}));
    }

    #[test]
    fn a_missing_target_reads_as_target_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("gone.md");
        assert_eq!(read_content(&path).unwrap_err(), "native-target-missing");
    }

    #[test]
    fn file_keys_enforce_read_write_roles_and_release_revokes_access() {
        let dir = tempfile::tempdir().unwrap();
        let read_path = dir.path().join("read.md");
        let write_path = dir.path().join("write.md");
        std::fs::write(&read_path, b"source").unwrap();
        let access = FileAccess::default();
        // 只读授权：能读，不能写。
        let read = access.grant(read_path.clone(), false).unwrap();
        assert_eq!(access.path(&read.key, false).unwrap(), read_path);
        assert_eq!(
            access.path(&read.key, true).unwrap_err(),
            "file-capability-mismatch"
        );
        // 可写授权：能写，也能读——写回原文件走同一次打开的 key，不必再选一次。
        let write = access.grant(write_path.clone(), true).unwrap();
        assert_eq!(access.path(&write.key, true).unwrap(), write_path);
        assert_eq!(access.path(&write.key, false).unwrap(), write_path);
        access.0.lock().unwrap().remove(&read.key);
        assert_eq!(
            access.path(&read.key, false).unwrap_err(),
            "unknown-file-key"
        );
    }

    #[test]
    fn synced_answers_yes_until_the_file_changes_underneath() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("version.md");
        std::fs::write(&path, b"first").unwrap();
        let access = FileAccess::default();
        let grant = access.grant(path.clone(), true).unwrap();
        // **没读过 ⇒ ⇒ 答不了** ✓ ⇒ ⇒ 那不是"变了" ✓ ⇒ ⇒ 是内部状态不可用 ✓。
        assert_eq!(
            access.synced(&grant.key).unwrap_err(),
            "native-internal-failed"
        );
        // 读过一次 ⇒ ⇒ 应用手上有了那一版 ✓ ⇒ ⇒ 答"是" ✓。
        let content = read_content(&path).unwrap();
        access.record_digest(&grant.key, &content.digest).unwrap();
        assert!(access.synced(&grant.key).unwrap());
        // **应用外改过** ⇒ ⇒ 答"不是" ✓ ⇒ ⇒ 应用据此提示"已变化" ✓（§5.2 ✓）。
        std::fs::write(&path, b"second").unwrap();
        assert!(!access.synced(&grant.key).unwrap());
        // **写出去的那份就是应用手上那一版** ✓ ⇒ ⇒ 记下来 ⇒ ⇒ 之后答"是" ✓。
        commit_bytes(&path, b"third", None).unwrap();
        access
            .record_digest(&grant.key, &crate::hash::sha256_hex(b"third"))
            .unwrap();
        assert!(access.synced(&grant.key).unwrap());
        // **不认识的 key** ✓ ⇒ ⇒ 稳定码 ✓。
        assert_eq!(access.synced("not-a-key").unwrap_err(), "unknown-file-key");
    }

    #[test]
    fn synced_reports_a_missing_file_by_its_own_code() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("gone.md");
        std::fs::write(&path, b"here").unwrap();
        let access = FileAccess::default();
        let grant = access.grant(path.clone(), true).unwrap();
        let content = read_content(&path).unwrap();
        access.record_digest(&grant.key, &content.digest).unwrap();
        std::fs::remove_file(&path).unwrap();
        // **文件没了** ⇒ ⇒ 那是它自己的码 ✓ ⇒ ⇒ 界面能说"关联已失效" ✓（§8.5 ✓）。
        assert_eq!(
            access.synced(&grant.key).unwrap_err(),
            "native-target-missing"
        );
    }

    #[cfg(unix)]
    #[test]
    fn commit_bytes_preserves_target_permissions() {        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mode.md");
        std::fs::write(&path, b"old").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        commit_bytes(&path, b"new", None).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o644);
    }

    /// **写回前复核** ✓：目标没变 ⇒ ⇒ 写进去 ✓；变了 ⇒ ⇒ **不写它** ✓（§6.1 ✓）。
    #[test]
    fn a_write_is_refused_when_the_target_changed_underneath() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sync.md");
        std::fs::write(&path, b"base").unwrap();
        let access = FileAccess::default();
        let grant = access.grant(path.clone(), true).unwrap();
        let content = read_content(&path).unwrap();
        access.record_digest(&grant.key, &content.digest).unwrap();

        // **目标还是那一版** ⇒ ⇒ 复核通过 ⇒ ⇒ 写进去 ✓ ⇒ ⇒ 基线跟着更新 ✓。
        let expected = access.expected_digest(&grant.key).unwrap();
        commit_bytes(&path, b"draft", Some(&expected)).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"draft");

        // **应用外改过** ⇒ ⇒ 复核不匹配 ⇒ ⇒ **不写它** ✓ ⇒ ⇒ 文件内容原样 ✓。
        std::fs::write(&path, b"external").unwrap();
        let stale = access.expected_digest(&grant.key).unwrap();
        assert_eq!(
            commit_bytes(&path, b"draft again", Some(&stale)).unwrap_err(),
            "write-target-changed"
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"external");
        // **临时文件不留残骸** ✓ ⇒ ⇒ 目录干净 ✓。
        let leftovers = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name() != "sync.md")
            .count();
        assert_eq!(leftovers, 0);
    }

    /// **期望摘要由原生侧取** ✓ ⇒ ⇒ 前端不传 ✓ ⇒ ⇒ 没记过版本就复核不了 ✓。
    #[test]
    fn the_expected_digest_comes_from_the_grant() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("expected.md");
        std::fs::write(&path, b"base").unwrap();
        let access = FileAccess::default();
        let grant = access.grant(path.clone(), true).unwrap();
        // **没记过版本 ⇒ ⇒ 复核不了** ✓ ⇒ ⇒ 那是内部状态不可用 ✓ ⇒ ⇒ 不是"变了" ✓。
        assert_eq!(
            access.expected_digest(&grant.key).unwrap_err(),
            "native-internal-failed"
        );
        let content = read_content(&path).unwrap();
        access.record_digest(&grant.key, &content.digest).unwrap();
        // **取到的那份就是磁盘上那一版** ✓ ⇒ ⇒ 与问答用的是同一个比较 ✓。
        assert_eq!(access.expected_digest(&grant.key).unwrap(), content.digest);
        assert!(access.synced(&grant.key).unwrap());
        // **不认识的 key** ✓ ⇒ ⇒ 稳定码 ✓。
        assert_eq!(
            access.expected_digest("not-a-key").unwrap_err(),
            "unknown-file-key"
        );
    }

    #[cfg(unix)]
    #[test]
    fn grant_accepts_names_that_are_not_valid_utf8() {
        use std::os::unix::ffi::OsStrExt;
        let dir = tempfile::tempdir().unwrap();
        // The file need not exist: the name is what must survive the round trip.
        let path = dir.path().join(std::ffi::OsStr::from_bytes(b"report-\xff.md"));
        let access = FileAccess::default();
        let granted = access.grant(path.clone(), false).unwrap();
        assert!(granted.name.contains('\u{fffd}'));
        assert_eq!(access.path(&granted.key, false).unwrap(), path);
    }

    #[test]
    fn a_grant_used_as_a_write_grant_is_consumed_too() {
        // 只读授权被当成写授权用 → 这次尝试已经用过它了 → 授权不再活着。
        // 否则"成败都释放"那句话在早退路径上不成立。
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("read-only.md");
        std::fs::write(&path, b"x").unwrap();
        let access = FileAccess::default();
        let granted = access.grant(path.clone(), false).unwrap();
        assert_eq!(
            consume_grant(&access, &granted.key).unwrap_err(),
            "file-capability-mismatch".to_owned()
        );
        // 授权已被用掉：再取就是 unknown-file-key。
        assert_eq!(
            access.path(&granted.key, false).unwrap_err(),
            "unknown-file-key".to_owned()
        );
    }

    #[test]
    fn dropped_files_get_the_same_grants_as_the_picker() {
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("note.md");
        std::fs::write(&note, b"x").unwrap();
        let picture = dir.path().join("picture.png");
        std::fs::write(&picture, b"x").unwrap();
        let access = FileAccess::default();
        let dropped = grant_dropped(vec![note.clone(), picture], &access);
        // 不可打开的直接忽略 ✓：不铸授权 ✓ ⇒ 不留要回收的授权 ✓。
        assert_eq!(dropped.len(), 1);
        assert_eq!(dropped[0].name, "note.md");
        // 与选择器同一套授权与身份 ✓：同一个文件 ⇒ 同一个身份 ✓（去重因此成立 ✓）。
        let picked = access.grant(note, true).unwrap();
        assert_eq!(dropped[0].reference, picked.reference);
    }

    #[test]
    fn only_the_documented_extensions_are_openable() {
        assert!(is_openable(Path::new("a.md")));
        assert!(is_openable(Path::new("a.MD")));
        assert!(is_openable(Path::new("a.markdown")));
        assert!(is_openable(Path::new("a.txt")));
        assert!(is_openable(Path::new("a.html")));
        assert!(is_openable(Path::new("a.htm")));
        assert!(!is_openable(Path::new("a.png")));
        assert!(!is_openable(Path::new("a")));
    }

    #[test]
    fn the_size_failure_carries_the_limit_of_its_command() {
        // **读与写各有各的上限** ✓ ⇒ ⇒ 谁拥有这个事实谁给出 ✓（§8.5 ✓）。
        assert_eq!(
            failure_with_limit(FILE_TOO_LARGE.into(), WebCommand::ReadNativeText).limit_bytes,
            Some(READ_LIMIT)
        );
        assert_eq!(
            failure_with_limit(FILE_TOO_LARGE.into(), WebCommand::WriteNativeBytes).limit_bytes,
            Some(WRITE_LIMIT as u64)
        );
        // **别的失败不带上限** ✓ ⇒ ⇒ 前端不必猜 ✓。
        assert_eq!(
            failure_with_limit("native-io-failed".into(), WebCommand::ReadNativeText).limit_bytes,
            None
        );
        // **没有上限的命令也不带** ✓。
        assert_eq!(limit_for(WebCommand::SelectNativeOpen), None);
        // **不带上限时载荷里没有这一项** ✓ ⇒ ⇒ 前端拿到的是可选字段 ✓。
        let value = serde_json::to_value(NativeFailure::from_code("native-io-failed".to_owned()))
            .unwrap();
        assert!(value.get("limitBytes").is_none());
        // **带上限时载荷里就有** ✓ ⇒ ⇒ 前端能说清是多少 ✓。
        let value = serde_json::to_value(failure_with_limit(
            FILE_TOO_LARGE.into(),
            WebCommand::ReadNativeText,
        ))
        .unwrap();
        assert_eq!(value.get("limitBytes").and_then(|v| v.as_u64()), Some(READ_LIMIT));
    }

    /// **两端共用的那份契约** ✓（`docs/contracts/file-read.json` ✓）。
    fn shared_contract() -> serde_json::Value {
        let raw = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../docs/contracts/file-read.json"
        ))
        .expect("the shared file-read contract must be readable");
        serde_json::from_str(&raw).expect("the shared file-read contract must be valid json")
    }

    /// **两个上限与契约相等** ✓。
    ///
    /// **原生侧各有一份常量** ✓ ⇒ ⇒ 契约是那一份事实 ✓ ⇒ ⇒ 这里盯住它 ✓
    /// ⇒ ⇒ 改契约而忘了改这边 ⇒ ⇒ **红** ✓（§5.1 ✓：两端不会给出不同的可导入集合 ✓）。
    #[test]
    fn the_limits_match_the_shared_contract() {
        let contract = shared_contract();
        assert_eq!(
            contract["limits"]["importBytes"].as_u64(),
            Some(READ_LIMIT),
            "the import limit must match the shared contract"
        );
        assert_eq!(
            contract["limits"]["nativeWriteBytes"].as_u64(),
            Some(WRITE_LIMIT as u64),
            "the native write limit must match the shared contract"
        );
    }

    /// **同一批字节 ⇒ 同一个标识** ✓。
    ///
    /// **样本是两端共用的那一份** ✓（`docs/contracts/file-read.json` ✓）
    /// ⇒ ⇒ 浏览器侧在同一个文件上断言 ✓ ⇒ ⇒ 两端对同一批字节给出不同的结果时
    /// ⇒ ⇒ **两边各有一条红** ✓ ⇒ ⇒ 漂移无处藏 ✓（§9 ✓）。
    #[test]
    fn the_read_port_gives_the_same_result_as_the_browser_side() {
        let value = shared_contract();
        let cases = value["cases"].as_array().expect("cases must be an array");
        assert!(!cases.is_empty(), "the shared read cases must not be empty");
        for case in cases {
            let id = case["id"].as_str().expect("a case needs an id");
            let hex = case["bytes"].as_str().expect("a case needs bytes");
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("sample.md");
            std::fs::write(&path, decode_hex(hex)).unwrap();
            let outcome = read_content(&path);
            match case["expect"]["kind"].as_str() {
                Some("text") => {
                    let expected = case["expect"]["text"]
                        .as_str()
                        .expect("a text case needs text");
                    assert_eq!(
                        outcome.map(|content| content.text).unwrap_or_default(),
                        expected,
                        "case {}",
                        id
                    );
                }
                Some("code") => {
                    let expected = case["expect"]["code"]
                        .as_str()
                        .expect("a code case needs code");
                    assert_eq!(outcome.unwrap_err(), expected, "case {}", id);
                }
                other => panic!("a case needs an expectation, got {:?}", other),
            }
        }
    }

    /// 十六进制 ⇒ 字节 ✓。
    fn decode_hex(hex: &str) -> Vec<u8> {
        hex.as_bytes()
            .chunks(2)
            .map(|pair| {
                let text = std::str::from_utf8(pair).expect("hex pairs are ascii");
                u8::from_str_radix(text, 16).expect("hex pairs are hex")
            })
            .collect()
    }

    #[test]
    fn the_same_file_gets_the_same_reference_within_the_session() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("same.md");
        std::fs::write(&path, b"x").unwrap();
        let access = FileAccess::default();
        // 同一文件被多次选中：授权不同 ✓，身份相同 ✓（去重与聚焦靠它 ✓）。
        let first = access.grant(path.clone(), true).unwrap();
        let second = access.grant(path.clone(), true).unwrap();
        assert_ne!(first.key, second.key);
        assert_eq!(first.reference, second.reference);
        // 不同的文件是不同的身份。
        let other = dir.path().join("other.md");
        std::fs::write(&other, b"y").unwrap();
        assert_ne!(access.grant(other, true).unwrap().reference, first.reference);
    }

    #[cfg(unix)]
    #[test]
    fn a_symbolic_link_shares_the_reference_of_its_target() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("target.md");
        std::fs::write(&target, b"x").unwrap();
        let link = dir.path().join("link.md");
        std::os::unix::fs::symlink(&target, &link).unwrap();
        let access = FileAccess::default();
        // canonicalize 解析符号链接 ⇒ 两条路径指向同一个文件 ⇒ 同一个身份 ✓。
        assert_eq!(
            access.grant(target, true).unwrap().reference,
            access.grant(link, true).unwrap().reference
        );
    }

    #[test]
    fn a_write_grant_is_still_usable_when_it_matches() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("writable.md");
        std::fs::write(&path, b"x").unwrap();
        let access = FileAccess::default();
        let granted = access.grant(path.clone(), true).unwrap();
        assert_eq!(consume_grant(&access, &granted.key).unwrap(), path);
    }

    #[cfg(windows)]
    #[test]
    fn persist_failure_preserves_existing_file_and_cleans_temp_file() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("locked.md");
        std::fs::write(&path, b"original bytes").unwrap();
        let locked = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .share_mode(0x0000_0001 | 0x0000_0002) // deny FILE_SHARE_DELETE
            .open(&path)
            .unwrap();
        // 写不进被占用的文件 ⇒ IO 家族的码 ✓：具体归到"权限"还是"其余"，
        // 取决于操作系统对共享冲突的归类 ✓，这里只断言它是 IO 失败 ✓。
        let code = commit_bytes(&path, b"replacement", None).unwrap_err();
        assert!(
            code == "native-permission-denied" || code == "native-io-failed",
            "unexpected code {code}"
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"original bytes");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        drop(locked);
    }
}
