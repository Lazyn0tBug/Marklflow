//! 输出宿主的单点创建：身份取自 `source_guard::OUTPUT_HOST`，形态为不可见的独立 WebviewWindow。
//!
//! D1b 的探针载体与 D1c 的打印宿主走同一条创建路径；每次调用创建独立实例，不共用运行实例。
//! 输出身份**不在**来源守卫的允许范围内：身份是来源，不是授权。

use std::sync::atomic::{AtomicUsize, Ordering};

use tauri::{WebviewUrl, WebviewWindow};

use crate::logging;

/// 输出宿主窗口 label 的基名。第一个实例就用它，与 `source_guard::OUTPUT_HOST` 逐字相同；
/// 同进程内的后续实例追加序号，仍是独立实例，且同样不在允许范围内。
#[allow(dead_code)]
pub const OUTPUT_HOST_LABEL: &str = "pdf-output";

#[allow(dead_code)]
static INSTANCES: AtomicUsize = AtomicUsize::new(0);

#[allow(dead_code)]
fn next_label() -> String {
    let index = INSTANCES.fetch_add(1, Ordering::Relaxed);
    if index == 0 {
        OUTPUT_HOST_LABEL.to_owned()
    } else {
        format!("{OUTPUT_HOST_LABEL}-{index}")
    }
}

/// 创建输出宿主。窗口 label 与 webview label 相同，形如 ("pdf-output","pdf-output")。
/// 探针（pdf-probe feature）与 D1c 的打印宿主共用这一条路径。
#[allow(dead_code)]
pub fn create(
    app: &tauri::AppHandle,
    url: WebviewUrl,
) -> tauri::Result<WebviewWindow> {
    let label = next_label();
    let window = tauri::WebviewWindowBuilder::new(app, label.clone(), url)
        .visible(false)
        .title("MarkFlow 输出宿主")
        .build()?;
    // 宿主创建是一条观测事件：身份、形态与实例数都留痕。
    // host span 挂在根 span 下：契约要求所有调用 span 都是根的直接子。
    logging::run_span().in_scope(|| {
        tracing::info_span!("host", host_kind = "output", host_label = label.as_str(), visible = false).in_scope(|| {
            tracing::info!(
                event = "host_state",
                state = "created",
                host_kind = "output",
                host_label = label.as_str(),
                visible = false,
                instances = instance_count(),
            );
        });
    });
    Ok(window)
}

/// 当前进程已创建的输出宿主实例数。用于断言"每次创建独立实例，不共用运行实例"。
#[allow(dead_code)]
pub fn instance_count() -> usize {
    INSTANCES.load(Ordering::Relaxed)
}
