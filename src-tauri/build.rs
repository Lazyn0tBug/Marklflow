use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// **构建标识烤进二进制** ✓ ⇒ ⇒ 日志能说出**是哪个构建** ✓ ⇒ ⇒
/// 不用问人那个包是不是新的 ✓ ⇒ ⇒ 也不用靠时间戳猜 ✓。
///
/// **取不到就写 unknown** ✓ ⇒ ⇒ 没有 git 也能构建 ✓ ⇒ ⇒ 不因为标识而失败 ✓。
fn main() {
    println!("cargo:rustc-env=MARKFLOW_BUILD_COMMIT={}", commit());
    println!("cargo:rustc-env=MARKFLOW_BUILD_TIME={}", build_time());
    tauri_build::build()
}

/// 当前 commit 的短哈希 ✓；不在仓库里（或没有 git ✓）⇒ `unknown` ✓。
fn commit() -> String {
    let output = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output();
    match output {
        Ok(result) if result.status.success() => {
            let text = String::from_utf8_lossy(&result.stdout).trim().to_string();
            if text.is_empty() {
                "unknown".to_string()
            } else {
                text
            }
        }
        _ => "unknown".to_string(),
    }
}

/// 构建时刻（UTC ✓）⇒ ⇒ 与 commit 一起 ⇒ ⇒ 说清**什么时候出的那个包** ✓。
fn build_time() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format_utc(seconds)
}

/// 秒 → `YYYY-MM-DDTHH:MM:SSZ` ✓（UTC ✓）⇒ ⇒ 不引第三方库 ✓。
fn format_utc(seconds: u64) -> String {
    let days = (seconds / 86_400) as i64;
    let rest = seconds % 86_400;
    let (hour, minute, second) = (rest / 3600, (rest % 3600) / 60, rest % 60);
    // 天数 → 年月日（Howard Hinnant 的 civil_from_days ✓）。
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 146_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}
