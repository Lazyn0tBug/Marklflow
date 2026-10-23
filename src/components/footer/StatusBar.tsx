/**
 * MarkFlow (墨流) 底部状态栏组件
 * 对应设计方案第 4.5.1 节
 * 展示草稿/保存状态、字符统计、行数、预估阅读时间及当前引擎模式
 */

import React from 'react';
import { Database, CheckCircle, Clock, Cpu } from 'lucide-react';

interface StatusBarProps {
  charCount: number;
  wordCount: number;
  lineCount: number;
  mathMode: 'mathml' | 'svg';
  revision: number;
  isDirty: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  charCount,
  wordCount,
  lineCount,
  mathMode,
  revision,
  isDirty,
}) => {
  const estimatedReadingMinutes = Math.max(Math.ceil(charCount / 400), 1);

  return (
    <footer className="h-7 bg-neutral-950 border-t border-neutral-800/80 px-3 flex items-center justify-between text-[11px] text-neutral-400 font-mono select-none shrink-0 no-print">
      {/* Left: Storage & Dirty State */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Database className="w-3 h-3 text-teal-400" />
          <span>IndexedDB</span>
        </div>
        <div className="flex items-center gap-1">
          {isDirty ? (
            <span className="text-amber-400">● 内存已修改 (自动防抖保存中)</span>
          ) : (
            <span className="text-neutral-500 flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-teal-500" />
              已保存
            </span>
          )}
        </div>
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
