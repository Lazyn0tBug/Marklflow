/**
 * MarkFlow (墨流) 底部状态栏组件
 * 对应设计方案第 4.5.1 节
 * 展示草稿/保存状态、字符统计、行数、预估阅读时间及当前引擎模式
 */

import React from 'react';
import { Database, CheckCircle, Clock, Cpu } from 'lucide-react';
import { DRAFT_STATUS_TEXTS, SYNC_STATUS_TEXTS} from '../../application/messages';
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
}

export const StatusBar: React.FC<StatusBarProps> = ({
  charCount,
  wordCount,
  lineCount,
  mathMode,
  revision,
  isDirty,
  syncStatus,
}) => {
  const estimatedReadingMinutes = Math.max(Math.ceil(charCount / 400), 1);

  return (
    <footer className="h-9 bg-neutral-950 border-t border-neutral-800/80 px-3 flex items-center justify-between text-[11px] text-neutral-400 font-mono select-none shrink-0 no-print">
      {/* Left: 两个维度（草稿 / 同步）✓：各说各的 ✓（设计 §2.2 ✓、§8.4 ✓）✓ */}
      <div className="flex flex-col gap-0.5 leading-tight">
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
        {syncStatus!=='none'&&(
          <div className="flex items-center gap-1">
            {syncStatus==='synced'?(
              <span className="text-teal-400 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {SYNC_STATUS_TEXTS.synced}
              </span>
            ):(
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

      {/* Right: Text Stats, Math Mode, Revision */}
      <div className="flex items-center gap-3 text-neutral-400">
        <div className="flex items-center gap-1">
          <span>{charCount} 字符</span>
          <span className="text-neutral-600">·</span>
          <span>{wordCount} 词</span>
          <span className="text-neutral-600">·</span>
          <span>{lineCount} 行</span>
        </div>

        <div className="flex items-center gap-1 text-teal-400">
          <Cpu className="w-3 h-3" />
          <span>{mathMode === 'mathml' ? 'MathML 原生' : 'SVG 矢量'}</span>
        </div>

        <div className="text-neutral-500 font-mono">
          Rev {revision} · UTF-8
        </div>
      </div>
    </footer>
  );
};
