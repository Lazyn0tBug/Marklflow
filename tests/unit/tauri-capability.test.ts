import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

/**
 * 桌面包的能力清单 ✓。
 *
 * **它只放行事件监听那两条** ✓ ⇒ ⇒ 拖放监听器注册得上 ✓ ⇒ ⇒
 * 而**文件系统、对话框、远端都不放行** ✓ ⇒ ⇒ 页面自己碰不到那些 ✓ ⇒ ⇒
 * 桌面侧的对话框与文件读写**由原生侧做** ✓ ⇒ ⇒ 页面拿不到路径 ✓。
 *
 * **这份清单曾经被删掉** ✓ ⇒ ⇒ `listen` 没了授权 ⇒ ⇒ 拖放监听注册不上 ⇒ ⇒
 * 原生侧一直在发那个事件、页面从来没听 ⇒ ⇒ **拖放一直是死的** ✓ ⇒ ⇒
 * 而日志只说得出"出了个拒绝" ✓ ⇒ ⇒ ⇒ 所以这里把它钉住 ✓。
 */

const repo = process.cwd();

interface Capability {
  identifier: string;
  windows?: string[];
  permissions: string[];
}

const capability = (): Capability =>
  JSON.parse(readFileSync(join(repo, 'src-tauri/capabilities/default.json'), 'utf8')) as Capability;

describe('桌面包的能力清单', () => {
  it('放行的只有事件监听那两条', () => {
    expect(capability().permissions.sort()).toEqual([
      'core:event:allow-listen',
      'core:event:allow-unlisten',
    ]);
  });

  it('不放行文件系统、对话框与远端', () => {
    // **页面自己不许碰那些** ✓ ⇒ ⇒ 路径与内容都拿不到 ✓ ⇒ ⇒
    // 桌面侧的文件与对话框**由原生侧做** ✓ ⇒ ⇒ 授权只在我们自己那条命令上 ✓。
    const permissions = capability().permissions.join(' ');
    expect(permissions).not.toContain('fs:');
    expect(permissions).not.toContain('dialog:');
    expect(permissions).not.toContain('http:');
    expect(permissions).not.toContain('core:default');
  });

  it('只作用在主窗口上', () => {
    expect(capability().windows).toEqual(['main']);
  });
});
