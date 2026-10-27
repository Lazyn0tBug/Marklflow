// @vitest-environment node
import {it,expect} from 'vitest';
import {checkModuleSource} from '../../scripts/check-module-boundaries';
it('rejects Markdown/LaTeX preparation imports from actual HTML format adapters',()=>{
 for(const file of ['src/core/export/htmlExporter.ts','src/core/export/pdfExporter.ts','src/core/export/docxExporter.ts','src/core/export/outputCapabilities.ts','src/core/render/htmlPaginator.ts','src/core/platform/web/pdfDelivery.ts'])for(const dependency of ['../parse/markdown','./exportContent','./sourceAttachment','./markdownBundle','../render/documentRenderer','remark-parse','mathjax'])expect(checkModuleSource(file,'import value from '+JSON.stringify(dependency))).not.toEqual([]);
 expect(checkModuleSource('src/core/export/htmlExporter.ts','import("./exportContent")')).not.toEqual([]);
 expect(checkModuleSource('src/core/export/markdownBundle.ts','import {parseMarkdownSyntax} from "../parse/markdown"')).toEqual([]);
});

it('keeps PDF delivery in the platform composition instead of HTML generation',()=>{
 for(const file of ['src/core/export/pdfExporter.ts','src/core/export/htmlExporter.ts','src/core/export/docxExporter.ts','src/core/export/exportContent.ts','src/core/export/documentPrint.ts','src/core/render/htmlPaginator.ts'])for(const module of ['../platform/web/pdfDelivery','../platform/web/pdfDelivery.ts'])expect(checkModuleSource(file,'export {deliverPdfHtml} from '+JSON.stringify(module))).not.toEqual([]);
 expect(checkModuleSource('src/core/platform/web/exportService.ts','import {deliverPdfHtml} from "./pdfDelivery"')).toEqual([]);
});
