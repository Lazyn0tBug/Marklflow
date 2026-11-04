//! 来源限制：按调用方身份判断是否允许敏感命令。
//!
//! 判定是纯函数：输入允许范围与调用方身份，输出放行或共享稳定拒绝码。
//! 不引入注册表、配置层或权限平台，身份是 label 级（窗口 label 与 webview label 的配对），
//! 不含实例标识：实例级会让允许范围必须动态化，等同于权限平台。
//!
//! 本项目的隔离层是来源守卫本身：Tauri 对本地来源的应用自定义命令默认放行，
//! ACL 不构成隔离（见探针阶段记录 D0-3）。
//!
//! ## 这里没有"用户"，只有"哪个 webview 在说话" ✓
//!
//! 身份是 **webview 的身份** ✓（窗口 label 与 webview label 的配对 ✓），
//! **不是人的身份** ✓：桌面应用只有一个用户 ✓（坐在机器前的那个人 ✓），
//! 没有账号 ✓、没有多用户 ✓、没有"谁的文件" ✓。
//! **别在这上面加用户/角色体系** ✓：那要解决的问题本应用没有 ✓。
//!
//! ## 今天这道闸守着的是双保险 ✓
//!
//! 打印宿主里加载的是**导出那份 HTML** ✓ —— 它带 CSP ✓（`default-src 'none'` ✓，
//! 脚本跑不起来 ✓），内容进它之前过了 DOMPurify ✓，文档里零脚本 ✓。
//! **所以那份内容本来就作不了恶** ✓，守卫对它的拒绝是"万一" ✓。
//!
//! 守卫**真正不可替代**的地方是**它是验收的标的物** ✓：D1b-3 的正向证据
//! 就是"输出宿主调受保护命令被拒" ✓ —— 没有角色分离 ✓，那轮验收就没有对象 ✓。
//!
//! **它会变成唯一一道的那刻** ✓：当交给打印机的 HTML 不再只来自那个被清洗过的导出时 ✓
//! （插件 ✓、第三方模板 ✓、用户自带 HTML ✓、或者导出链哪天引入了脚本 ✓）。
//! **那时它够不够用，要看那时候的输入面** ✓。

use std::borrow::Cow;

/// 调用方或允许项的身份：窗口 label 与 webview label 的配对。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Identity {
    pub window_label: Cow<'static, str>,
    pub webview_label: Cow<'static, str>,
}

impl Identity {
    /// 声明式身份，供常量使用。
    pub const fn declared(window_label: &'static str, webview_label: &'static str) -> Self {
        Self {
            window_label: Cow::Borrowed(window_label),
            webview_label: Cow::Borrowed(webview_label),
        }
    }

    /// 运行期身份：取自原生注入的 label。
    pub fn from_labels(
        window_label: impl Into<String>,
        webview_label: impl Into<String>,
    ) -> Self {
        Self {
            window_label: Cow::Owned(window_label.into()),
            webview_label: Cow::Owned(webview_label.into()),
        }
    }
}

/// 共享稳定拒绝码：语义唯一，与业务错误不混淆。
/// 用户可见路径映射友好提示，不露裸码、调用方身份或允许名单。
pub const SOURCE_DENIED: &str = "native-source-denied";

/// 主界面身份。源码级依据为 ("main","main")（D0-7），运行值由 D1a-6 核对。
pub const MAIN_WINDOW: Identity = Identity::declared("main", "main");

/// 输出宿主的身份（label 与形态同源）。D1b、D1c、D8 使用同一份定义与创建函数。
/// **它默认不在允许范围内**：身份不是授权，将来若要放行必须显式列入。
/// 目前只有测试引用它，D1b 的宿主创建函数落地后即为生产引用。
#[allow(dead_code)]
pub const OUTPUT_HOST: Identity = Identity::declared("pdf-output", "pdf-output");

/// 允许范围：静态、默认拒绝。未列入的窗口与独立 webview 一律受限。
pub const ALLOWED_CALLERS: &[Identity] = &[MAIN_WINDOW];

/// 判定：调用方在允许范围内则放行，否则返回共享稳定拒绝码。
pub fn check_source(caller: &Identity, allowed: &[Identity]) -> Result<(), &'static str> {
    let permitted = allowed.iter().any(|entry| {
        entry.window_label == caller.window_label && entry.webview_label == caller.webview_label
    });
    if permitted {
        Ok(())
    } else {
        Err(SOURCE_DENIED)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(window: &str, webview: &str) -> Identity {
        Identity::from_labels(window, webview)
    }

    #[test]
    fn allows_the_listed_identity_and_denies_everything_else() {
        let allowed = [identity("main", "main")];
        assert_eq!(check_source(&identity("main", "main"), &allowed), Ok(()));
        assert_eq!(
            check_source(&identity("other", "other"), &allowed),
            Err(SOURCE_DENIED)
        );
    }

    #[test]
    fn denies_a_label_outside_the_range_even_with_a_matching_counterpart() {
        let allowed = [identity("main", "main")];
        assert_eq!(
            check_source(&identity("other", "main"), &allowed),
            Err(SOURCE_DENIED)
        );
        assert_eq!(
            check_source(&identity("main", "other"), &allowed),
            Err(SOURCE_DENIED)
        );
    }

    #[test]
    fn denies_every_caller_when_the_range_is_empty() {
        assert_eq!(
            check_source(&identity("main", "main"), &[]),
            Err(SOURCE_DENIED)
        );
    }

    #[test]
    fn the_output_host_is_not_in_the_allowed_range_by_default() {
        assert!(!ALLOWED_CALLERS.iter().any(|entry| {
            entry.window_label == OUTPUT_HOST.window_label
                && entry.webview_label == OUTPUT_HOST.webview_label
        }));
        assert_eq!(
            check_source(&OUTPUT_HOST, ALLOWED_CALLERS),
            Err(SOURCE_DENIED)
        );
    }

    #[test]
    fn a_declared_identity_matches_an_equivalent_runtime_identity() {
        assert_eq!(MAIN_WINDOW, identity("main", "main"));
        assert_eq!(check_source(&identity("main", "main"), ALLOWED_CALLERS), Ok(()));
    }
}
