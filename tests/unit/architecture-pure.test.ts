// @vitest-environment node
import {it,expect} from 'vitest';
import {analyzeMarkdown,extractOutline,mathExpressions} from '../../src/core/parse/markdown';
import {documentSchema} from '../../src/core/model/documentSchema';
import {inspectStoredCollection} from '../../src/core/model/documentRepository';
import {checkModuleSource} from '../../scripts/check-module-boundaries';
it('imports model/parser without a DOM and preserves serializable source ranges',()=>{
 expect(typeof globalThis.window).toBe('undefined');
 const md='# 中文🧪\r\n\r\n$a+b$\r\n';const result=analyzeMarkdown(md);
 expect(result.blocks[0]?.sourceRange.start.offset).toBe(0);
 expect(md.slice(result.blocks[1]!.sourceRange.start.offset,result.blocks[1]!.sourceRange.end.offset)).toBe('$a+b$');
 expect(structuredClone(result)).toEqual(result);
 expect(extractOutline(md)[0]?.line).toBe(1);expect(mathExpressions(md)).toEqual([{value:'a+b',display:false}]);
 expect(documentSchema.safeParse({}).success).toBe(false);
 expect(inspectStoredCollection({storageVersion:99,documents:[]})).toMatchObject({format:'invalid'});
});
it('rejects layer violations including re-exports and computed imports',()=>{
 for(const source of ["import '../render/htmlPolicy'","export * from '../platform/crypto'","import x from 'dompurify'","import(name)"]){expect(checkModuleSource('src/core/parse/bad.ts',source).length).toBeGreaterThan(0)}
 expect(checkModuleSource('src/App.tsx',"import fs from 'node:fs'; process.exit();").length).toBeGreaterThan(0);
 expect(checkModuleSource('src/core/model/good.ts',"import {z} from 'zod'; import type {DocumentRecord} from './document';")).toEqual([]);
});
