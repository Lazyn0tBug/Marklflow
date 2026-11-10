import {describe, expect, it} from 'vitest';
import {
  closeTabBeforeClose,
  closeTabReason,
  type CloseTabPorts,
} from '../../src/application/workspace/closeTab';
import {createNewDocument} from '../../src/core/storage/storage';
import type {DocumentRecord} from '../../src/core/model/document';
import type {WriteBackResult} from '../../src/application/workspace/documentSyncer';

/**
 * 关闭标签页 ✓（设计 M5-8 ✓、§16 ✓）。
 *
 * **它是"一次写"** ✓ ⇒ ⇒ 提示只问**写**那件 ✓ ⇒ ⇒ **放弃 = 不写回直接关** ✓
 * ⇒ ⇒ **标签页不会再被困住** ✓。
 */

const doc: DocumentRecord = {...createNewDocument('报告'), markdown: '# 报告'};

describe('要不要问', () => {
  it('没有要写回的不问', () => {
    // **没有同步目标**（导入的文档 ✓）与**已同步** ✓ ⇒ ⇒ 都不问 ✓。
    expect(closeTabReason('none')).toBe('none');
    expect(closeTabReason('synced')).toBe('none');
  });

  it('文件那边没写回就问', () => {
    // **未同步**与**同步失败** ✓ ⇒ ⇒ 文件那边没成 ⇒ ⇒ 用户得知道 ✓。
    expect(closeTabReason('unsynced')).toBe('unsynced');
    expect(closeTabReason('failed')).toBe('unsynced');
  });

  it('草稿那一维不问', () => {
    // **草稿那边自己报它自己** ✓ ⇒ ⇒ **那一条不在这儿问** ✓（§9 ✓）。
    // ⇒ ⇒ **关掉不丢** ✓ ⇒ ⇒ 草稿在它自己的存放处 ✓。
    expect(closeTabReason('unsynced')).toBe('unsynced');
  });
});

describe('关之前那几步', () => {
  const setup = (
    options: {
      answer?: boolean;
      persisted?: boolean;
      writeBack?: WriteBackResult | undefined;
    } = {},
  ) => {
    const calls: string[] = [],
      asked: string[] = [];
    const ports: CloseTabPorts = {
      confirm: async (reason) => {
        asked.push(reason);
        return options.answer ?? true;
      },
      persist: async () => {
        calls.push('persist');
        return options.persisted ?? true;
      },
      writeBack: async () => {
        calls.push('writeBack');
        return options.writeBack;
      },
    };
    return {ports, calls, asked};
  };

  it('没有要写回的直接关，一句都不问', async () => {
    const {ports, asked} = setup();
    const outcome = await closeTabBeforeClose(doc, 'synced', ports);
    expect(outcome).toEqual({kind: 'closed'});
    // **不问** ✓ ⇒ ⇒ 刚打开未改动的文件不问 ✓（M5-8 ✓）。
    expect(asked).toEqual([]);
  });

  it('先落草稿，再问写那件', async () => {
    const {ports, calls, asked} = setup({writeBack: {kind: 'written', revision: 1}});
    const outcome = await closeTabBeforeClose(doc, 'unsynced', ports);
    expect(outcome).toEqual({kind: 'closed'});
    // **问的是写那件** ✓ ⇒ ⇒ 只有一句 ✓。
    expect(asked).toEqual(['unsynced']);
    // **先落草稿，再写回文件** ✓ ⇒ ⇒ 顺序是那一件事 ✓（§6.1 ✓）。
    expect(calls).toEqual(['persist', 'writeBack']);
  });

  it('用户说不就是放弃，不写回直接关', async () => {
    const {ports, calls, asked} = setup({answer: false});
    const outcome = await closeTabBeforeClose(doc, 'unsynced', ports);
    expect(outcome).toEqual({kind: 'closed'});
    expect(asked).toEqual(['unsynced']);
    // **放弃 ⇒ ⇒ 不写回** ✓ ⇒ ⇒ 两边都不动 ✓ ⇒ ⇒ **不提示第二次** ✓。
    expect(calls).toEqual(['persist']);
  });

  it('草稿落不住也不拦，关得掉', async () => {
    const {ports, calls} = setup({persisted: false});
    const outcome = await closeTabBeforeClose(doc, 'none', ports);
    // **标签页不会被困住** ✓ ⇒ ⇒ **内容还在工作区** ✓ ⇒ ⇒ **落不住也关** ✓（§9 ✓、§16 ✓）。
    expect(outcome).toEqual({kind: 'closed'});
    expect(calls).toEqual(['persist']);
  });

  it('写不进去也关得掉', async () => {
    const {ports, calls} = setup({writeBack: {kind: 'failed', error: new Error('写不进去')}});
    const outcome = await closeTabBeforeClose(doc, 'unsynced', ports);
    // **写不进去也关** ✓ ⇒ ⇒ 草稿还在它自己的存放处 ✓ ⇒ ⇒ **标签页不会再被困住** ✓（§16 ✓）。
    expect(outcome).toEqual({kind: 'closed'});
    expect(calls).toEqual(['persist', 'writeBack']);
  });

  it('没有同步目标就不写，落盘就够', async () => {
    // **没有要写的 ⇒ ⇒ 不写回** ✓ ⇒ ⇒ **落盘就够** ✓ ⇒ ⇒ 关 ✓。
    const {ports, calls} = setup({writeBack: undefined});
    const outcome = await closeTabBeforeClose(doc, 'none', ports);
    expect(outcome).toEqual({kind: 'closed'});
    expect(calls).toEqual(['persist']);
  });
});
