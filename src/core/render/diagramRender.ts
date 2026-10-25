import {sharedDom,type DomScheduling} from '../platform/web/sharedDom';
import {renderDotToSVG} from './graphvizRender';
import {sanitizeDocumentHtml} from './htmlPolicy';
/** Existing limited DOT renderer; no new Graphviz implementation. */
export function renderDotDiagram(code:string,options:DomScheduling={}):Promise<string>{
 return sharedDom.step(options.priority??'foreground','engine',options.signal??new AbortController().signal,()=>sanitizeDocumentHtml(renderDotToSVG(code)));
}
