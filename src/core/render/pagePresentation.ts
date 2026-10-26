import type {ThemeSpec} from '../model/document';
export function pageCss(m:Readonly<ThemeSpec['margins']>):string {
 return '@page{size:A4;margin:'+m.top+'mm '+m.right+'mm '+m.bottom+'mm '+m.left+'mm;@bottom-center{content:counter(page)}}'+
 '@media print{.mf-document-shell{max-width:none!important;margin:0!important;padding:0!important}.mf-doc{--mf-paper:#fff!important;--mf-ink:#1f2937!important}.mf-doc .mf-table-scroll,.mf-doc .mf-math,.mf-doc .mf-diagram,.mf-doc math[display=block]{overflow:visible}.mf-doc pre{white-space:pre-wrap;overflow-wrap:anywhere;overflow:visible}.mf-doc thead{display:table-header-group}.mf-doc tr{break-inside:avoid}.mf-doc h1,.mf-doc h2,.mf-doc h3{break-after:avoid}.mf-doc p{orphans:3;widows:3}.no-print{display:none!important}}'+
 '.mf-doc .mf-diagram svg,.mf-doc .mf-math svg,.mf-doc img{object-fit:contain;max-height:'+ (297-m.top-m.bottom-10)+'mm}.mf-doc .mf-page-break{break-after:page;page-break-after:always;border:0}.mf-doc details{display:block}';
}
