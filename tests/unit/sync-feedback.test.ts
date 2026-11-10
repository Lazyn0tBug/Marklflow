import {describe, expect, it} from 'vitest';
import {syncFeedback} from '../../src/application/workspace/syncFeedback';
import type {SyncOutcome} from '../../src/application/workspace/documentSyncer';
import {SYNC_FEEDBACK_TEXTS} from '../../src/application/messages';

/**
 * 写回那一次的反馈 ✓（设计 §6.5 ✓、§8.5 ✓）。
 *
 * **规则在这儿** ✓ ⇒ ⇒ 不必起浏览器就能盯住 ✓。
 */

const outcome = (writeBack: SyncOutcome['writeBack'], conflict?: SyncOutcome['conflict']) =>
  ({documentId: 'd1', revision: 3, writeBack, conflict}) as SyncOutcome;

describe('写回反馈', () => {
  it('写回成功说一句"已写回文件"', () => {
    const feedback = syncFeedback(outcome({kind: 'written', revision: 3}));
    expect(feedback?.kind).toBe('written');
    expect(SYNC_FEEDBACK_TEXTS[feedback!.kind]).toBe('已写回文件');
  });

  it('用户选覆盖也落在"已写回文件"，因为它与普通写回在文件上是一回事', () => {
    const feedback = syncFeedback(outcome({kind: 'written', revision: 3}, 'overwrite'));
    expect(feedback?.kind).toBe('written');
  });

  it('自动反向同步说"更新了草稿"，不说本地改动不保留', () => {
    const feedback = syncFeedback(outcome({kind: 'reloaded', revision: 4}));
    expect(feedback?.kind).toBe('reloaded');
    // **没有人在场** ✓ ⇒ ⇒ **本地没有改动可丢** ✓ ⇒ ⇒ 那一句不能说 ✓（§6.5 ✓）。
    expect(SYNC_FEEDBACK_TEXTS[feedback!.kind]).not.toContain('本地改动不保留');
  });

  it('用户选重载要说"本地改动不保留"', () => {
    const feedback = syncFeedback(outcome({kind: 'reloaded', revision: 4}, 'reload'));
    expect(feedback?.kind).toBe('reloaded-discarding');
    // **有人交出了自己的改动** ✓ ⇒ ⇒ **反馈必须说清这一句** ✓（§6.5 ✓）。
    expect(SYNC_FEEDBACK_TEXTS[feedback!.kind]).toContain('本地改动不保留');
  });

  it('取消说一句"下次保存还会再问"', () => {
    const feedback = syncFeedback(outcome({kind: 'cancelled'}, 'cancel'));
    expect(feedback?.kind).toBe('cancelled');
    expect(SYNC_FEEDBACK_TEXTS[feedback!.kind]).toContain('下次保存还会再问');
  });

  it('没有同步目标时不说话', () => {
    // **不提示** ✓ ⇒ ⇒ **不需要问要不要另存** ✓（§8.2 ✓、§6.5 ✓）。
    expect(syncFeedback(outcome({kind: 'not-applicable'}))).toBeUndefined();
  });

  it('草稿没存住时不另说一句，那条失败已经报过了', () => {
    // **草稿与写回不接成一个流程** ✓ ⇒ ⇒ **写回结果里没有"未尝试"这一项** ✓（§6.5 ✓）。
    // ⇒ ⇒ 草稿那边**自己报它自己** ✓ ⇒ ⇒ 反馈**只说文件那一句** ✓ ⇒ ⇒ 这里不重复它 ✓（§9 ✓、§2.1 ✓）。
    expect(syncFeedback(outcome({kind: 'not-applicable'}))).toBeUndefined();
  });

  it('写回失败时不另说一句，那条失败已经报过了', () => {
    // **失败走机器码** ✓ ⇒ ⇒ 常驻状态说"同步失败" ✓ ⇒ ⇒ 这里不重复它 ✓（§8.6 ✓）。
    expect(syncFeedback(outcome({kind: 'failed', error: new Error('IO 失败')}))).toBeUndefined();
  });

  it('每一种反馈都有自己的一句文案', () => {
    // **文案进应用那一份文案表** ✓ ⇒ ⇒ **缺项就是漏了** ✓ ⇒ ⇒ 这里把它盯住 ✓（§8.5 ✓）。
    for (const kind of ['written', 'reloaded', 'reloaded-discarding', 'cancelled'] as const) {
      expect(SYNC_FEEDBACK_TEXTS[kind]).toBeTruthy();
    }
  });
});
