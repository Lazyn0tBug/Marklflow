//! 日志基座（L1）：文件为主 sink，stdout 为次 sink。
//!
//! 契约见 `docs/design/log-base-plan-2026-11-03.md`（§3 L1 与 §3.2 轮转、§5.1 span 模型、§5.2 记录契约）。
//!
//! 要点：
//! - **按运行分文件**（`markflow.<pid>.log`）：同一文件天然只有一个写者，不需要跨进程协调；
//! - **专用写线程 + 有界队列**：生产者不等队列也不等文件 I/O，队列满则丢弃并计数，超长记录拒收不截断；
//! - **记录自己成形**：必填字段与 span 上下文由本模块生成，不依赖 formatter 的默认形态；
//! - **如实记录**：不记录完整授权 key、文档正文与完整本地路径；字段纪律由 §5.2 的白名单约束。

use std::collections::BTreeMap;
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::Manager;
use tracing::field::{Field, Visit};
use tracing::{Event, Subscriber};
use tracing_subscriber::layer::{Context, Layer, SubscriberExt};
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::util::SubscriberInitExt;

/// 单文件字节上限。
pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
/// 归档保留份数。
pub const KEEP_ARCHIVES: usize = 10;
/// 有界队列容量。满则丢弃新记录并计数。
const QUEUE_CAPACITY: usize = 1024;
/// 单条记录编码后的字节上限。超长拒收，不截断（截断会产出无效 JSON）。
const MAX_RECORD_BYTES: usize = 16 * 1024;
/// 写线程的轮询间隔，同时也是"至少每秒刷新"的下界。
const WRITER_TICK: Duration = Duration::from_millis(500);
/// 退出时排空队列的最长等待。
pub const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
/// 记录契约版本。
const SCHEMA_VERSION: u32 = 1;
/// 健康摘要的输出间隔（限频，避免每次丢弃都递归产生日志）。
const HEALTH_SUMMARY_INTERVAL: Duration = Duration::from_secs(30);

/// 进程内的日志健康状态。计数有界，不跨崩溃保留。
#[derive(Default)]
pub struct Health {
    /// 队列满而丢弃的记录数。
    pub dropped: AtomicU64,
    /// 超长而拒收的记录数。
    pub rejected: AtomicU64,
    /// 写入失败次数。
    pub write_failures: AtomicU64,
    /// 轮转失败次数。
    pub rotate_failures: AtomicU64,
    /// 归档删除失败次数。
    pub delete_failures: AtomicU64,
    /// 文件 sink 不可用（目录不可创建或不可打开）。
    pub file_unavailable: AtomicBool,
    /// stdout 输出已停用。
    pub stdout_failed: AtomicBool,
}

/// 健康状态的一次快照。
#[derive(Clone, Copy, Debug, Default)]
pub struct HealthSnapshot {
    pub dropped: u64,
    pub rejected: u64,
    pub write_failures: u64,
    pub rotate_failures: u64,
    pub delete_failures: u64,
    pub file_unavailable: bool,
    pub stdout_failed: bool,
}

static HEALTH: Health = Health::new_const();
static RUN_ID: OnceLock<String> = OnceLock::new();
/// 根 span：本次运行。所有调用 span 都是它的直接子。
static RUN_SPAN: OnceLock<tracing::Span> = OnceLock::new();
/// 写线程的唤醒通道，退出时用它排空队列。
static SENDER: OnceLock<SyncSender<QueuedRecord>> = OnceLock::new();

impl Health {
    const fn new_const() -> Self {
        Self {
            dropped: AtomicU64::new(0),
            rejected: AtomicU64::new(0),
            write_failures: AtomicU64::new(0),
            rotate_failures: AtomicU64::new(0),
            delete_failures: AtomicU64::new(0),
            file_unavailable: AtomicBool::new(false),
            stdout_failed: AtomicBool::new(false),
        }
    }

    fn snapshot(&self) -> HealthSnapshot {
        HealthSnapshot {
            dropped: self.dropped.load(Ordering::Relaxed),
            rejected: self.rejected.load(Ordering::Relaxed),
            write_failures: self.write_failures.load(Ordering::Relaxed),
            rotate_failures: self.rotate_failures.load(Ordering::Relaxed),
            delete_failures: self.delete_failures.load(Ordering::Relaxed),
            file_unavailable: self.file_unavailable.load(Ordering::Relaxed),
            stdout_failed: self.stdout_failed.load(Ordering::Relaxed),
        }
    }
}

