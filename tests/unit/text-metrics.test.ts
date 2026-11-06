import {it,expect} from 'vitest';
import {inkCenterOffset} from '../../src/core/platform/web/textMetrics';

/**
 * The marker is aligned with the ink of the title, not with its line box. The ink centre sits
 * above the baseline by half the difference between the ascent and the descent, so this is the
 * one piece of arithmetic that decides whether the marker sits on the words.
 */
it('puts the ink centre above the baseline by half the difference',()=>{
 // 墨迹自基线向上 9、向下 1 ⇒ 中心在基线上方 4 ⇒
 expect(inkCenterOffset(9,1)).toBe(4);
 // 向下多过向上的字形（少见的拉丁降部）⇒ 中心落到基线下方 ⇒
 expect(inkCenterOffset(1,9)).toBe(-4);
 expect(inkCenterOffset(5,5)).toBe(0);
});
