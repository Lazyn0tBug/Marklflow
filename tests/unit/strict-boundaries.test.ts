import {expect,it} from 'vitest';
import {documentSchema,assetSchema} from '../../src/core/model/documentSchema';
import {createNewDocument} from '../../src/core/storage/storage';
import {decodeImage} from '../../src/core/export/documentAssets';
import {parseDotToGraph,renderDotToSVG} from '../../src/core/render/graphvizRender';

it('normalizes explicit undefined optional fields without inventing data',()=>{
 const input={...createNewDocument('optional'),assets:undefined};
 const doc=documentSchema.parse({...input,meta:{...input.meta,author:undefined,tags:undefined}});
 expect(Object.hasOwn(doc,'assets')).toBe(false);
 expect(Object.hasOwn(doc.meta,'author')).toBe(false);expect(Object.hasOwn(doc.meta,'tags')).toBe(false);
 const asset=assetSchema.parse({source:'x.png',mime:'image/png',bytes:1,sha256:'a'.repeat(64),data:'data:image/png;base64,YQ==',license:undefined});
 expect(Object.hasOwn(asset,'license')).toBe(false);
});
it('keeps explicit empty optional values and empty asset arrays',()=>{
 const doc=createNewDocument('present');doc.assets=[];doc.meta.author='';doc.meta.tags=[];
 expect(documentSchema.parse(doc)).toMatchObject({assets:[],meta:{author:'',tags:[]}});
});
it('handles empty DOT input, empty labels and absent edge attributes',()=>{
 expect(renderDotToSVG('digraph {}')).toContain('未检测到有效');
 const graph=parseDotToGraph('rankdir=lr;\nA [label=""];\nA -> B');
 expect(graph.rankdir).toBe('LR');expect(graph.nodes.get('A')?.label).toBe('');
 const edge=graph.edges[0];expect(edge).toEqual({from:'A',to:'B'});
 expect(renderDotToSVG('A -> B\nB -> A')).toContain('<svg');
});
it('rejects absent or invalid image captures explicitly',()=>{
 for(const value of ['', 'data:image/png;base64,', 'data:text/plain;base64,YQ=='])expect(()=>decodeImage(value)).toThrow('不支持');
});