/// 当前运行的健康状态。受控验收入口可直接读它，并把状态与观察来源抄进验证记录。
pub fn health() -> HealthSnapshot {
    HEALTH.snapshot()
}

/// 本次运行的标识（同时是记录的根归属）。
pub fn run_id() -> &'static str {
    RUN_ID.get().map(String::as_str).unwrap_or("")
}

/// 初始化日志基座。目录不可用时应用继续运行，只把文件 sink 标为不可用。
///
/// 调用时机：应用的 setup 钩子里（此时才有平台约定的日志目录），且必须早于任何业务事件。
pub fn init(app: &tauri::AppHandle, feature: &str) {
    let run_id = uuid::Uuid::new_v4().to_string();
    let _ = RUN_ID.set(run_id.clone());
    // 目录不可用时也要装订阅并起写线程：文件 sink 停用，stdout 仍尽力输出。
    let path = match app.path().app_log_dir() {
        Ok(directory) => {
            if fs::create_dir_all(&directory).is_err() {
                HEALTH.file_unavailable.store(true, Ordering::Relaxed);
                None
            } else {
                Some(directory.join(format!("markflow.{}.log", std::process::id())))
            }
        }
        Err(_) => {
            HEALTH.file_unavailable.store(true, Ordering::Relaxed);
            None
        }
    };
    let json = std::env::var("MARKFLOW_LOG_FORMAT")
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    let level = level_from_env();
    let (sender, receiver) = sync_channel::<QueuedRecord>(QUEUE_CAPACITY);
    let _ = SENDER.set(sender.clone());
    let writer_run_id = run_id.clone();
    if thread::Builder::new()
        .name("markflow-log".into())
        .spawn(move || writer_loop(receiver, path, writer_run_id, json))
        .is_err()
    {
        HEALTH.file_unavailable.store(true, Ordering::Relaxed);
        return;
    }
    let layer = RecordLayer {
        json,
        run_id: run_id.clone(),
        level,
        sender,
        health: &HEALTH,
    };
    let builder = tracing_subscriber::registry().with(layer);
    if builder.try_init().is_err() {
        // 已被别处初始化过：不重复设置，也不因此让应用失败。
        return;
    }
    let span = tracing::info_span!(
        "run",
        run_id = %run_id,
        os = std::env::consts::OS,
        arch = std::env::consts::ARCH,
        app_version = env!("CARGO_PKG_VERSION"),
        feature,
    );
    let _ = RUN_SPAN.set(span.clone());
    span.in_scope(|| tracing::info!(event = "run_start", origin = "rust", feature = feature));
}

