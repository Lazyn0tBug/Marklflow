//! 运行期配置：`<当前目录>\conf\markflow.toml`。
//!
//! ## 配置是唯一的输入面 ✓
//!
//! 环境变量已全部移除 ✓ —— 环境是**隐式**的 ✓：它跨进程继承 ✓、不由代码掌控 ✓、
//! 单测会因为它而红 ✓（交付宿主上就红过一次 ✓：`cargo test` 继承了上一轮的
//! `MARKFLOW_PROBE_PRODUCT_PRINT=1` ✓，一条本该固定的断言当场失配 ✓）。
//! **配置是显式的** ✓：它在一个文件里 ✓、能被读进来看 ✓、能被单测直接构造 ✓。
//!
//! ## 位置 ✓
//!
//! - 读的位置：**当前目录下的 `conf\markflow.toml`** ✓（不是仓库根 ✓ ——
//!   编译期的仓库路径在别的机器上不存在 ✓）。
//! - 开发期当前目录恒为仓库根 ✓，故这份文件就在 `<仓库>\conf\markflow.toml` ✓，
//!   **随仓库管理** ✓（改用例就是改文件 ✓，改动看得见 ✓）。
//! - 发布时仓库里那份**改名成 `markflow.toml.example`** ✓（见 runtime-config 文档 ✓）：
//!   发布出去的是**形状** ✓，不是某台机器上的取值 ✓。
//!
//! ## 缺失与损坏 ✓
//!
//! 文件缺失 → 全部默认值 ✓；文件存在但解析不了 → **同样走默认值** ✓
//! （应用不因配置坏掉而起不来 ✓ —— 配置是输入 ✓，不是启动条件 ✓）。
//! 两种情况都要在日志里留痕 ✓（`config_source` ✓）：不然"配置没生效"和
//! "配置生效了但值不对"分不开 ✓。
//!
//! ## 相对路径 ✓
//!
//! 配置里的相对路径按**当前目录**解析 ✓ —— 与配置本身同一个根 ✓，
//! 不引入第二个"相对谁"的答案 ✓。

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Deserialize;

/// 配置目录名（相对当前目录）。
pub const CONFIG_DIR_NAME: &str = "conf";

/// 配置文件名。
pub const CONFIG_FILE_NAME: &str = "markflow.toml";

/// 日志配置。
///
/// 级别与形态使用字符串，stdout 使用布尔开关。
/// **原有字符串字段** ✓：级别与形态的**有效值**由日志基座映射 ✓，
/// 配置这一层不做解释 ✓ —— 解释是一处职责 ✓，散在两处就会分叉 ✓。
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct LogConfig {
    /// 级别：error／warn／info／debug／trace／off；空串或别的值按构建形态取默认。
    pub level: String,
    /// 形态：json／text；别的值按 text 走。
    pub format: String,
    /// 开发排障显式开启终端镜像。
    pub stdout: bool,
    /// 页面等待单次日志接收的上限（毫秒，10..=2000）。
    pub call_timeout_ms: u64,
    /// 已结束运行日志的保留天数，1..=365；默认14。
    pub retention_days: i64,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            level: String::new(),
            format: "text".to_owned(),
            stdout: false,
            call_timeout_ms: 200,
            retention_days: 14,
        }
    }
}

/// 探针配置（开发期夹具的形状，不进产品路径）。
///
/// **两个超时是护栏，不是需求** ✓：没有任何要求给"读页面报告"定过界 ✓。
/// 探针得有个结论 ✓，不能永远等下去 ✓ —— 没有读数就是"页面没就位" ✓，
/// 那条超时本身就是那条证据 ✓。
///
/// 报告读取的**总数上限**要容得下人的时间 ✓：探针自己请了人来选目标 ✓，
/// 所以它比就绪护栏宽得多 ✓。产品形态那一步本身**没有上限** ✓
///（人有取消动作 ✓），上限只存在于探针这一层 ✓。
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct ProbeConfig {
    /// 受控样本归档原件（相对路径按当前目录解析）。
    pub sample: String,
    /// 静默 PDF 的输出目标（相对路径按当前目录解析）。
    pub pdf_output: String,
    /// 是否让探针页做一次产品形态的打印。
    pub product_print: bool,
    /// 页面就绪的护栏（秒）。
    pub page_ready_timeout_seconds: u64,
    /// 读报告的总数上限（秒）。
    pub report_timeout_seconds: u64,
}

