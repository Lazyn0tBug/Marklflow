import {parse,walk,generate,lexer} from 'css-tree';
export function escapeHtml(v:string):string {
 return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function safeUrl(value:string,image=false):boolean {
 const v=value.trim();
 if(/[\u0000-\u0020\u007f]/.test(v))return false;
 if(v.startsWith('#'))return true;
 if(image&&/^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(v))return true;
 if(image&&/^blob:https?:\/\//i.test(v))return true;
 if(/^(https?:|mailto:)/i.test(v))return image?/^https?:/i.test(v):true;
 return !/^[a-z][\w+.-]*:|^\/\//i.test(v);
}
const styles=new Set(['text-align','vertical-align','display','width','height','max-width','min-width','font-size','font-family','font-weight','font-style','line-height','color','background-color','margin','margin-top','margin-bottom','margin-left','margin-right','padding','overflow','overflow-x','white-space','fill','stroke','stroke-width','opacity']);
export function cleanStyle(value:string):string {
 try {
  const tree=parse(value,{context:'declarationList'}),out:string[]=[];
  if(tree.type!=='DeclarationList')return '';
  tree.children.forEach(n=>{
   if(n.type!=='Declaration'||!styles.has(n.property.toLowerCase())||n.important)return;
   let valid=true;walk(n.value,x=>{if(x.type==='Url'||x.type==='Raw'||(x.type==='Function'&&/^(var|env|expression|attr)$/i.test(x.name)))valid=false});
   if(valid&&lexer.matchProperty(n.property,n.value).matched)out.push(generate(n));
  });return out.join(';');
 }catch{return ''}
}
export function documentColor(value:string):string {
 if(!/^#[\da-f]{3,8}$/i.test(value)&&!/^rgba?\(/i.test(value))throw new Error('文档颜色必须使用 HEX/RGB');
 const tree=parse(value,{context:'value'});
 if(!lexer.matchProperty('color',tree).matched)throw new Error('文档颜色无效');
 let invalid=false;walk(tree,n=>{if(n.type==='Url'||n.type==='Raw'||(n.type==='Function'&&!/^rgba?$/i.test(n.name)))invalid=true});
 if(invalid)throw new Error('文档颜色无效');return generate(tree);
}
/** Rewrite fragment references with CSS parsing, including quoted URL() and escaped identifiers. */
export function rewriteFragments(value:string,ids:Map<string,string>,attribute:string):string{
 if(['href','xlink:href','xLinkHref'].includes(attribute)&&value.startsWith('#'))return '#'+(ids.get(value.slice(1))||value.slice(1));
 if(['aria-labelledby','aria-describedby'].includes(attribute))return value.split(/\s+/).map(id=>ids.get(id)||id).join(' ');
 if(!['fill','stroke','filter','clip-path','clipPath','mask','marker-start','marker-mid','marker-end','markerStart','markerMid','markerEnd','style'].includes(attribute))return value;
 try{const tree=parse(value,{context:attribute==='style'?'declarationList':'value'});let changed=false;walk(tree,n=>{if(n.type==='Url'&&n.value.startsWith('#')&&ids.has(n.value.slice(1))){n.value='#'+ids.get(n.value.slice(1));changed=true}});return changed?generate(tree):value}catch{return value}
}