/// 结束本次运行：写 `run_end`，排空队列并刷新，最多等 `SHUTDOWN_TIMEOUT`。
///
/// 不阻塞退出：超时即放弃等待。
pub fn shutdown(feature: &str) {
    run_span().in_scope(|| tracing::info!(event = "run_end", origin = "rust", feature = feature));
    if let Some(sender) = SENDER.get() {
        // 队列满时不阻塞退出：放弃这次排空请求，最多等 SHUTDOWN_TIMEOUT。
        let _ = sender.try_send(QueuedRecord {
            bytes: Vec::new(),
            urgent: false,
        });
    }
    let deadline = std::time::Instant::now() + SHUTDOWN_TIMEOUT;
    while std::time::Instant::now() < deadline {
        if !WRITER_ALIVE.load(Ordering::Relaxed) {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
}

/// 写线程存活标记。
static WRITER_ALIVE: AtomicBool = AtomicBool::new(false);

/// 级别来自环境变量；默认 debug 构建 INFO、发布构建 WARN。
fn level_from_env() -> tracing::level_filters::LevelFilter {
    use tracing::level_filters::LevelFilter;
    match std::env::var("MARKFLOW_LOG").ok().as_deref().map(str::trim) {
        Some("error") => LevelFilter::ERROR,
        Some("warn") => LevelFilter::WARN,
        Some("info") => LevelFilter::INFO,
        Some("debug") => LevelFilter::DEBUG,
        Some("trace") => LevelFilter::TRACE,
        Some("off") => LevelFilter::OFF,
        _ => {
            if cfg!(debug_assertions) {
                LevelFilter::INFO
            } else {
                LevelFilter::WARN
            }
        }
    }
}

/// 记录层：把事件成形为记录并送进有界队列。
///
/// 记录由本层自己生成（必填字段、span 上下文、事件字段），不借 formatter 的默认形态，
/// 这样契约里的字段与顺序不受 formatter 版本影响。
struct RecordLayer {
    json: bool,
    run_id: String,
    level: tracing::level_filters::LevelFilter,
    sender: SyncSender<QueuedRecord>,
    health: &'static Health,
}

/// 待写记录。`urgent` 标记 WARN/ERROR：这类记录写后立即刷新，不等下一秒的例行刷新。
struct QueuedRecord {
    bytes: Vec<u8>,
    urgent: bool,
}

impl RecordLayer {
    /// 送进队列：超长拒收（不截断，截断会产出无效 JSON），队列满则丢弃并计数。
    fn push(&self, record: QueuedRecord) {
        if record.bytes.len() > MAX_RECORD_BYTES {
            self.health.rejected.fetch_add(1, Ordering::Relaxed);
            return;
        }
        match self.sender.try_send(record) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                self.health.dropped.fetch_add(1, Ordering::Relaxed);
            }
            Err(TrySendError::Disconnected(_)) => {}
        }
    }
}

impl<S> Layer<S> for RecordLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn max_level_hint(&self) -> Option<tracing::level_filters::LevelFilter> {
        Some(self.level)
    }

    fn on_event(&self, event: &Event<'_>, ctx: Context<'_, S>) {
        let mut fields = BTreeMap::new();
        event.record(&mut FieldCollector {
            fields: &mut fields,
        });
        let span = ctx
            .event_scope(event)
            .and_then(|mut scope| scope.next())
            .map(|reference| {
                (
                    reference.name().to_owned(),
                    Some(reference.id().into_u64()),
                    reference.parent().map(|parent| parent.id().into_u64()),
                )
            });
        let timestamp = SystemTime::now();
        let level = event.metadata().level();
        let line = if self.json {
            json_record(
                &self.run_id,
                timestamp,
                level.as_str(),
                event.metadata().name(),
                &fields,
                span,
            )
        } else {
            text_record(
                &self.run_id,
                timestamp,
                level.as_str(),
                event.metadata().name(),
                &fields,
                span,
            )
        };
        let urgent = *level <= tracing::Level::WARN;
        self.push(QueuedRecord {
            bytes: line.into_bytes(),
            urgent,
        });
    }
}

