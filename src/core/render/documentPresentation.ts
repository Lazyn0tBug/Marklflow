import css from '../../styles/document.css?raw';
import { DEFAULT_THEME, type ThemeSpec } from '../model/document';
import {themeSchema} from '../model/themeSchema';
import {documentColor,escapeHtml} from '../policy/htmlRules';
export const DOCUMENT_CSS=css;
export function documentStyle(theme:ThemeSpec=DEFAULT_THEME):Record<string,string> {
 const t=themeSchema.parse(theme);
 const fonts={sans:'system-ui,"Microsoft YaHei","PingFang SC",sans-serif',serif:'"Noto Serif CJK SC","Songti SC",SimSun,serif',mono:'Consolas,"Cascadia Code",monospace'};
 const paper=t.paperTheme==='warm-paper'?'#fffdf5':t.paperTheme==='dark-slate'?'#17212c':'#ffffff';
 return {'--mf-primary':documentColor(t.primaryColor),'--mf-size':t.fontSize+'px','--mf-leading':String(t.lineHeight),'--mf-font':fonts[t.fontFamily],'--mf-paper':paper,'--mf-ink':t.paperTheme==='dark-slate'?'#f3f4f6':'#1f2937'};
}
export function documentStyleAttribute(theme:ThemeSpec):string {
 return escapeHtml(Object.entries(documentStyle(theme)).map(([k,v])=>k+':'+v).join(';'));
}

export function variableStyleAttribute(variables:Readonly<Record<string,string>>):string {return escapeHtml(Object.entries(variables).map(([key,value])=>key+':'+value).join(';'))}
