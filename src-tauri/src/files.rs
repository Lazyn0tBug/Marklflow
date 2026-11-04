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
fn in_command_span<T>(
    command: &'static str,
    webview: &tauri::Webview,
    body: impl FnOnce(std::time::Instant) -> Result<T, String>,
) -> Result<T, String> {
    let identity =
        source_guard::Identity::from_labels(webview.window().label(), webview.label());
    let span = logging::command_span(
        command,
        identity.window_label.as_ref(),
        identity.webview_label.as_ref(),
    );
    span.in_scope(|| {
        let started = std::time::Instant::now();
        if let Err(code) = ensure_allowed(command, &identity) {
            tracing::warn!(
                event = "operation_result",
                result = "denied",
                command = command,
                reason_code = code.as_str(),
                elapsed_ms = started.elapsed().as_millis(),
            );
            return Err(code);
        }
        body(started)
    })
}

pub const READ_LIMIT: u64 = 50 * 1024 * 1024;
pub const WRITE_LIMIT: usize = 100 * 1024 * 1024;
#[derive(Default)]
pub struct FileAccess(Mutex<HashMap<String, Grant>>);
struct Grant {
    path: PathBuf,
    writable: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedFile {
    pub(crate) key: String,
    name: String,
    size: u64,
}
fn error(_: impl std::fmt::Display) -> String {
    "native-io-failed".into()
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
            Err(e) => return Err(error(e)),
        };
        let key = uuid::Uuid::new_v4().to_string();
        self.0
            .lock()
            .map_err(error)?
            .insert(key.clone(), Grant { path, writable });
        Ok(SelectedFile { key, name, size })
    }
    fn path(&self, key: &str, writable: bool) -> Result<PathBuf, String> {
        let grants = self.0.lock().map_err(error)?;
        let grant = grants.get(key).ok_or("unknown-file-key")?;
        if grant.writable != writable {
            return Err("file-capability-mismatch".into());
        }
        Ok(grant.path.clone())
    }
    /// 撤销授权。探针用它在受控初始化结束时回收自己的授权；
    /// 正常的 release_native_file 业务清理不受影响。
    #[allow(dead_code)]
    pub(crate) fn revoke(&self, key: &str) {
        if let Ok(mut grants) = self.0.lock() {
            grants.remove(key);
        }
    }
}
pub fn read_text(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(error)?;
    if !file.metadata().map_err(error)?.is_file() {
        return Err("not-a-file".into());
    }
    let mut bytes = Vec::new();
    file.take(READ_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(error)?;
    if bytes.len() as u64 > READ_LIMIT {
        return Err("file-too-large".into());
    }
    // Match the Web TextDecoder: strict UTF-8, remove only an initial UTF-8 BOM.
    let text = String::from_utf8(bytes).map_err(|_| "invalid-utf8".to_string())?;
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_owned())
}
pub fn commit_bytes(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > WRITE_LIMIT {
        return Err("file-too-large".into());
    }
    // Reject symbolic links rather than silently replacing their directory entry.
    match std::fs::symlink_metadata(path) {
        Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() => {
            return Err("not-a-regular-target".into())
        }
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(error(e)),
        _ => {}
    }
    let parent = path.parent().ok_or("invalid-target")?;
    // The temporary file is created 0600; the target keeps its own permission bits.
    #[cfg(unix)]
    let existing_mode = std::fs::metadata(path).ok().map(|meta| meta.permissions().mode());
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(error)?;
    #[cfg(unix)]
    if let Some(mode) = existing_mode {
        let _ = temp.as_file().set_permissions(std::fs::Permissions::from_mode(mode));
    }
    temp.write_all(bytes).map_err(error)?;
    temp.as_file().sync_all().map_err(error)?;
    temp.persist(path).map_err(error)?;
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
) -> Result<Option<Vec<SelectedFile>>, String> {
    in_command_span("select_native_open", &webview, |started| {
        let outcome = paths_of(app, access);
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(files) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = "select_native_open",
                    count = files.as_ref().map(|items| items.len()).unwrap_or(0),
                    elapsed_ms = elapsed,
                );
                Ok(files)
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = "select_native_open",
                    reason_code = code,
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
}

/// 打开文件对话框并为选中的文件签发只读授权。
fn paths_of(
    app: tauri::AppHandle,
    access: tauri::State<'_, FileAccess>,
) -> Result<Option<Vec<SelectedFile>>, String> {
    let paths = app
        .dialog()
        .file()
        .add_filter("Documents", &["md", "markdown", "txt", "html", "htm"])
        .blocking_pick_files();
    paths
        .map(|items| {
            let mut selected = Vec::new();
            for item in items {
                match item
                    .into_path()
                    .map_err(error)
                    .and_then(|path| access.grant(path, false))
                {
                    Ok(file) => selected.push(file),
                    Err(failure) => {
                        let mut grants = access.0.lock().map_err(error)?;
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
) -> Result<Option<SelectedFile>, String> {
    in_command_span("select_native_save", &webview, |started| {
        if name.is_empty() || name.contains(['/', '\\', '\0']) || name == "." || name == ".." {
            tracing::warn!(
                event = "operation_result",
                        result = "error",
                command = "select_native_save",
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
            .map(|p| access.grant(p.into_path().map_err(error)?, true))
            .transpose();
        let elapsed = started.elapsed().as_millis();
        match granted {
            Ok(file) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = "select_native_save",
                    granted = file.is_some(),
                    elapsed_ms = elapsed,
                );
                Ok(file)
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = "select_native_save",
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
) -> Result<String, String> {
    in_command_span("read_native_text", &webview, |started| {
        // 授权解析失败也是命令结果：早退路径同样记 operation_result，不留空白。
        let outcome = access.path(&key, false).and_then(|path| read_text(&path));
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(text) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = "read_native_text",
                    bytes = text.len(),
                    elapsed_ms = elapsed,
                );
                Ok(text)
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = "read_native_text",
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
) -> Result<(), String> {
    in_command_span("write_native_bytes", &webview, |started| {
        let outcome = access
            .path(&key, true)
            .and_then(|path| commit_bytes(&path, &bytes));
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(()) => {
                tracing::info!(
                    event = "operation_result",
                            result = "ok",
                    command = "write_native_bytes",
                    bytes = bytes.len(),
                    elapsed_ms = elapsed,
                );
                Ok(())
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                            result = "error",
                    command = "write_native_bytes",
                    reason_code = code,
                    elapsed_ms = elapsed,
                );
                Err(code)
            }
        }
    })
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
    app: tauri::AppHandle,
    access: tauri::State<'_, FileAccess>,
    html: String,
    key: String,
) -> Result<String, String> {
    print_native_pdf_impl(&app, &access, &html, &key)
}

/// 静默打印的实现。带 `pdf-probe` 特性时才有这个能力 ✓。
#[cfg(feature = "pdf-probe")]
fn print_native_pdf_impl(
    app: &tauri::AppHandle,
    access: &FileAccess,
    html: &str,
    key: &str,
) -> Result<String, String> {
    // 授权里的路径才是目标：前端只知道 key ✓。
    let target = access.path(key, true).map_err(|code| code.to_owned())?;
    let outcome = crate::pdf_print::print_html_to_pdf(app, html, &target)
        .map_err(|failure| failure.reason);
    // 无论成败都释放授权：目标已定，继续留着没有意义 ✓。
    access.revoke(key);
    outcome.map(|outcome| {
        if outcome.committed { "saved".to_owned() } else { "not-committed".to_owned() }
    })
}

/// 不含静默打印能力的构建 ✓。
#[cfg(not(feature = "pdf-probe"))]
fn print_native_pdf_impl(
    _app: &tauri::AppHandle,
    _access: &FileAccess,
    _html: &str,
    _key: &str,
) -> Result<String, String> {
    Err("此构建不含静默 PDF 打印（需 pdf-probe 特性）".to_owned())
}

#[tauri::command]
pub fn release_native_file(
    webview: tauri::Webview,
    access: tauri::State<'_, FileAccess>,
    key: String,
) -> Result<(), String> {
    in_command_span("release_native_file", &webview, |started| {
        let outcome = access
            .0
            .lock()
            .map_err(error)
            .map(|mut grants| {
                grants.remove(&key);
            });
        let elapsed = started.elapsed().as_millis();
        match outcome {
            Ok(()) => {
                tracing::info!(
                    event = "operation_result",
                    result = "ok",
                    command = "release_native_file",
                    elapsed_ms = elapsed,
                );
                Ok(())
            }
            Err(code) => {
                tracing::warn!(
                    event = "operation_result",
                    result = "error",
                    command = "release_native_file",
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
        assert_eq!(read_text(&path).unwrap().len() as u64, READ_LIMIT);
        let mut file = File::create(&path).unwrap();
        file.write_all(&vec![b'a'; READ_LIMIT as usize + 1])
            .unwrap();
        drop(file);
        assert_eq!(read_text(&path).unwrap_err(), "file-too-large");
    }

    #[test]
    fn read_text_is_strict_utf8_and_removes_only_initial_bom() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("utf8.md");
        std::fs::write(&path, "\u{feff}中文🙂".as_bytes()).unwrap();
        assert_eq!(read_text(&path).unwrap(), "中文🙂");
        std::fs::write(&path, [0xE4, 0xB8]).unwrap();
        assert_eq!(read_text(&path).unwrap_err(), "invalid-utf8");
        std::fs::write(&path, [0xC0, 0xAF]).unwrap();
        assert_eq!(read_text(&path).unwrap_err(), "invalid-utf8");
        std::fs::write(&path, [0xEF, 0xBB, 0xBF, b'x', 0xEF, 0xBB, 0xBF]).unwrap();
        assert_eq!(read_text(&path).unwrap(), "x\u{feff}");
    }

    #[test]
    fn commit_bytes_replaces_exactly_and_keeps_directory_clean() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("saved.md");
        std::fs::write(&path, b"old bytes").unwrap();
        commit_bytes(&path, "新🙂内容".as_bytes()).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), "新🙂内容".as_bytes());
        let new_path = dir.path().join("new.md");
        commit_bytes(&new_path, b"new target").unwrap();
        assert_eq!(std::fs::read(&new_path).unwrap(), b"new target");
        let empty_path = dir.path().join("empty.md");
        std::fs::write(&empty_path, b"").unwrap();
        assert_eq!(read_text(&empty_path).unwrap(), "");
        commit_bytes(&empty_path, b"").unwrap();
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
            commit_bytes(&path, b"replacement").unwrap_err(),
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
            commit_bytes(&path, &vec![0; WRITE_LIMIT + 1]).unwrap_err(),
            "file-too-large"
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn file_keys_enforce_read_write_roles_and_release_revokes_access() {
        let dir = tempfile::tempdir().unwrap();
        let read_path = dir.path().join("read.md");
        let write_path = dir.path().join("write.md");
        std::fs::write(&read_path, b"source").unwrap();
        let access = FileAccess::default();
        let read = access.grant(read_path.clone(), false).unwrap();
        assert_eq!(access.path(&read.key, false).unwrap(), read_path);
        assert_eq!(
            access.path(&read.key, true).unwrap_err(),
            "file-capability-mismatch"
        );
        let write = access.grant(write_path.clone(), true).unwrap();
        assert_eq!(access.path(&write.key, true).unwrap(), write_path);
        assert_eq!(
            access.path(&write.key, false).unwrap_err(),
            "file-capability-mismatch"
        );
        access.0.lock().unwrap().remove(&read.key);
        assert_eq!(
            access.path(&read.key, false).unwrap_err(),
            "unknown-file-key"
        );
    }

    #[cfg(unix)]
    #[test]
    fn commit_bytes_preserves_target_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("mode.md");
        std::fs::write(&path, b"old").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        commit_bytes(&path, b"new").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new");
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o644);
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
        assert_eq!(
            commit_bytes(&path, b"replacement").unwrap_err(),
            "native-io-failed"
        );
        assert_eq!(std::fs::read(&path).unwrap(), b"original bytes");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
        drop(locked);
    }
}
