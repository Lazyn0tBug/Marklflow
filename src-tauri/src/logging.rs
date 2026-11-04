//! 日志基座（L1）：文件为主 sink，stdout 为次 sink。
//!
//! 契约见 `docs/design/log-base-plan-2026-11-03.md`（§3 L1 与 §3.2 轮转、§5.1 span 模型、§5.2 记录契约）。
//!
//! 要点：
//! - **按运行分文件**（`markflow.<pid>.log`）：同一文件天然只有一个写者，不需要跨进程协调；
//! - **专用写线程 + 有界队列**：生产者不等队列也不等文件 I/O，队列满则丢弃并计数，超长记录拒收不截断；
//! - **记录自己成形**：必填字段与 span 上下文由本模块生成，不依赖 formatter 的默认形态；
//! - **如实记录**：不记录完整授权 key、文档正文与完整本地路径；字段纪律由 §5.2 的白名单约束。

use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender, TrySendError};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
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

/// 限流器：固定一秒窗口的计数。超限的请求被丢弃并计数。
pub struct RateLimiter {
    state: Mutex<(u64, u32)>,
    per_second: u32,
}

impl RateLimiter {
    pub fn new(per_second: u32) -> Self {
        Self {
            state: Mutex::new((0, 0)),
            per_second,
        }
    }

    /// 是否放行。超限返回 false。
    pub fn allow(&self) -> bool {
        let now = unix_seconds();
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        let (window, count) = *state;
        if now != window {
            *state = (now, 1);
            return true;
        }
        if count >= self.per_second {
            return false;
        }
        *state = (window, count + 1);
        true
    }
}

/// web 侧可回传的事件枚举。业务事件只能是这四个，不能变成原生事件名。
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WebEventKind {
    PageReady,
    CallStarted,
    CallFinished,
    PageError,
}

/// web 侧可回传的命令枚举。
///
/// **它也是受保护命令的入口参数** ✓（见 `files::in_command_span` ✓）：
/// 于是"受保护的命令"与"页面可回传的命令"**不可能各说各话** ✓——
/// 新加一个受保护命令而忘了进这里 ✓，**编译不过** ✓。
/// 日志里的命令名由 `command_name` 统一给出 ✓，与这里的名字是同一个字符串 ✓。
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WebCommand {
    GetPlatformInfo,
    SelectNativeOpen,
    SelectNativeSave,
    ReadNativeText,
    WriteNativeBytes,
    ReleaseNativeFile,
    /// 产品形态的静默打印（D7 的入口）。
    ///
    /// **它必须在枚举里**：枚举是页面回传的允许清单，不在清单里的命令值
    /// 整条载荷都反序列化失败、被拒收丢弃（`record_web_event_for` 的解析那一步）——
    /// 页面侧的事件会连同命令名一起消失。
    PrintNativePdf,
}

/// 结果枚举。
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WebResult {
    Ok,
    Denied,
    Error,
    Cancelled,
}

/// 错误类别枚举：只传类别，不传原始异常 message。
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WebErrorCategory {
    NoTauriInternals,
    InvokeRejected,
    InvalidPayload,
    RateLimited,
    Timeout,
    Unknown,
}

/// web 侧回传的最小事件结构。**未知字段或未知事件一律拒收**：
/// 允许清单靠 `deny_unknown_fields` 实现，不靠事后过滤。
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WebEventPayload {
    pub event: WebEventKind,
    #[serde(default)]
    pub call_id: Option<String>,
    #[serde(default)]
    pub command: Option<WebCommand>,
    #[serde(default)]
    pub result: Option<WebResult>,
    #[serde(default)]
    pub error_category: Option<WebErrorCategory>,
    #[serde(default)]
    pub bytes: Option<u64>,
}

/// web 侧请求的处理结果：accepted（已校验并入队）、dropped（超限丢弃）、rejected（不合规拒收）。
/// **accepted 不表示已落盘**。
pub const WEB_ACCEPTED: &str = "accepted";
pub const WEB_DROPPED: &str = "dropped";
pub const WEB_REJECTED: &str = "rejected";

/// 关联 ID 的长度上限（不是能力，不授予任何权限）。
const MAX_CALL_ID_LEN: usize = 64;
/// 单个 web 请求的字节上限。
pub const MAX_WEB_REQUEST_BYTES: usize = 4 * 1024;
/// 每个允许身份对每秒的 web 调用上限。
const WEB_PER_IDENTITY_PER_SECOND: u32 = 20;
/// 进程内全部 web 调用每秒的上限。
const WEB_GLOBAL_PER_SECOND: u32 = 100;

