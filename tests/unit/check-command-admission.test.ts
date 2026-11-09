import {describe, expect, it} from 'vitest';
import {
  nakedCommands,
  readCommandSurface,
  registeredCommands,
  snake,
  staleExceptions,
  unreportableGuarded,
  UNGUARDED,
  type CommandSurface,
} from '../../scripts/check-command-admission';

/**
 * 命令面的准入清单：没有命令裸奔。
 * 受保护命令走来源守卫；另有两个刻意不受守卫管，各有准入方式。
 */
describe('命令面准入清单', () => {
  it('仓库的命令面没有裸奔的命令', () => {
    const surface = readCommandSurface();
    expect(nakedCommands(surface)).toHaveLength(0);
    expect(unreportableGuarded(surface)).toHaveLength(0);
  });

  it('受保护命令都在页面可回传的枚举里', () => {
    const surface = readCommandSurface();
    expect(surface.guarded.length).toBeGreaterThan(0);
    for (const name of surface.guarded) {
      expect(surface.reportable).toContain(name);
    }
  });

  it('枚举变体名按 serde 的 snake_case 还原', () => {
    expect(snake('SelectNativeSave')).toBe('select_native_save');
    expect(snake('PrintNativePdf')).toBe('print_native_pdf');
    expect(snake('GetPlatformInfo')).toBe('get_platform_info');
  });

  it('新加一个既没走守卫也不在清单里的命令会被认出来', () => {
    const surface: CommandSurface = {
      registered: ['read_native_text', 'brand_new_command'],
      guarded: ['read_native_text'],
      reportable: ['read_native_text'],
    };
    expect(nakedCommands(surface)).toEqual(['brand_new_command']);
  });

  it('走守卫却不在可回传枚举里的命令会被认出来', () => {
    const surface: CommandSurface = {
      registered: ['read_native_text'],
      guarded: ['read_native_text', 'print_native_pdf'],
      reportable: ['read_native_text'],
    };
    expect(unreportableGuarded(surface)).toEqual(['print_native_pdf']);
  });

  it('不受守卫的两个命令各有准入方式', () => {
    for (const name of Object.keys(UNGUARDED)) {
      expect(UNGUARDED[name]).toBeTruthy();
    }
  });

  it('命令名挤在一行时也要全部解析出来', () => {
    // 按行切会只取到最后一个 ✓，其余的静默丢掉 ✓——
    // 丢掉的命令就不参与"裸奔"判定 ✓，检查会照样通过 ✓。
    const packed = `tauri::generate_handler![
   get_platform_info, log_event, files::select_native_open,
   files::read_native_text, files::brand_new_command
  ]);`;
    const names = registeredCommands(packed);
    expect(names).toContain('get_platform_info');
    expect(names).toContain('log_event');
    expect(names).toContain('select_native_open');
    expect(names).toContain('read_native_text');
    expect(names).toContain('brand_new_command');
  });

  it('解析不出命令名时响着失败，不静默放过', () => {
    // 解析出来的东西不像命令名 ✓ → 写法变了 ✓ → 响着失败 ✓。
    const broken = 'tauri::generate_handler![read_native_text, "some string"]);';
    expect(() => registeredCommands(broken)).toThrow();
    // 注册表是空的 ✓ → 同样响着失败 ✓。
    expect(() => registeredCommands('tauri::generate_handler![ ]);')).toThrow();
  });

  it('例外清单里的命令其实走守卫了就算过期', () => {
    const surface: CommandSurface = {
      registered: ['get_platform_info', 'log_event', 'read_native_text'],
      guarded: ['get_platform_info', 'read_native_text'],
      reportable: ['get_platform_info', 'read_native_text'],
    };
    expect(staleExceptions(surface)).toContain('get_platform_info');
  });

  it('例外清单里的命令已经不在注册表里了也算过期', () => {
    const surface: CommandSurface = {
      registered: ['read_native_text'],
      guarded: ['read_native_text'],
      reportable: ['read_native_text'],
    };
    expect(staleExceptions(surface)).toContain('get_platform_info');
    expect(staleExceptions(surface)).toContain('log_event');
  });

  it('仓库的例外清单没有过期条目', () => {
    expect(staleExceptions(readCommandSurface())).toHaveLength(0);
  });
});
