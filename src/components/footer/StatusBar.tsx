/**
 * MarkFlow (墨流) 底部状态栏组件
 * 对应设计方案第 4.5.1 节
 * 展示草稿/保存状态、字符统计、行数、预估阅读时间及当前引擎模式
 */

import React from 'react';
import {Database, CheckCircle, Clock, Cpu, AlertTriangle} from 'lucide-react';
import {
  DRAFT_STATUS_TEXTS,
  SYNC_STATUS_TEXTS,
  SYNC_FAILURE_HINT,
  SYNC_FAILURE_RETRY,
} from '../../application/messages';
import type {SyncStatus} from '../../application/workspace/documentFileContext';

interface StatusBarProps {
  charCount: number;
  wordCount: number;
  lineCount: number;
  mathMode: 'mathml' | 'svg';
  revision: number;
  isDirty: boolean;
  /**
   * 同步维度 ✓（设计 §8.4 ✓）。
   *
   * **没有同步目标时是 'none'** ✓ ⇒ ⇒ **那一行不显示** ✓ ⇒ ⇒ 只剩草稿那一行 ✓。
   */
  syncStatus: SyncStatus;
  /**
   * **重试入口** ✓（设计 §8.6 ✓）。
   *
   * **失败是常驻状态** ✓ ⇒ ⇒ **给重试入口** ✓ ⇒ ⇒ 用户不必关掉页面重来 ✓。
   */
  onRetrySync?: (() => void) | undefined;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  charCount,
  wordCount,
  lineCount,
  mathMode,
  revision,
  isDirty,
  syncStatus,
  onRetrySync,
}) => {
  const estimatedReadingMinutes = Math.max(Math.ceil(charCount / 400), 1);

  return (
    <footer className="h-9 bg-neutral-950 border-t border-neutral-800/80 px-3 flex items-center justify-between gap-3 overflow-hidden text-[11px] text-neutral-400 font-mono select-none shrink-0 no-print">
      {/* Left: 两个维度（草稿 / 同步）✓：各说各的 ✓（设计 §2.2 ✓、§8.4 ✓）✓ */}
      <div className="flex flex-col gap-0.5 leading-tight min-w-0 shrink">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <Database className="w-3 h-3 text-teal-400" />
            <span>IndexedDB</span>
          </div>
          <div className="flex items-center gap-1">
            {isDirty ? (
              <span className="text-amber-400">{DRAFT_STATUS_TEXTS.updated}</span>
            ) : (
              <span className="text-neutral-500 flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-teal-500" />
                {DRAFT_STATUS_TEXTS.saved}
              </span>
            )}
          </div>
        </div>
        {syncStatus !== 'none' && (
          <div className="flex items-center gap-1">
            {syncStatus === 'synced' ? (
              <span className="text-teal-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {SYNC_STATUS_TEXTS.synced}
              </span>
            ) : syncStatus === 'target-missing' ? (
              /* **目标不在了** ✓ ⇒ ⇒ **说清为什么保存灰着** ✓ ⇒ ⇒ **另存为是出路** ✓（§8.2 ✓）。
               * **这是读判断给的** ✓ ⇒ ⇒ **不是写失败推出来的** ✓ ⇒ ⇒ **不撒谎** ✓。 */
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {SYNC_STATUS_TEXTS['target-missing']}
              </span>
            ) : syncStatus === 'failed' ? (
              /* **失败是常驻状态** ✓ ⇒ ⇒ 它有自己那一行 ✓ ⇒ ⇒ **不是一条通知** ✓（§8.6 ✓）。
               * **说明草稿已在工作区、失败的是文件** ✓ ⇒ ⇒ **给重试入口** ✓。 */
              <span className="text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {SYNC_STATUS_TEXTS.failed}
                <span className="text-neutral-400">{SYNC_FAILURE_HINT}</span>
                {onRetrySync ? (
                  <button
                    type="button"
                    onClick={onRetrySync}
                    className="underline text-neutral-300 hover:text-neutral-100"
                  >
                    {SYNC_FAILURE_RETRY}
                  </button>
                ) : null}
              </span>
            ) : (
              <span className="text-amber-400">● {SYNC_STATUS_TEXTS.unsynced}</span>
            )}
          </div>
        )}
      </div>

      {/* Center: Reading time */}
      <div className="hidden md:flex items-center gap-1 text-neutral-500">
        <Clock className="w-3 h-3" />
        <span>预估阅读 {estimatedReadingMinutes} 分钟</span>
      </div>

      {/* Right: Text Stats, Math Mode, Revision —— **每项一行不折** ✓ ⇒ ⇒ 窄窗时省略次要项，不竖排 ✓（设计 §4、§6 ✓）。 */}
      <div className="flex items-center gap-3 text-neutral-400 shrink-0">
        <div
          className="flex items-center gap-1 whitespace-nowrap"
          title={`${charCount} 字符 · ${wordCount} 词 · ${lineCount} 行`}
        >
          <span>{charCount} 字符</span>
          <span className="text-neutral-600">·</span>
          <span>{wordCount} 词</span>
          <span className="text-neutral-600">·</span>
          <span>{lineCount} 行</span>
        </div>

        <div className="hidden sm:flex items-center gap-1 text-teal-400 whitespace-nowrap">
          <Cpu className="w-3 h-3" />
          <span>{mathMode === 'mathml' ? 'MathML 原生' : 'SVG 矢量'}</span>
        </div>

        <div className="hidden md:block text-neutral-500 font-mono whitespace-nowrap">
          Rev {revision} · UTF-8
        </div>
      </div>
    </footer>
  );
};
