import {it,expect} from 'vitest';
import {groupDocxIssues,inspectDocx,DOCX_FORMULA_IMAGE_MESSAGE} from '../../src/core/export/outputCapabilities';
import {exportDocumentToDocx} from '../../src/core/export/docxExporter';
import {createNewDocument} from '../../src/core/storage/storage';
import fixture from '../fixtures/docx-math/o0-cases.json' with {type:'json'};
it('groups repeated formula notices once and preserves every source detail in order',()=>{
 const sample=fixture.cases[0]!,issues=inspectDocx(sample.markdown),groups=groupDocxIssues(issues);
 expect(issues).toHaveLength(24);expect(groups).toHaveLength(1);expect(groups[0]!.summary).toContain('24 个公式');expect(groups[0]!.issues).toEqual(issues);expect(issues[0]!.nodeId).toBe(sample.firstNodeId);expect(issues.at(-1)!.nodeId).toBe(sample.lastNodeId);expect(issues.every(issue=>issue.message===DOCX_FORMULA_IMAGE_MESSAGE)).toBe(true);
});
it('does not merge blockers with compatibility notices or discard their positions',()=>{
 const groups=groupDocxIssues(inspectDocx(fixture.cases[1]!.markdown));expect(groups.some(group=>group.adaptation==='unsupported'&&group.summary.includes('MathML')&&group.issues[0]!.nodeId==='line-5')).toBe(true);expect(groups.some(group=>group.adaptation==='static')).toBe(true);
});
it('rejects unconfirmed exports with one formula summary instead of one message per occurrence',async()=>{
 const document={...createNewDocument(),markdown:fixture.cases[0]!.markdown};const error=await exportDocumentToDocx(document).catch((reason:unknown)=>reason);expect(error).toBeInstanceOf(Error);expect(String(error).match(/24 个公式/g)).toHaveLength(1);expect(String(error)).not.toContain('line-49');
});
it('keeps the existing workbench sample as a frozen formula-diagnostic baseline',()=>{const sample=fixture.cases[3]!,issues=inspectDocx(sample.markdown);expect(issues.filter(issue=>issue.message===DOCX_FORMULA_IMAGE_MESSAGE)).toHaveLength(sample.formulaCount);expect(groupDocxIssues(issues).flatMap(group=>group.issues)).toHaveLength(issues.length)});