impl Default for ProbeConfig {
    fn default() -> Self {
        Self {
            sample: "docs/acceptance/pdf-probe/frozen-sample.html".to_owned(),
            pdf_output: "docs/acceptance/pdf-probe/probe-pdf-output.pdf".to_owned(),
            product_print: false,
            page_ready_timeout_seconds: 60,
            report_timeout_seconds: 600,
        }
    }
}

/// 导出的根：浏览器打印对话框 ✓。
pub const EXPORT_ROOT_WEB: &str = "web";
/// 导出的根：Windows 的静默路径 ✓。
pub const EXPORT_ROOT_NATIVE: &str = "native";

/// 导出配置：走哪个根。
#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct ExportConfig {
    /// 导出的根：`web`（浏览器打印对话框 ✓）或 `native`（Windows 的静默路径 ✓）。
    pub root: String,
}

impl Default for ExportConfig {
    fn default() -> Self {
        Self {
            root: EXPORT_ROOT_WEB.to_owned(),
        }
    }
}

impl ExportConfig {
    /// 有效的根：**只认两个固定取值** ✓，别的按 `web` 走 ✓（默认 ✓）。
    ///
    /// **这不是"回落"** ✓ —— 回落是"平台没有原生根却悄悄改走 Web" ✓；
    /// 这里是把**写错的配置值**拉回默认 ✓。
    /// 平台没有原生根而配置选了 native ✓ ⇒ **不改走 Web** ✓（前端要明说 ✓ ✓）。
    pub fn effective_root(&self) -> &'static str {
        match self.root.trim() {
            EXPORT_ROOT_NATIVE => EXPORT_ROOT_NATIVE,
            _ => EXPORT_ROOT_WEB,
        }
    }
}

/// 整份配置。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Config {
    /// 日志配置。
    pub log: LogConfig,
    /// 探针配置。
    pub probe: ProbeConfig,
    /// 导出配置。
    pub export: ExportConfig,
}

impl Config {
    /// 把不合理的取值拉回默认值 ✓。
    ///
    /// **给的不是正整数就按默认值走** ✓ —— 这条规矩原来属于环境变量 ✓
    /// （给的不是正整数就按默认值 ✓），配置继承它 ✓：改输入的通道换了 ✓，
    /// 输入的**约束**不该跟着换 ✓。
    pub fn normalize(&mut self) {
        if !(10..=2000).contains(&self.log.call_timeout_ms) {
            self.log.call_timeout_ms = LogConfig::default().call_timeout_ms;
        }
        if !(1..=365).contains(&self.log.retention_days) {
            self.log.retention_days = LogConfig::default().retention_days;
        }
        let defaults = ProbeConfig::default();
        if self.probe.page_ready_timeout_seconds == 0 {
            self.probe.page_ready_timeout_seconds = defaults.page_ready_timeout_seconds;
        }
        if self.probe.report_timeout_seconds == 0 {
            self.probe.report_timeout_seconds = defaults.report_timeout_seconds;
        }
        if self.probe.sample.trim().is_empty() {
            self.probe.sample = defaults.sample;
        }
        if self.probe.pdf_output.trim().is_empty() {
            self.probe.pdf_output = defaults.pdf_output;
        }
    }
}

/// 配置的来源：**证据的一部分** ✓。
///
/// 「配置没生效」与「配置生效了但值不对」是两回事 ✓，
/// 而日志里若只有配置的值、没有来源 ✓，就分不开 ✓ —— 所以来源也要记 ✓。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// 读到了文件并解析成功。
    File,
    /// 当前目录下没有这个文件。
    Missing,
    /// 文件在，但解析不了（走的默认值）。
    Invalid,
}

impl Source {
    /// 记进日志的稳定值。
    pub fn as_str(self) -> &'static str {
        match self {
            Source::File => "file",
            Source::Missing => "missing",
            Source::Invalid => "invalid",
        }
    }
}

/// 配置文件的位置：`<当前目录>\conf\markflow.toml`。
pub fn config_path(cwd: &Path) -> PathBuf {
    cwd.join(CONFIG_DIR_NAME).join(CONFIG_FILE_NAME)
}

