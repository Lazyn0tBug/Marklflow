use serde::Serialize;
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri_plugin_dialog::DialogExt;

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
    key: String,
    name: String,
    size: u64,
}
fn error(_: impl std::fmt::Display) -> String {
    "native-io-failed".into()
}
impl FileAccess {
    fn grant(&self, path: PathBuf, writable: bool) -> Result<SelectedFile, String> {
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("invalid-file-name")?
            .to_owned();
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
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(error)?;
    temp.write_all(bytes).map_err(error)?;
    temp.as_file().sync_all().map_err(error)?;
    temp.persist(path).map_err(error)?;
    Ok(())
}
#[tauri::command]
pub async fn select_native_open(
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
    access: tauri::State<'_, FileAccess>,
    name: String,
) -> Result<Option<SelectedFile>, String> {
    if name.is_empty() || name.contains(['/', '\\', '\0']) || name == "." || name == ".." {
        return Err("invalid-file-name".into());
    }
    app.dialog()
        .file()
        .set_file_name(name)
        .blocking_save_file()
        .map(|p| access.grant(p.into_path().map_err(error)?, true))
        .transpose()
}
#[tauri::command]
pub async fn read_native_text(
    access: tauri::State<'_, FileAccess>,
    key: String,
) -> Result<String, String> {
    read_text(&access.path(&key, false)?)
}
#[tauri::command]
pub async fn write_native_bytes(
    access: tauri::State<'_, FileAccess>,
    key: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    commit_bytes(&access.path(&key, true)?, &bytes)
}
#[tauri::command]
pub fn release_native_file(
    access: tauri::State<'_, FileAccess>,
    key: String,
) -> Result<(), String> {
    access.0.lock().map_err(error)?.remove(&key);
    Ok(())
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
