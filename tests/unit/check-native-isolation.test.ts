import {describe, expect, it} from 'vitest';
import {mkdirSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isolationPremiseBroken} from '../../scripts/check-native-isolation';

/**
 * 隔离前提：ACL 不是本项目的隔离层，来源守卫才是（D0-3）。
 * 应用一旦自带 ACL manifest，那条前提就没了 —— 而日志里看不出区别。
 */
describe('原生隔离前提', () => {
  it('仓库里没有应用级 ACL manifest：隔离层仍是来源守卫', () => {
    expect(isolationPremiseBroken()).toBeUndefined();
  });

  it('一旦出现应用级 ACL manifest 就报出前提被破坏，并说清后果', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-acl-'));
    const aclDir = join(dir, 'permissions');
    mkdirSync(aclDir);
    const reason = isolationPremiseBroken(aclDir);
    expect(reason).toBeTruthy();
    expect(reason).toContain('来源守卫');
  });

  it('目录不存在时前提成立', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-acl-'));
    expect(isolationPremiseBroken(join(dir, 'permissions'))).toBeUndefined();
  });
});