/// 写线程：追加、轮转、同步到 stdout、健康摘要。
///
/// 文件不可用时线程照常运行，只镜像 stdout（目录不可创建不该让日志整体消失）。
fn writer_loop(
    receiver: Receiver<QueuedRecord>,
    path: Option<PathBuf>,
    run_id: String,
    json: bool,
) {
    WRITER_ALIVE.store(true, Ordering::Relaxed);
    let mut file = match path.as_deref().map(open_log) {
        Some(Ok(file)) => Some(file),
        Some(Err(_)) => {
            HEALTH.file_unavailable.store(true, Ordering::Relaxed);
            None
        }
        None => {
            HEALTH.file_unavailable.store(true, Ordering::Relaxed);
            None
        }
    };
    let mut size = file
        .as_ref()
        .and_then(|file| file.metadata().ok())
        .map(|meta| meta.len())
        .unwrap_or_default();
    let mut day = utc_day();
    // 启动时检查已有活动文件（进程号复用时可能残留）：按其最后修改时间的 UTC 日期与实际大小决定是否先轮转，
    // 归档日期取旧活动文件所属日期。
    if let Some(current) = file.as_ref() {
        if let Ok(modified) = current.metadata().and_then(|meta| meta.modified()) {
            let file_day = utc_day_of(modified);
            if file_day != day || size >= MAX_FILE_BYTES {
                if let Some(path) = path.as_deref() {
                    rotate(path, &mut file, &mut size, file_day);
                }
                day = utc_day();
            }
        }
    }
    let mut last_summary = Instant::now();
    loop {
        match receiver.recv_timeout(WRITER_TICK) {
            Ok(record) => {
                if record.bytes.is_empty() {
                    // 退出信号。
                    break;
                }
                if should_rotate(size, record.bytes.len(), day, utc_day()) {
                    // 空文件不轮转（否则每天会多出一个空归档）。
                    if let Some(path) = path.as_deref() {
                        rotate(path, &mut file, &mut size, day);
                    }
                    day = utc_day();
                }
                if let Some(file) = file.as_mut() {
                    if file.write_all(&record.bytes).is_err() {
                        HEALTH.write_failures.fetch_add(1, Ordering::Relaxed);
                    } else {
                        size += record.bytes.len() as u64;
                    }
                }
                write_stdout(&record.bytes);
                if record.urgent {
                    // WARN/ERROR 写后立即刷新，不等下一秒的例行刷新。
                    if let Some(file) = file.as_mut() {
                        let _ = file.flush();
                    }
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                // 至少每秒刷新一次。
                if let Some(file) = file.as_mut() {
                    let _ = file.flush();
                }
                if last_summary.elapsed() >= HEALTH_SUMMARY_INTERVAL {
                    last_summary = Instant::now();
                    write_health_summary(&mut file, &run_id, json);
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    write_health_summary(&mut file, &run_id, json);
    if let Some(file) = file.as_mut() {
        let _ = file.flush();
    }
    WRITER_ALIVE.store(false, Ordering::Relaxed);
}

/// 健康摘要：把计数按限频写进日志（直接写文件，不经 tracing，避免递归）。
/// 有丢弃、拒收或写入错误时，校验器据此不宣称日志完整。
fn write_health_summary(file: &mut Option<File>, run_id: &str, json: bool) {
    let snapshot = HEALTH.snapshot();
    if snapshot.dropped == 0
        && snapshot.rejected == 0
        && snapshot.write_failures == 0
        && snapshot.rotate_failures == 0
        && snapshot.delete_failures == 0
        && !snapshot.file_unavailable
        && !snapshot.stdout_failed
    {
        return;
    }
    let mut fields = BTreeMap::new();
    fields.insert("dropped".to_owned(), snapshot.dropped.to_string());
    fields.insert("rejected".to_owned(), snapshot.rejected.to_string());
    fields.insert("write_failures".to_owned(), snapshot.write_failures.to_string());
    fields.insert("rotate_failures".to_owned(), snapshot.rotate_failures.to_string());
    fields.insert("delete_failures".to_owned(), snapshot.delete_failures.to_string());
    fields.insert("file_unavailable".to_owned(), snapshot.file_unavailable.to_string());
    fields.insert("stdout_failed".to_owned(), snapshot.stdout_failed.to_string());
    let line = if json {
        json_record(
            run_id,
            SystemTime::now(),
            "WARN",
            "log_health",
            &fields,
            None,
        )
    } else {
        text_record(
            run_id,
            SystemTime::now(),
            "WARN",
            "log_health",
            &fields,
            None,
        )
    };
    if let Some(file) = file.as_mut() {
        let _ = file.write_all(line.as_bytes());
        let _ = file.flush();
    }
    write_stdout(line.as_bytes());
}

/// 轮转判定：跨日，或下一条完整记录会让当前文件超过上限；空文件不轮转（否则每天多出一个空归档）。
fn should_rotate(current_size: u64, next_record: usize, current_day: u64, today: u64) -> bool {
    if current_size == 0 {
        return false;
    }
    current_day != today || current_size + next_record as u64 > MAX_FILE_BYTES
}

/// stdout 是尽力镜像：失败只停用 stdout，不拖累文件 sink。
fn write_stdout(record: &[u8]) {
    if HEALTH.stdout_failed.load(Ordering::Relaxed) {
        return;
    }
    if io::stdout().write_all(record).is_err() {
        HEALTH.stdout_failed.store(true, Ordering::Relaxed);
    }
}

fn open_log(path: &Path) -> io::Result<File> {
    OpenOptions::new().create(true).append(true).open(path)
}

/// 轮转：把当前文件归档，重开新的当前文件，并裁掉过旧的归档。
fn rotate(path: &Path, file: &mut Option<File>, size: &mut u64, archive_day: u64) {
    let Some(mut current) = file.as_ref() else {
        return;
    };
    let _ = current.flush();
    let archive = match archive_path(path, archive_day) {
        Ok(archive) => archive,
        Err(_) => {
            HEALTH.rotate_failures.fetch_add(1, Ordering::Relaxed);
            return;
        }
    };
    if fs::rename(path, &archive).is_err() {
        HEALTH.rotate_failures.fetch_add(1, Ordering::Relaxed);
        return;
    }
    prune_archives(path);
    match open_log(path) {
        Ok(new_file) => {
            *file = Some(new_file);
            *size = 0;
        }
        Err(_) => {
            HEALTH.file_unavailable.store(true, Ordering::Relaxed);
            *file = None;
        }
    }
}

/// 当天该序号的归档路径：序号为该归档日期现存最大序号加一，至少三位，不覆盖已有归档。
fn archive_path(path: &Path, day: u64) -> io::Result<PathBuf> {
    let (year, month, date) = civil_from_days(day);
    let prefix = format!("{:04}-{:02}-{:02}", year, month, date);
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "markflow.log".to_owned());
    let mut sequence = 0u32;
    loop {
        let candidate = directory.join(format!("{name}.{prefix}.{sequence:03}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
        sequence += 1;
    }
}

/// 只清理本模块精确命名的归档文件，保留最新 `KEEP_ARCHIVES` 份。
fn prune_archives(path: &Path) {
    let Some(directory) = path.parent() else {
        return;
    };
    // 本模块的归档名形如 markflow.<pid>.log.YYYY-MM-DD.NNN；清理跨实例一并计算。
    let prefix = "markflow.";
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut archives: Vec<(String, PathBuf)> = Vec::new();
    for entry in entries.flatten() {
        let candidate = entry.path();
        let Some(file_name) = candidate.file_name().map(|value| value.to_string_lossy().into_owned()) else {
            continue;
        };
        if !file_name.starts_with(&prefix) || !is_archive_name(&file_name) {
            continue;
        }
        let Some(sort_key) = archive_sort_key(&file_name) else {
            continue;
        };
        archives.push((sort_key, candidate));
    }
    archives.sort();
    while archives.len() > KEEP_ARCHIVES {
        let Some((_, oldest)) = archives.first() else {
            break;
        };
        if fs::remove_file(oldest).is_err() {
            HEALTH.delete_failures.fetch_add(1, Ordering::Relaxed);
        }
        archives.remove(0);
    }
}

/// 归档名是否形如 `<前缀>.<日期>.<序号>`。
fn is_archive_name(file_name: &str) -> bool {
    let mut parts = file_name.rsplitn(3, '.');
    let Some(sequence) = parts.next() else {
        return false;
    };
    let Some(date) = parts.next() else {
        return false;
    };
    if parts.next().is_none() {
        return false;
    }
    if sequence.is_empty() || !sequence.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    if date.len() != 10 {
        return false;
    }
    date.chars().enumerate().all(|(index, c)| match index {
        4 | 7 => c == '-',
        _ => c.is_ascii_digit(),
    })
}

/// 归档的排序键：日期 + 序号（数值比较，避免字符串排序把 10 排到 2 前面）。
fn archive_sort_key(file_name: &str) -> Option<String> {
    let mut parts = file_name.rsplitn(3, '.');
    let sequence = parts.next()?;
    let date = parts.next()?;
    let _prefix = parts.next()?;
    if !is_archive_name(file_name) {
        return None;
    }
    Some(format!("{date}:{:012}", sequence.parse::<u64>().unwrap_or_default()))
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default()
}

/// 距 1970-01-01 的天数（UTC）。
fn utc_day() -> u64 {
    unix_seconds() / 86400
}

/// 某个时刻所属的 UTC 日。
fn utc_day_of(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs() / 86400)
        .unwrap_or_default()
}

/// 天数转公历年月日（UTC，Howard Hinnant 算法）。
fn civil_from_days(days: u64) -> (i64, u32, u32) {
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_year(day_of_era, year_of_era);
    let mp = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (if month <= 2 { year + 1 } else { year }, month as u32, day as u32)
}

fn day_of_year(day_of_era: i64, year_of_era: i64) -> i64 {
    day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100)
}

/// 记录成形：必填字段、span 上下文与事件字段由本模块生成。
/// 收集事件的字段。
struct FieldCollector<'a> {
    fields: &'a mut BTreeMap<String, String>,
}

impl Visit for FieldCollector<'_> {
    fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
        self.fields
            .insert(field.name().to_owned(), format!("{value:?}"));
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        self.fields.insert(field.name().to_owned(), value.to_owned());
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.fields.insert(field.name().to_owned(), value.to_string());
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.fields.insert(field.name().to_owned(), value.to_string());
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.fields.insert(field.name().to_owned(), value.to_string());
    }

    fn record_f64(&mut self, field: &Field, value: f64) {
        self.fields.insert(field.name().to_owned(), value.to_string());
    }
}

/// JSON 形态的记录：必填字段 + span 上下文（无 span 时为 null）+ 事件字段。
fn json_record(
    run_id: &str,
    timestamp: SystemTime,
    level: &str,
    fallback_event: &str,
    fields: &BTreeMap<String, String>,
    span: Option<(String, Option<u64>, Option<u64>)>,
) -> String {
    let mut line = String::from("{\"schema_version\":");
    line.push_str(&SCHEMA_VERSION.to_string());
    line.push_str(",\"run_id\":");
    line.push_str(&json_string(run_id));
    line.push_str(",\"timestamp\":");
    line.push_str(&json_string(&iso_timestamp(timestamp)));
    line.push_str(",\"level\":");
    line.push_str(&json_string(level));
    line.push_str(",\"event\":");
    line.push_str(&json_string(
        fields.get("event").map(String::as_str).unwrap_or(fallback_event),
    ));
    line.push_str(",\"span\":");
    match &span {
        Some((name, id, parent)) => {
            line.push_str(&format!(
                "{{\"name\":{},\"id\":{},\"parent_id\":{}}}",
                json_string(name),
                json_number(*id),
                json_number(*parent)
            ));
        }
        None => line.push_str("null"),
    }
    for (key, value) in fields {
        if key == "event" {
            continue;
        }
        line.push(',');
        line.push_str(&json_string(key));
        line.push(':');
        line.push_str(&json_string(value));
    }
    line.push_str("}\n");
    line
}

/// 人读形态的记录：只供诊断，不解析其文字作机器证据。
fn text_record(
    run_id: &str,
    timestamp: SystemTime,
    level: &str,
    fallback_event: &str,
    fields: &BTreeMap<String, String>,
    span: Option<(String, Option<u64>, Option<u64>)>,
) -> String {
    let mut line = format!(
        "{} {:<5} run_id={} event={}",
        iso_timestamp(timestamp),
        level,
        run_id,
        fields
            .get("event")
            .map(String::as_str)
            .unwrap_or(fallback_event)
    );
    match &span {
        Some((name, id, parent)) => line.push_str(&format!(
            " span={name}{{id={},parent_id={}}}",
            json_number(*id),
            json_number(*parent)
        )),
        None => line.push_str(" span=-"),
    }
    for (key, value) in fields {
        if key == "event" {
            continue;
        }
        line.push_str(&format!(" {key}={value}"));
    }
    line.push('\n');
    line
}

/// 可选数值的 JSON 形态：缺失写 null，不写空串。
fn json_number(value: Option<u64>) -> String {
    match value {
        Some(value) => value.to_string(),
        None => "null".to_owned(),
    }
}

/// JSON 字符串转义。
fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// UTC 时间戳（毫秒精度，ISO 8601）。
fn iso_timestamp(time: SystemTime) -> String {
    let duration = time
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = duration.as_secs() as i64;
    let millis = duration.subsec_millis();
    let days = seconds.div_euclid(86400);
    let time_of_day = seconds.rem_euclid(86400);
    let (year, month, day) = civil_from_days(days as u64);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        time_of_day / 3600,
        (time_of_day % 3600) / 60,
        time_of_day % 60
    )
}