/// 解析一份配置文本。
///
/// **纯函数** ✓：输入文本，输出配置或错误 ✓ —— 不碰文件 ✓、不碰环境 ✓。
/// 未知字段按 serde 的默认忽略 ✓；缺字段走各自的默认值 ✓。
pub fn parse(text: &str) -> Result<Config, toml::de::Error> {
    let mut config: Config = toml::from_str(text)?;
    config.normalize();
    Ok(config)
}

/// 读当前目录下的配置。
///
/// 返回配置与来源 ✓：缺失与损坏都走默认值 ✓，但来源不同 ✓，
/// 调用方据此在日志里留痕 ✓。
pub fn load(cwd: &Path) -> (Config, Source) {
    let path = config_path(cwd);
    let Ok(text) = std::fs::read_to_string(&path) else {
        return (Config::default(), Source::Missing);
    };
    match parse(&text) {
        Ok(config) => (config, Source::File),
        Err(_) => (Config::default(), Source::Invalid),
    }
}

/// 本次运行的配置 ✓（启动时读一次 ✓，之后只读 ✓）。
static CONFIG: OnceLock<Config> = OnceLock::new();

/// 记下本次运行的配置 ✓。
pub fn set_config(config: Config) {
    let _ = CONFIG.set(config);
}

/// 本次运行的配置 ✓；没记过就用默认值 ✓（单元测试里直接调它 ✓）。
pub fn config() -> &'static Config {
    CONFIG.get_or_init(Config::default)
}

