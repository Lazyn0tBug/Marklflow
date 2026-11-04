import {describe,expect,it} from 'vitest';
import {
 nakedCommands,
 readCommandSurface,
 snake,
 unreportableGuarded,
 UNGUARDED,
 type CommandSurface,
} from '../../scripts/check-command-admission';

/**
 * 命令面的准入清单：没有命令裸奔。
 * 受保护命令走来源守卫；另有两个刻意不受守卫管，各有准入方式。
 */
describe('命令面准入清单',()=>{
 it('仓库的命令面没有裸奔的命令',()=>{
  const surface=readCommandSurface();
  expect(nakedCommands(surface)).toHaveLength(0);
  expect(unreportableGuarded(surface)).toHaveLength(0);
 });

 it('受保护命令都在页面可回传的枚举里',()=>{
  const surface=readCommandSurface();
  expect(surface.guarded.length).toBeGreaterThan(0);
  for(const name of surface.guarded){
   expect(surface.reportable).toContain(name);
  }
 });

 it('枚举变体名按 serde 的 snake_case 还原',()=>{
  expect(snake('SelectNativeSave')).toBe('select_native_save');
  expect(snake('PrintNativePdf')).toBe('print_native_pdf');
  expect(snake('GetPlatformInfo')).toBe('get_platform_info');
 });

 it('新加一个既没走守卫也不在清单里的命令会被认出来',()=>{
  const surface:CommandSurface={
   registered:['read_native_text','brand_new_command'],
   guarded:['read_native_text'],
   reportable:['read_native_text'],
  };
  expect(nakedCommands(surface)).toEqual(['brand_new_command']);
 });

 it('走守卫却不在可回传枚举里的命令会被认出来',()=>{
  const surface:CommandSurface={
   registered:['read_native_text'],
   guarded:['read_native_text','print_native_pdf'],
   reportable:['read_native_text'],
  };
  expect(unreportableGuarded(surface)).toEqual(['print_native_pdf']);
 });

 it('不受守卫的两个命令各有准入方式',()=>{
  for(const name of Object.keys(UNGUARDED)){
   expect(UNGUARDED[name]).toBeTruthy();
  }
 });
});