/// 根 span：本次运行。所有调用 span 都是它的直接子。
pub fn run_span() -> tracing::Span {
    RUN_SPAN
        .get()
        .cloned()
        .unwrap_or_else(|| tracing::info_span!("run", run_id = %run_id()))
}

/// 受保护命令的 span：父链挂在根 span 上（所有调用 span 都是根的直接子）。
pub fn command_span(
    command: &'static str,
    window_label: &str,
    webview_label: &str,
) -> tracing::Span {
    run_span().in_scope(|| {
        tracing::info_span!(
            "command",
            command = command,
            window_label = window_label,
            webview_label = webview_label,
        )
    })
}

/// 页面侧调用的 span。
pub fn page_call_span(
    call_id: &str,
    command: &'static str,
    window_label: &str,
    webview_label: &str,
) -> tracing::Span {
    run_span().in_scope(|| {
        tracing::info_span!(
            "page_call",
            call_id = call_id,
            command = command,
            window_label = window_label,
            webview_label = webview_label,
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_epoch_days_to_calendar_dates() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
        assert_eq!(civil_from_days(20_760), (2026, 11, 3));
    }

    #[test]
    fn recognises_only_its_own_archive_names() {
        assert!(is_archive_name("markflow.123.log.2026-11-03.001"));
        assert!(!is_archive_name("markflow.123.log.txt"));
        // 归档名的形状检查只看日期与序号；"是不是本模块的"由清理时的前缀过滤负责。
        assert!(is_archive_name("other.log.2026-11-03.001"));
        assert!(!is_archive_name("markflow.123.log.2026-11-03.abc"));
    }

    #[test]
    fn sorts_archives_by_date_then_numeric_sequence() {
        assert_eq!(
            archive_sort_key("markflow.1.log.2026-11-03.002").unwrap(),
            "2026-11-03:000000000002"
        );
        assert!(archive_sort_key("markflow.1.log.txt").is_none());
    }

    #[test]
    fn escapes_json_strings() {
        assert_eq!(json_string("a\"b\\c"), "\"a\\\"b\\\\c\"");
        assert_eq!(json_string("line\nbreak"), "\"line\\nbreak\"");
    }

    fn sample_fields() -> BTreeMap<String, String> {
        let mut fields = BTreeMap::new();
        fields.insert("origin".to_owned(), "rust".to_owned());
        fields.insert("event".to_owned(), "source_decision".to_owned());
        fields
    }

    #[test]
    fn json_record_carries_the_required_fields_and_span_context() {
        let line = json_record(
            "run-1",
            UNIX_EPOCH,
            "INFO",
            "source_decision",
            &sample_fields(),
            Some(("command".to_owned(), Some(7), Some(1))),
        );
        let value: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(value["schema_version"], 1);
        assert_eq!(value["run_id"], "run-1");
        assert_eq!(value["timestamp"], "1970-01-01T00:00:00.000Z");
        assert_eq!(value["level"], "INFO");
        assert_eq!(value["event"], "source_decision");
        assert_eq!(value["span"]["name"], "command");
        assert_eq!(value["span"]["id"], 7);
        assert_eq!(value["span"]["parent_id"], 1);
        // 事件字段平铺在记录顶层。
        assert_eq!(value["origin"], "rust");
    }

    #[test]
    fn json_record_keeps_the_span_key_when_there_is_no_span() {
        let line = json_record("run-1", UNIX_EPOCH, "INFO", "run_start", &sample_fields(), None);
        let value: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert!(value.get("span").is_some());
        assert!(value["span"].is_null());
    }

    #[test]
    fn text_record_is_for_diagnosis_only() {
        let line = text_record(
            "run-1",
            UNIX_EPOCH,
            "WARN",
            "source_decision",
            &sample_fields(),
            Some(("command".to_owned(), Some(7), None)),
        );
        assert!(line.contains("WARN"));
        assert!(line.contains("event=source_decision"));
        assert!(line.contains("origin=rust"));
        assert!(line.contains("span=command"));
        assert!(line.ends_with('\n'));
        assert!(!line.trim_start().starts_with('{'));
    }

    #[test]
    fn rotation_triggers_on_size_day_and_never_on_an_empty_file() {
        // 空文件不轮转。
        assert!(!should_rotate(0, 1024, 100, 101));
        assert!(!should_rotate(0, 1024, 100, 100));
        // 跨日轮转。
        assert!(should_rotate(10, 1, 100, 101));
        // 下一条完整记录会超上限则轮转；刚好不超则不轮转。
        assert!(!should_rotate(MAX_FILE_BYTES - 10, 10, 100, 100));
        assert!(should_rotate(MAX_FILE_BYTES - 9, 10, 100, 100));
    }

    #[test]
    fn archive_sequence_continues_after_restart_without_overwriting() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("markflow.42.log");
        let day = 20_760u64;
        let first = archive_path(&path, day).unwrap();
        assert_eq!(first.file_name().unwrap(), "markflow.42.log.2026-11-03.000");
        std::fs::write(&first, b"x").unwrap();
        let second = archive_path(&path, day).unwrap();
        assert_eq!(second.file_name().unwrap(), "markflow.42.log.2026-11-03.001");
        // 不覆盖已有归档：第二个名字尚未被创建。
        assert!(first.exists());
        assert!(!second.exists());
    }

    #[test]
    fn keeps_the_newest_archives_and_leaves_other_files_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("markflow.42.log");
        // 造 12 份归档（跨两天）与两个不该被删的文件。
        for day in ["2026-11-01", "2026-11-02"] {
            for sequence in 0..6 {
                std::fs::write(
                    dir.path().join(format!("markflow.42.log.{day}.{sequence:03}")),
                    b"x",
                )
                .unwrap();
            }
        }
        std::fs::write(dir.path().join("other.log"), b"x").unwrap();
        std::fs::write(dir.path().join("markflow.42.log"), b"active").unwrap();
        prune_archives(&path);
        let remaining: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        let archives = remaining
            .iter()
            .filter(|name| name.starts_with("markflow.42.log."))
            .count();
        assert_eq!(archives, KEEP_ARCHIVES);
        assert!(remaining.iter().any(|name| name == "other.log"));
        assert!(remaining.iter().any(|name| name == "markflow.42.log"));
        // 保留的是最新的：最后一份 2026-11-02.005 必须在。
        assert!(remaining
            .iter()
            .any(|name| name == "markflow.42.log.2026-11-02.005"));
        assert!(!remaining
            .iter()
            .any(|name| name == "markflow.42.log.2026-11-01.000"));
    }

    #[test]
    fn archives_sort_by_date_then_numeric_sequence() {
        // 数值序号不能按字符串排（否则 10 排在 2 前面）。
        assert!(
            archive_sort_key("markflow.1.log.2026-11-03.010").unwrap()
                > archive_sort_key("markflow.1.log.2026-11-03.002").unwrap()
        );
        assert!(
            archive_sort_key("markflow.1.log.2026-11-04.001").unwrap()
                > archive_sort_key("markflow.1.log.2026-11-03.999").unwrap()
        );
    }

    #[test]
    fn over_long_records_are_rejected_and_a_full_queue_drops_with_a_count() {
        let (sender, receiver) = sync_channel::<QueuedRecord>(1);
        let layer = RecordLayer {
            json: true,
            run_id: "run-1".to_owned(),
            level: tracing::level_filters::LevelFilter::INFO,
            sender: sender.clone(),
            health: &HEALTH,
        };
        let rejected_before = HEALTH.rejected.load(Ordering::Relaxed);
        let dropped_before = HEALTH.dropped.load(Ordering::Relaxed);
        // 超长记录被拒收：既不入队也不截断。
        layer.push(QueuedRecord {
            bytes: vec![b'x'; MAX_RECORD_BYTES + 1],
            urgent: false,
        });
        assert_eq!(HEALTH.rejected.load(Ordering::Relaxed), rejected_before + 1);
        assert!(receiver.try_recv().is_err());
        // 队列满时丢弃并计数。
        layer.push(QueuedRecord {
            bytes: vec![b'a'; 10],
            urgent: false,
        });
        layer.push(QueuedRecord {
            bytes: vec![b'b'; 10],
            urgent: false,
        });
        assert_eq!(HEALTH.dropped.load(Ordering::Relaxed), dropped_before + 1);
    }

    #[test]
    fn formats_utc_timestamps() {
        let time = UNIX_EPOCH + Duration::from_millis(1_700_000_000_123);
        assert_eq!(iso_timestamp(time), "2023-11-14T22:13:20.123Z");
    }
}