/// 相对路径按当前目录解析。
///
/// 绝对路径原样用 ✓；相对路径挂在当前目录下 ✓。
///
/// **只有探针用得到** ✓（受控样本与打印目标 ✓）—— 默认构建里没人调 ✓，
/// 故此处标 `allow(dead_code)` ✓（否则默认构建会带一条死代码告警 ✓）。
#[allow(dead_code)]
pub fn resolve(cwd: &Path, value: &str) -> PathBuf {
    let path = Path::new(value);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_file_yields_the_defaults() {
        let config = parse("").expect("空文件应解析成功");
        assert_eq!(config.log.level, "");
        assert_eq!(config.log.format, "text");
        assert!(!config.log.stdout);
        assert!(!config.probe.product_print);
        assert_eq!(config.probe.page_ready_timeout_seconds, 60);
        assert_eq!(config.probe.report_timeout_seconds, 600);
    }

    #[test]
    fn the_file_overrides_only_the_fields_it_names() {
        let config = parse(
            r#"
            [log]
            level = "debug"
            format = "json"

            [probe]
            product_print = true
            report_timeout_seconds = 5
            "#,
        )
        .expect("应解析成功");
        assert_eq!(config.log.level, "debug");
        assert_eq!(config.log.format, "json");
        assert!(config.probe.product_print);
        assert_eq!(config.probe.report_timeout_seconds, 5);
        // 没写的字段仍走默认值。
        assert_eq!(config.probe.page_ready_timeout_seconds, 60);
        assert_eq!(config.probe.sample, ProbeConfig::default().sample);
    }

    #[test]
    fn retention_days_default_and_bounds_preserve_other_valid_settings() {
        assert_eq!(parse("").unwrap().log.retention_days, 14);
        for days in [1, 14, 365] {
            assert_eq!(
                parse(&format!("[log]\nretention_days = {days}"))
                    .unwrap()
                    .log
                    .retention_days,
                days
            );
        }
        for days in [-1, 0, 366] {
            let config = parse(&format!("[log]\nretention_days = {days}\nstdout = true")).unwrap();
            assert_eq!(config.log.retention_days, 14);
            assert!(config.log.stdout);
        }
        for value in ["1.5", "\"14\"", "true"] {
            assert!(parse(&format!("[log]\nretention_days = {value}")).is_err());
        }
    }

    #[test]
    fn log_call_timeout_is_bounded_and_defaults_to_200_ms() {
        assert_eq!(parse("").unwrap().log.call_timeout_ms, 200);
        for value in [10, 200, 2000] {
            assert_eq!(
                parse(&format!("[log]\ncall_timeout_ms = {value}"))
                    .unwrap()
                    .log
                    .call_timeout_ms,
                value
            );
        }
        for value in [0, 9, 2001] {
            assert_eq!(
                parse(&format!("[log]\ncall_timeout_ms = {value}"))
                    .unwrap()
                    .log
                    .call_timeout_ms,
                200
            );
        }
        assert!(parse("[log]\ncall_timeout_ms = -1").is_err());
    }

    #[test]
    fn stdout_requires_an_explicit_boolean() {
        assert!(!parse("").unwrap().log.stdout);
        assert!(!parse("[log]\nstdout = false").unwrap().log.stdout);
        assert!(parse("[log]\nstdout = true").unwrap().log.stdout);
        assert!(parse("[log]\nstdout = \"true\"").is_err());
    }

    #[test]
    fn the_export_root_is_web_unless_the_file_says_native() {
        assert_eq!(
            parse("").expect("应解析成功").export.effective_root(),
            EXPORT_ROOT_WEB
        );
        let native = parse("[export]\nroot = \"native\"").expect("应解析成功");
        assert_eq!(native.export.effective_root(), EXPORT_ROOT_NATIVE);
        // 写错的值按默认走 ✓ —— 那是"配置写错了" ✓，不是"平台没有原生根" ✓。
        let typo = parse("[export]\nroot = \"nativ\"").expect("应解析成功");
        assert_eq!(typo.export.effective_root(), EXPORT_ROOT_WEB);
    }

    #[test]
    fn a_broken_file_is_an_error_rather_than_a_silent_default() {
        assert!(parse("[log").is_err());
        // 已知字段给了不对的类型 → 报错 ✓（不是悄悄按默认值走 ✓）。
        assert!(parse("[log]\nlevel = 3").is_err());
        // 未知字段按 serde 的默认忽略 ✓：多写的键不该让应用起不来 ✓。
        assert!(parse("unknown_key = 1").is_ok());
    }

    #[test]
    fn a_missing_file_and_a_broken_file_are_told_apart() {
        let dir = tempfile::tempdir().expect("临时目录");
        let (config, source) = load(dir.path());
        assert_eq!(source, Source::Missing);
        assert!(!config.probe.product_print);

        std::fs::create_dir_all(dir.path().join(CONFIG_DIR_NAME)).expect("建目录");
        std::fs::write(config_path(dir.path()), "[log").expect("写文件");
        let (config, source) = load(dir.path());
        assert_eq!(source, Source::Invalid);
        // 损坏也走默认值：配置坏掉不该让应用起不来。
        assert_eq!(config.log.format, "text");
        assert!(!config.log.stdout);
    }

    #[test]
    fn a_good_file_is_read_from_the_conf_directory_of_the_current_directory() {
        let dir = tempfile::tempdir().expect("临时目录");
        std::fs::create_dir_all(dir.path().join(CONFIG_DIR_NAME)).expect("建目录");
        std::fs::write(config_path(dir.path()), "[probe]\nproduct_print = true\n").expect("写文件");
        let (config, source) = load(dir.path());
        assert_eq!(source, Source::File);
        assert!(config.probe.product_print);
    }

    #[test]
    fn a_zero_timeout_falls_back_to_the_default() {
        // 给的不是正整数就按默认值走：这条规矩原来属于环境变量，配置继承它。
        let config = parse(
            r#"
            [probe]
            page_ready_timeout_seconds = 0
            report_timeout_seconds = 0
            sample = "  "
            "#,
        )
        .expect("应解析成功");
        assert_eq!(config.probe.page_ready_timeout_seconds, 60);
        assert_eq!(config.probe.report_timeout_seconds, 600);
        assert_eq!(config.probe.sample, ProbeConfig::default().sample);
    }

    #[test]
    fn a_relative_path_is_resolved_against_the_current_directory() {
        let base = Path::new("/run/here");
        assert_eq!(
            resolve(base, "docs/a.md"),
            Path::new("/run/here").join("docs/a.md")
        );
    }

    #[test]
    fn an_absolute_path_is_used_as_it_is() {
        let absolute = if cfg!(windows) {
            "C:\\tmp\\a.md"
        } else {
            "/tmp/a.md"
        };
        assert_eq!(
            resolve(Path::new("/run/here"), absolute),
            Path::new(absolute)
        );
    }
}
