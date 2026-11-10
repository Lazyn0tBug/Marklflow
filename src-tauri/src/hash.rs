//! 跨运行时原语：**一处实现** ✓（设计 §3.4 ✓）。
//!
//! **字节摘要只有这一份** ✓ ⇒ ⇒ PDF 留证与文件摘要命令共用它 ✓
//! ⇒ ⇒ 不再有第二份实现漂移 ✓。
//!
//! **磁盘内容的摘要由原生侧持有** ✓ ⇒ ⇒ 应用侧拿不到值 ✓ ⇒ ⇒ 只问一句 ✓
//! ⇒ ⇒ 这条问答由 `files.rs` 的 `is_native_synced` 回答 ✓。

use std::path::Path;

/// 字节的 sha256（十六进制）✓。
pub fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// 文件的 sha256 ✓：读不出来时给空串 ✓（与 PDF 留证那处一致 ✓ ⇒ ⇒ 同一份行为 ✓）。
pub fn file_sha256(path: &Path) -> String {
    std::fs::read(path)
        .ok()
        .map(|bytes| sha256_hex(&bytes))
        .unwrap_or_default()
}