/// 进程内的日志健康状态。计数有界，不跨崩溃保留。
#[derive(Default)]
pub struct Health {
    /// 被丢弃的计数 ✓ —— **两处都记在这里** ✓：
    /// web 事件因**超限**被丢弃 ✓（限流 ✓），日志记录因**队列满**被丢弃 ✓。
    /// **两者的分母不同** ✓，所以这个数**不能**当成"丢了多少条日志" ✓。
    pub dropped: AtomicU64,
    /// 被拒收的计数 ✓ —— **两处都记在这里** ✓：
    /// web 事件**不合规**被拒收 ✓（载荷超大 ✓、身份不在允许范围 ✓、
    /// 载荷解析失败 ✓、`call_id` 超长 ✓），日志记录**超长**被拒收 ✓。
    /// **两者的分母不同** ✓，所以这个数**不能**当成"拒了多少条日志" ✓。
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
///
/// **字段与 `Health` 一一对应** ✓；`dropped` 与 `rejected` 的口径见那里的说明 ✓。
#[derive(Clone, Copy, Debug, Default)]
pub struct HealthSnapshot {
    /// 同 `Health::dropped` ✓：**web 事件与日志记录两处都记** ✓。
    pub dropped: u64,
    /// 同 `Health::rejected` ✓：**web 事件与日志记录两处都记** ✓。
    pub rejected: u64,
    pub write_failures: u64,
    pub rotate_failures: u64,
    pub delete_failures: u64,
    pub file_unavailable: bool,
    pub stdout_failed: bool,
}

/// 应用用的健康状态。测试各建各的实例，互不干扰。
static HEALTH: OnceLock<Arc<Health>> = OnceLock::new();
static RUN_ID: OnceLock<String> = OnceLock::new();
/// 根 span：本次运行。所有调用 span 都是它的直接子。
static RUN_SPAN: OnceLock<tracing::Span> = OnceLock::new();
/// 根 span 的 id：调用 span 的父恒是它（两级模型）。
static RUN_SPAN_ID: OnceLock<u64> = OnceLock::new();
/// 写线程的唤醒通道，退出时用它排空队列。
static SENDER: OnceLock<SyncSender<QueuedRecord>> = OnceLock::new();
/// 全局发送口：web 回传路径没有 layer 可用，走这一个。
static EMITTER: OnceLock<RecordEmitter> = OnceLock::new();
/// 日志基座自身的 span（契约 span 表里的 `log`）：健康摘要记在其中。
static LOG_SPAN: OnceLock<tracing::Span> = OnceLock::new();

impl Health {
    pub const fn new() -> Self {
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

/// 已登记的探针输出实例（仅 pdf-probe 构建）。
///
/// 由原生创建宿主时登记；页面不能自报身份获得允许，也不因此扩展文件权限。
#[cfg(feature = "pdf-probe")]
static PROBE_INSTANCES: OnceLock<std::sync::Mutex<Vec<crate::source_guard::Identity>>> = OnceLock::new();

/// 登记一个原生实际创建的探针输出实例。
///
/// 只有 pdf-probe 构建会真正登记；页面不能自报身份获得允许。
#[allow(dead_code)]
pub fn register_probe_instance(identity: &crate::source_guard::Identity) {
    #[cfg(feature = "pdf-probe")]
    {
        let instances = PROBE_INSTANCES.get_or_init(|| std::sync::Mutex::new(Vec::new()));
        if let Ok(mut instances) = instances.lock() {
            instances.push(identity.clone());
        }
    }
    #[cfg(not(feature = "pdf-probe"))]
    let _ = identity;
}

/// 写日志的准入：与敏感命令同一套身份判定。
///
/// 正常路径只允许允许范围内的身份；pdf-probe 构建额外接受原生实际创建并登记的探针输出实例。
fn log_writer_allowed(identity: &crate::source_guard::Identity) -> bool {
    if crate::source_guard::check_source(identity, crate::source_guard::ALLOWED_CALLERS).is_ok() {
        return true;
    }
    #[cfg(feature = "pdf-probe")]
    {
        PROBE_INSTANCES
            .get_or_init(|| std::sync::Mutex::new(Vec::new()))
            .lock()
            .ok()
            .map(|instances| instances.iter().any(|instance| instance == identity))
            .unwrap_or(false)
    }
    #[cfg(not(feature = "pdf-probe"))]
    false
}

/// web 请求的限流器。按允许身份对各限 20 条/秒，进程内全部限 100 条/秒，固定一秒窗口。
struct WebLimiters {
    per_identity: HashMap<(String, String), RateLimiter>,
    global: RateLimiter,
}

static WEB_LIMITERS: OnceLock<std::sync::Mutex<WebLimiters>> = OnceLock::new();

/// 限流判定：先看进程总量，再看身份对。**只有通过准入的身份才建桶**，拒绝者不建无限身份桶。
fn web_rate_allowed(identity: &crate::source_guard::Identity) -> bool {
    let limiters = WEB_LIMITERS.get_or_init(|| {
        Mutex::new(WebLimiters {
            per_identity: HashMap::new(),
            global: RateLimiter::new(WEB_GLOBAL_PER_SECOND),
        })
    });
    let Ok(mut limiters) = limiters.lock() else {
        return false;
    };
    if !limiters.global.allow() {
        return false;
    }
    let key = (
        identity.window_label.to_string(),
        identity.webview_label.to_string(),
    );
    limiters
        .per_identity
        .entry(key)
        .or_insert_with(|| RateLimiter::new(WEB_PER_IDENTITY_PER_SECOND))
        .allow()
}

/// 把一个 span 折成记录里的上下文：名字、id、父 id。父恒为根 span（两级模型）。
fn span_context(span: &tracing::Span) -> (String, Option<u64>, Option<u64>) {
    (
        span.metadata()
            .map(|metadata| metadata.name().to_owned())
            .unwrap_or_default(),
        span.id().map(|id| id.into_u64()),
        RUN_SPAN_ID.get().copied(),
    )
}

/// 日志基座自身的 span（契约 span 表里的 `log`）：健康摘要记在其中。
pub fn log_span() -> tracing::Span {
    LOG_SPAN
        .get()
        .cloned()
        .unwrap_or_else(|| run_span().in_scope(|| tracing::info_span!("log")))
}

/// 日志基座自身 span 的上下文（契约 span 表里的 `log`）。
fn log_span_context() -> SpanContext {
    LOG_SPAN.get().map(span_context)
}

/// 对全局健康状态做一次操作。未初始化时无操作（应用尚未启动日志基座）。
fn with_global_health(action: impl FnOnce(&Health)) {
    if let Some(health) = HEALTH.get() {
        action(health);
    }
}

/// 当前运行的健康状态。受控验收入口可直接读它，并把状态与观察来源抄进验证记录。
pub fn health() -> HealthSnapshot {
    HEALTH.get().map(|health| health.snapshot()).unwrap_or_default()
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
    // 健康状态先建好并登记：目录不可用、写失败、丢弃都要落到它上面。
    let health = Arc::new(Health::new());
    let _ = HEALTH.set(health.clone());
    // 目录不可用时也要装订阅并起写线程：文件 sink 停用，stdout 仍尽力输出。
    let path = match app.path().app_log_dir() {
        Ok(directory) => {
            if fs::create_dir_all(&directory).is_err() {
                health.file_unavailable.store(true, Ordering::Relaxed);
                None
            } else {
                Some(directory.join(format!("markflow.{}.log", std::process::id())))
            }
        }
        Err(_) => {
            health.file_unavailable.store(true, Ordering::Relaxed);
            None
        }
    };
    let json = std::env::var("MARKFLOW_LOG_FORMAT")
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    let level = level_from_env();
    let (sender, receiver) = sync_channel::<QueuedRecord>(QUEUE_CAPACITY);
    let _ = SENDER.set(sender.clone());
    let writer_format = RecordFormat {
        json,
        run_id: run_id.clone(),
    };
    let writer_health = health.clone();
    if thread::Builder::new()
        .name("markflow-log".into())
        .spawn(move || writer_loop(receiver, path, writer_format, writer_health))
        .is_err()
    {
        health.file_unavailable.store(true, Ordering::Relaxed);
        return;
    }
    let emitter = RecordEmitter {
        format: RecordFormat {
            json,
            run_id: run_id.clone(),
        },
        sender: sender.clone(),
        health: health.clone(),
    };
    let _ = EMITTER.set(emitter.clone());
    let layer = RecordLayer {
        emitter,
        level,
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
    let _ = RUN_SPAN_ID.set(span.id().map(|id| id.into_u64()).unwrap_or_default());
    // 日志基座自身的 span：健康摘要记在其中（契约 span 表里的 `log`）。
    let log_span = span.in_scope(|| tracing::info_span!("log"));
    let _ = LOG_SPAN.set(log_span.clone());
    // 环境随运行标记一起落笔：校验器要记构建、feature 与环境（契约 §5.3），
    // 而 span 上的字段不进记录，故这里在事件上重复一次。
    span.in_scope(|| {
        tracing::info!(
            event = "run_start",
            feature = feature,
            os = std::env::consts::OS,
            arch = std::env::consts::ARCH,
            app_version = env!("CARGO_PKG_VERSION"),
        )
    });
}

/// 结束本次运行：写 `run_end`，排空队列并刷新，最多等 `SHUTDOWN_TIMEOUT`。
///
/// 不阻塞退出：超时即放弃等待。
pub fn shutdown(feature: &str) {
    run_span().in_scope(|| tracing::info!(event = "run_end", feature = feature));
    // 退出时把健康状态摘要写进日志：丢弃与写入错误要显形，缺失时不得宣称日志完整。
    let health = health();
    log_span().in_scope(|| {
        tracing::info!(
            event = "log_health",
            observed_by = "shutdown",
            dropped = health.dropped,
            rejected = health.rejected,
            write_failures = health.write_failures,
            rotate_failures = health.rotate_failures,
            delete_failures = health.delete_failures,
            file_unavailable = health.file_unavailable,
            stdout_failed = health.stdout_failed,
        );
    });
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

/// 处理一条 web 侧回传：按准入与限流判定后落成 `web_event` 记录。
///
/// 顺序按契约：先做廉价的大小检查，再做身份准入，最后才解析载荷。
/// 外层字段（origin、身份、接收时间、run_id）一律由本侧生成，页面不能覆盖。
pub fn record_web_event(webview: &tauri::Webview, payload: String) -> &'static str {
    let identity = crate::source_guard::Identity::from_labels(
        webview.window().label(),
        webview.label(),
    );
    let Some(emitter) = EMITTER.get() else {
        return WEB_REJECTED;
    };
    record_web_event_for(&identity, payload, emitter)
}

/// 纯逻辑部分：判定与记录。与 webview 无关，便于直接断言。
fn record_web_event_for(
    identity: &crate::source_guard::Identity,
    payload: String,
    emitter: &RecordEmitter,
) -> &'static str {
    // 计数记在发送口自己的健康实例上：丢弃与拒收要显形，不能只存在于限流器里。
    let health = emitter.health.as_ref();
    if payload.len() > MAX_WEB_REQUEST_BYTES {
        health.rejected.fetch_add(1, Ordering::Relaxed);
        return WEB_REJECTED;
    }
    if !log_writer_allowed(identity) {
        health.rejected.fetch_add(1, Ordering::Relaxed);
        return WEB_REJECTED;
    }
    if !web_rate_allowed(identity) {
        health.dropped.fetch_add(1, Ordering::Relaxed);
        return WEB_DROPPED;
    }
    let Ok(event) = serde_json::from_str::<WebEventPayload>(&payload) else {
        health.rejected.fetch_add(1, Ordering::Relaxed);
        return WEB_REJECTED;
    };
    if event
        .call_id
        .as_ref()
        .map(|call_id| call_id.len() > MAX_CALL_ID_LEN)
        .unwrap_or(false)
    {
        health.rejected.fetch_add(1, Ordering::Relaxed);
        return WEB_REJECTED;
    }
    // 只放业务字段：origin 与身份由发送口统一加（页面不能覆盖）。
    let mut fields: BTreeMap<String, String> = BTreeMap::new();
    fields.insert("page_event".to_owned(), event_kind_name(event.event).to_owned());
    if let Some(call_id) = &event.call_id {
        fields.insert("call_id".to_owned(), call_id.clone());
    }
    if let Some(command) = event.command {
        fields.insert("command".to_owned(), command_name(command).to_owned());
    }
    if let Some(result) = event.result {
        fields.insert("result".to_owned(), result_name(result).to_owned());
    }
    if let Some(category) = event.error_category {
        fields.insert("error_category".to_owned(), error_category_name(category).to_owned());
    }
    if let Some(bytes) = event.bytes {
        fields.insert("bytes".to_owned(), bytes.to_string());
    }
    let level = if event.event == WebEventKind::PageError {
        "WARN"
    } else {
        "INFO"
    };
    let span = event.call_id.as_ref().map(|call_id| {
        page_call_span(
            call_id,
            event.command.map(command_name).unwrap_or("unknown"),
            identity.window_label.as_ref(),
            identity.webview_label.as_ref(),
        )
    });
    // 外层事件名固定为 web_event；业务事件在 page_event 字段内，不能变成原生事件名。
    // 外层字段（origin、身份）由发送口生成，页面不能覆盖。
    emitter.emit_web(level, "web_event", fields, span.as_ref().map(span_context), identity);
    WEB_ACCEPTED
}

/// span 上下文：名字、id、父 id。
type SpanContext = Option<(String, Option<u64>, Option<u64>)>;

/// 记录成形：必填字段在这里装配一次。
///
/// 必填字段：`schema_version`、`run_id`、`timestamp`、`level`、`origin`、`event` 与 span 上下文。
/// 业务字段里的 `event` 不重复出现：事件名只由这里写一次。
struct RecordFormat {
    json: bool,
    run_id: String,
}

impl RecordFormat {
    fn format(
        &self,
        level: &str,
        event: &str,
        fields: &BTreeMap<String, String>,
        span: SpanContext,
    ) -> String {
        let mut fields = fields.clone();
        fields.remove("event");
        let timestamp = SystemTime::now();
        if self.json {
            json_record(&self.run_id, timestamp, level, event, &fields, span)
        } else {
            text_record(&self.run_id, timestamp, level, event, &fields, span)
        }
    }
}

/// 统一的记录发送口：native 事件、web 回传与健康摘要都经它。
///
/// 机制统一、语义不抹平：native 的事件名就是业务事件名；web 的外层事件名固定 `web_event`、
/// 业务事件在 `page_event` 字段里；健康摘要是 `log_health`。
/// 外层字段（origin、身份）由本侧生成，页面不能覆盖——故调用点不必自己写 `origin`。
struct RecordEmitter {
    format: RecordFormat,
    sender: SyncSender<QueuedRecord>,
    health: Arc<Health>,
}

impl Clone for RecordEmitter {
    fn clone(&self) -> Self {
        Self {
            format: RecordFormat {
                json: self.format.json,
                run_id: self.format.run_id.clone(),
            },
            sender: self.sender.clone(),
            health: self.health.clone(),
        }
    }
}

impl RecordEmitter {
    /// 记一条 native 事件。origin 固定为 rust。
    fn emit_native(
        &self,
        level: &str,
        event: &str,
        fields: BTreeMap<String, String>,
        span: SpanContext,
    ) {
        self.emit(level, event, fields, span, &[("origin", "rust")]);
    }

    /// 记一条 web 回传。origin 固定为 web，身份由原生取出，页面不能覆盖。
    fn emit_web(
        &self,
        level: &str,
        event: &str,
        fields: BTreeMap<String, String>,
        span: SpanContext,
        identity: &crate::source_guard::Identity,
    ) {
        let window = identity.window_label.to_string();
        let webview = identity.webview_label.to_string();
        self.emit(
            level,
            event,
            fields,
            span,
            &[
                ("origin", "web"),
                ("window_label", &window),
                ("webview_label", &webview),
            ],
        );
    }

    fn emit(
        &self,
        level: &str,
        event: &str,
        mut fields: BTreeMap<String, String>,
        span: SpanContext,
        outer: &[(&str, &str)],
    ) {
        for (name, value) in outer {
            fields.insert((*name).to_owned(), (*value).to_owned());
        }
        let line = self.format.format(level, event, &fields, span);
        let urgent = level == "WARN";
        push_with(
            &self.sender,
            self.health.as_ref(),
            QueuedRecord {
                bytes: line.into_bytes(),
                urgent,
            },
        );
    }
}

/// 记录层：把事件成形为记录并送进有界队列。
///
/// 记录由本层自己生成（必填字段、span 上下文、事件字段），不借 formatter 的默认形态，
/// 这样契约里的字段与顺序不受 formatter 版本影响。
struct RecordLayer {
    emitter: RecordEmitter,
    level: tracing::level_filters::LevelFilter,
}

/// 待写记录。`urgent` 标记 WARN/ERROR：这类记录写后立即刷新，不等下一秒的例行刷新。
struct QueuedRecord {
    bytes: Vec<u8>,
    urgent: bool,
}

/// 送进队列的共用路径。
fn push_with(sender: &SyncSender<QueuedRecord>, health: &Health, record: QueuedRecord) {
    if record.bytes.len() > MAX_RECORD_BYTES {
        health.rejected.fetch_add(1, Ordering::Relaxed);
        return;
    }
    match sender.try_send(record) {
        Ok(()) => {}
        Err(TrySendError::Full(_)) => {
            health.dropped.fetch_add(1, Ordering::Relaxed);
        }
        Err(TrySendError::Disconnected(_)) => {}
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
        // 事件名取自 `event` 字段（缺则回落到元数据名）；origin 由发送口统一加。
        let name = fields
            .get("event")
            .cloned()
            .unwrap_or_else(|| event.metadata().name().to_owned());
        let level = event.metadata().level();
        self.emitter.emit_native(level.as_str(), &name, fields, span);
    }
}

/// 写线程：追加、轮转、同步到 stdout、健康摘要。
///
/// 文件不可用时线程照常运行，只镜像 stdout（目录不可创建不该让日志整体消失）。
fn writer_loop(
    receiver: Receiver<QueuedRecord>,
    path: Option<PathBuf>,
    format: RecordFormat,
    health: Arc<Health>,
) {
    WRITER_ALIVE.store(true, Ordering::Relaxed);
    let mut file = match path.as_deref().map(open_log) {
        Some(Ok(file)) => Some(file),
        Some(Err(_)) => {
            with_global_health(|health| health.file_unavailable.store(true, Ordering::Relaxed));
            None
        }
        None => {
            with_global_health(|health| health.file_unavailable.store(true, Ordering::Relaxed));
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
                    rotate(path, &mut file, &mut size, file_day, &health);
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
                        rotate(path, &mut file, &mut size, day, &health);
                    }
                    day = utc_day();
                }
                if let Some(file) = file.as_mut() {
                    if file.write_all(&record.bytes).is_err() {
                        health.write_failures.fetch_add(1, Ordering::Relaxed);
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
                    write_health_summary(&mut file, &format, &health);
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    write_health_summary(&mut file, &format, &health);
    if let Some(file) = file.as_mut() {
        let _ = file.flush();
    }
    WRITER_ALIVE.store(false, Ordering::Relaxed);
}

/// 健康摘要：把计数按限频写进日志（直接写文件，不经 tracing，避免递归）。
/// 有丢弃、拒收或写入错误时，校验器据此不宣称日志完整。
fn write_health_summary(file: &mut Option<File>, format: &RecordFormat, health: &Health) {
    let snapshot = health.snapshot();
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
    // 健康摘要直写文件，不经队列（否则会递归产生日志）。
    let line = format.format("WARN", "log_health", &fields, log_span_context());
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
    let mut stdout_failed = false;
    with_global_health(|health| stdout_failed = health.stdout_failed.load(Ordering::Relaxed));
    if stdout_failed {
        return;
    }
    if io::stdout().write_all(record).is_err() {
        with_global_health(|health| health.stdout_failed.store(true, Ordering::Relaxed));
    }
}

fn open_log(path: &Path) -> io::Result<File> {
    OpenOptions::new().create(true).append(true).open(path)
}

/// 轮转：把当前文件归档，重开新的当前文件，并裁掉过旧的归档。
fn rotate(
    path: &Path,
    file: &mut Option<File>,
    size: &mut u64,
    archive_day: u64,
    health: &Health,
) {
    let Some(mut current) = file.as_ref() else {
        return;
    };
    let _ = current.flush();
    let archive = match archive_path(path, archive_day) {
        Ok(archive) => archive,
        Err(_) => {
            health.rotate_failures.fetch_add(1, Ordering::Relaxed);
            return;
        }
    };
    if fs::rename(path, &archive).is_err() {
        health.rotate_failures.fetch_add(1, Ordering::Relaxed);
        return;
    }
    prune_archives(path, health);
    match open_log(path) {
        Ok(new_file) => {
            *file = Some(new_file);
            *size = 0;
        }
        Err(_) => {
            with_global_health(|health| health.file_unavailable.store(true, Ordering::Relaxed));
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
fn prune_archives(path: &Path, health: &Health) {
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
        if !file_name.starts_with(prefix) || !is_archive_name(&file_name) {
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
            health.delete_failures.fetch_add(1, Ordering::Relaxed);
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

fn event_kind_name(event: WebEventKind) -> &'static str {
    match event {
        WebEventKind::PageReady => "page_ready",
        WebEventKind::CallStarted => "call_started",
        WebEventKind::CallFinished => "call_finished",
        WebEventKind::PageError => "page_error",
    }
}

/// 命令枚举的日志名。
///
/// **唯一一处拼写** ✓：命令 span 的名字、`source_decision` 与 `operation_result`
/// 里的 `command` 字段、页面回传的命令名，全部由这里给出 ✓。
/// 受保护命令的入口 `in_command_span` 收的就是这个枚举 ✓，
/// 所以命令名与允许清单**不可能各说各话** ✓。
pub(crate) fn command_name(command: WebCommand) -> &'static str {
    match command {
        WebCommand::GetPlatformInfo => "get_platform_info",
        WebCommand::SelectNativeOpen => "select_native_open",
        WebCommand::SelectNativeSave => "select_native_save",
        WebCommand::ReadNativeText => "read_native_text",
        WebCommand::WriteNativeBytes => "write_native_bytes",
        WebCommand::ReleaseNativeFile => "release_native_file",
        WebCommand::PrintNativePdf => "print_native_pdf",
    }
}

fn result_name(result: WebResult) -> &'static str {
    match result {
        WebResult::Ok => "ok",
        WebResult::Denied => "denied",
        WebResult::Error => "error",
        WebResult::Cancelled => "cancelled",
    }
}

fn error_category_name(category: WebErrorCategory) -> &'static str {
    match category {
        WebErrorCategory::NoTauriInternals => "no_tauri_internals",
        WebErrorCategory::InvokeRejected => "invoke_rejected",
        WebErrorCategory::InvalidPayload => "invalid_payload",
        WebErrorCategory::RateLimited => "rate_limited",
        WebErrorCategory::Timeout => "timeout",
        WebErrorCategory::Unknown => "unknown",
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

/// 探针装配的 span：根 span 的直接子。
#[allow(dead_code)]
pub fn probe_span() -> tracing::Span {
    run_span().in_scope(|| tracing::info_span!("probe"))
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
        prune_archives(&path, &Health::new());
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
        let (emitter, receiver, health) = test_emitter(1);
        let rejected_before = health.rejected.load(Ordering::Relaxed);
        let dropped_before = health.dropped.load(Ordering::Relaxed);
        // 超长记录被拒收：既不入队也不截断（字段值超限即编码后超限）。
        let mut huge = BTreeMap::new();
        huge.insert("event".to_owned(), "source_decision".to_owned());
        huge.insert("body".to_owned(), "x".repeat(MAX_RECORD_BYTES + 1));
        emitter.emit_native("INFO", "source_decision", huge, None);
        assert_eq!(health.rejected.load(Ordering::Relaxed), rejected_before + 1);
        assert!(receiver.try_recv().is_err());
        // 队列满时丢弃并计数。
        let mut small = BTreeMap::new();
        small.insert("event".to_owned(), "source_decision".to_owned());
        emitter.emit_native("INFO", "source_decision", small.clone(), None);
        emitter.emit_native("INFO", "source_decision", small, None);
        assert_eq!(health.dropped.load(Ordering::Relaxed), dropped_before + 1);
    }

    fn web_identity(window: &str, webview: &str) -> crate::source_guard::Identity {
        crate::source_guard::Identity::from_labels(window, webview)
    }

    /// 测试用的发送口：自己的健康实例与队列，互不影响其它用例。
    fn test_emitter(capacity: usize) -> (RecordEmitter, Receiver<QueuedRecord>, Arc<Health>) {
        let (sender, receiver) = sync_channel::<QueuedRecord>(capacity);
        let health = Arc::new(Health::new());
        let emitter = RecordEmitter {
            format: RecordFormat {
                json: true,
                run_id: "run-1".to_owned(),
            },
            sender,
            health: health.clone(),
        };
        (emitter, receiver, health)
    }

    #[test]
    fn web_payload_rejects_unknown_fields_and_unknown_events() {
        // 未知字段：不透明字符串绕过脱敏的路被 deny_unknown_fields 堵住。
        let with_extra = serde_json::json!({"event":"page_ready","body":"自由正文"});
        assert!(serde_json::from_str::<WebEventPayload>(&with_extra.to_string()).is_err());
        // 未知事件名同样拒收。
        let unknown_event = serde_json::json!({"event":"not_an_event"});
        assert!(serde_json::from_str::<WebEventPayload>(&unknown_event.to_string()).is_err());
        // 允许的最小结构可解析。
        let allowed = serde_json::json!({"event":"call_finished","call_id":"c1","command":"read_native_text","result":"denied","bytes":3});
        let parsed: WebEventPayload = serde_json::from_str(&allowed.to_string()).unwrap();
        assert_eq!(parsed.event, WebEventKind::CallFinished);
        assert_eq!(parsed.command, Some(WebCommand::ReadNativeText));
    }

    #[test]
    fn the_log_name_of_a_command_is_the_name_the_page_sends() {
        // 页面回传的命令名（serde 的 snake_case ✓）与日志里的命令名（`command_name` ✓）
        // 必须是**同一个字符串** ✓：不然跨侧配对就配不上 ✓，
        // 而配对不上时两侧各说各话 ✓，没人看得出来 ✓。
        let cases:[(WebCommand,&str);7]=[
            (WebCommand::GetPlatformInfo,"get_platform_info"),
            (WebCommand::SelectNativeOpen,"select_native_open"),
            (WebCommand::SelectNativeSave,"select_native_save"),
            (WebCommand::ReadNativeText,"read_native_text"),
            (WebCommand::WriteNativeBytes,"write_native_bytes"),
            (WebCommand::ReleaseNativeFile,"release_native_file"),
            (WebCommand::PrintNativePdf,"print_native_pdf"),
        ];
        for (command,name) in cases{
            assert_eq!(command_name(command),name,"日志名与页面发的名字不一致");
            // 页面发的那个名字必须能解析回同一个变体 ✓。
            let parsed:WebCommand=serde_json::from_str(&format!("\"{name}\"")).unwrap();
            assert_eq!(parsed,command,"页面发的名字解析回了别的命令");
        }
    }

    #[test]
    fn the_product_print_command_is_admitted_with_its_own_name() {
        // 产品形态的打印（D7）✓：页面回传的命令名必须在允许清单里 ✓。
        // 不在清单里的命令值让**整条载荷**反序列化失败 ✓——
        // 页面侧的事件会连同命令名一起消失 ✓（那条 `rejected` 就是这么来的 ✓）。
        let payload = serde_json::json!({"event":"call_started","call_id":"c1","command":"print_native_pdf"});
        let parsed: WebEventPayload = serde_json::from_str(&payload.to_string()).unwrap();
        assert_eq!(parsed.command, Some(WebCommand::PrintNativePdf));
        assert_eq!(command_name(WebCommand::PrintNativePdf), "print_native_pdf");
    }

    #[test]
    fn a_page_event_carrying_the_product_print_is_not_rejected() {
        let (emitter, _receiver, health) = test_emitter(8);
        let before = health.rejected.load(Ordering::Relaxed);
        assert_eq!(
            record_web_event_for(
                &web_identity("main", "main"),
                r#"{"event":"call_finished","call_id":"c1","command":"print_native_pdf","result":"ok"}"#
                    .to_owned(),
                &emitter
            ),
            WEB_ACCEPTED
        );
        assert_eq!(health.rejected.load(Ordering::Relaxed), before);
    }

    #[test]
    fn web_events_are_admitted_only_for_allowed_identities() {
        let (emitter, _receiver, health) = test_emitter(8);
        let before = health.rejected.load(Ordering::Relaxed);
        // 允许范围内的身份：主窗口。
        assert_eq!(
            record_web_event_for(
                &web_identity("main", "main"),
                r#"{"event":"page_ready"}"#.to_owned(),
                &emitter
            ),
            WEB_ACCEPTED
        );
        // 范围外的身份：被拒，且计数。
        assert_eq!(
            record_web_event_for(
                &web_identity("other", "other"),
                r#"{"event":"page_ready"}"#.to_owned(),
                &emitter
            ),
            WEB_REJECTED
        );
        assert!(health.rejected.load(Ordering::Relaxed) > before);
    }

    #[test]
    fn oversized_web_requests_are_rejected_before_parsing() {
        let (emitter, _receiver, health) = test_emitter(8);
        let before = health.rejected.load(Ordering::Relaxed);
        let oversized = "x".repeat(MAX_WEB_REQUEST_BYTES + 1);
        assert_eq!(
            record_web_event_for(&web_identity("main", "main"), oversized, &emitter),
            WEB_REJECTED
        );
        assert!(health.rejected.load(Ordering::Relaxed) > before);
    }

    #[test]
    fn web_rate_limit_drops_beyond_the_per_second_budget() {
        // 每个身份每秒 20 条：第 21 条起被丢弃并计数。
        let (emitter, _receiver, health) = test_emitter(64);
        let identity = web_identity("main", "main");
        let payload = r#"{"event":"page_ready"}"#.to_owned();
        let before = health.dropped.load(Ordering::Relaxed);
        let mut accepted = 0;
        let mut dropped = 0;
        for _ in 0..(WEB_PER_IDENTITY_PER_SECOND + 5) {
            match record_web_event_for(&identity, payload.clone(), &emitter) {
                WEB_ACCEPTED => accepted += 1,
                WEB_DROPPED => dropped += 1,
                _ => {}
            }
        }
        assert!(dropped > 0);
        assert!(accepted <= WEB_PER_IDENTITY_PER_SECOND as usize);
        assert!(health.dropped.load(Ordering::Relaxed) > before);
    }

    #[test]
    fn formats_utc_timestamps() {
        let time = UNIX_EPOCH + Duration::from_millis(1_700_000_000_123);
        assert_eq!(iso_timestamp(time), "2023-11-14T22:13:20.123Z");
    }
}
