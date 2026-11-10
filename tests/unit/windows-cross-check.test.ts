import {describe, expect, it} from 'vitest';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {appModules, assertReferencesResolve} from '../../scripts/check-windows-com';

/**
 * 交叉检查夹具的**模块清单** ✓。
 *
 * **清单从应用 crate 根（`lib.rs`）推出来** ✓ ⇒ ⇒ 应用加一个模块 ⇒ ⇒
 * 夹具自动带上它 ✓ ⇒ ⇒ "应用加了、夹具没加"那种洞不会再有 ✓。
 *
 * **那种洞本机看不见** ✓（macOS 上没装 Windows 目标 ⇒ ⇒ 整个交叉检查跳过 ✓）
 * ⇒ ⇒ 所以**清单这件事在这里盯住** ✓ ⇒ ⇒ 任何平台都能验 ✓。
 */

/** 仓库根 ✓：测试从仓库根跑 ✓（与仓库里别的测试同一口径 ✓）。 */
const repo = process.cwd();

/** 应用 crate 根里声明的模块 ✓：**独立于脚本再读一遍** ✓ ⇒ ⇒ 两边对不上就是错 ✓。 */
function declaredModules(): string[] {
  const source = readFileSync(join(repo, 'src-tauri/src/lib.rs'), 'utf8')
    // **注释里的 `mod` 不算声明** ✓ ⇒ ⇒ 读的是声明 ✓。
    .replace(/\/\/.*$/gm, '');
  return [...source.matchAll(/\bmod\s+([a-z_][a-z0-9_]*)\s*;/g)].map((match) => match[1]!).sort();
}

describe('夹具的模块清单', () => {
  it('就是应用 crate 根声明的那批，一个不多一个不少', () => {
    expect(Object.keys(appModules(repo)).sort()).toEqual(declaredModules());
  });

  it('字节摘要在里面，它不是靠人记得写进去的', () => {
    // **这个洞就是这么来的** ✓：`a87c2c3` 加了 `hash.rs` ✓ ⇒ ⇒
    // 清单是手抄的 ⇒ ⇒ 抄漏了 ⇒ ⇒ 夹具编不过 ⇒ ⇒ 而本机看不见 ✓。
    expect(Object.keys(appModules(repo))).toContain('hash');
  });

  it('应用加一个模块，清单自动带上它', () => {
    // **用一份假 crate 来试** ✓ ⇒ ⇒ 这件事**在 macOS 上就能验** ✓ ⇒ ⇒
    // 不再靠"等 CI 红了才知道" ✓。
    const root = mkdtempSync(join(tmpdir(), 'mf-module-set-'));
    try {
      const crateRoot = join(root, 'src-tauri/src');
      mkdirSync(crateRoot, {recursive: true});
      writeFileSync(
        join(crateRoot, 'lib.rs'),
        ['mod alpha;', '#[cfg(target_os = "windows")]', 'mod beta;', 'mod gamma;'].join('\n'),
      );
      writeFileSync(join(crateRoot, 'alpha.rs'), '');
      writeFileSync(join(crateRoot, 'beta.rs'), '');
      writeFileSync(join(crateRoot, 'gamma.rs'), '');
      // **属性写在上一行也认得** ✓ ⇒ ⇒ 与应用里的写法一样 ✓。
      expect(Object.keys(appModules(root)).sort()).toEqual(['alpha', 'beta', 'gamma']);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('声明了一个没有文件的模块，当场说出来', () => {
    const root = mkdtempSync(join(tmpdir(), 'mf-module-set-'));
    try {
      const crateRoot = join(root, 'src-tauri/src');
      mkdirSync(crateRoot, {recursive: true});
      writeFileSync(join(crateRoot, 'lib.rs'), 'mod ghost;');
      expect(() => appModules(root)).toThrow(/ghost/);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });
});

describe('跨模块的引用', () => {
  it('引用的是应用的一个模块时没有问题', () => {
    expect(() =>
      assertReferencesResolve({
        files: 'crate::hash::sha256_hex(&[]);',
        hash: 'pub fn sha256_hex() {}',
      }),
    ).not.toThrow();
  });

  it('引用了 crate 根上的一个条目时会被认出来', () => {
    // **夹具的 crate 根上只有模块** ✓ ⇒ ⇒ 引用条目 ⇒ ⇒ 夹具给不出它 ⇒ ⇒
    // **当场说清** ✓ ⇒ ⇒ 不给一句编译器的天书 ✓。
    expect(() => assertReferencesResolve({files: 'crate::PlatformInfo::new()'})).toThrow(
      /PlatformInfo/,
    );
  });
});
