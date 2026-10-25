// @vitest-environment node
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {compareBaselines,measurementOutput,baselineSchema} from '../../scripts/architecture-baseline-contract';
const baseline:unknown=JSON.parse(readFileSync('docs/acceptance/architecture-a0-baseline.json','utf8'));
const budget={maxMultiplier:3,parseAdditiveMs:50,renderAdditiveMs:100,paginationAdditiveMs:250};
it('protects frozen evidence including normalized paths',()=>{expect(()=>measurementOutput('docs/acceptance/../acceptance/architecture-a0-baseline.json')).toThrow();expect(measurementOutput('test-results/new.json')).toContain('new.json')});
it('compares unchanged evidence and separates first/warm render',()=>{const rows=compareBaselines(baseline,baseline,budget);expect(rows.every(row=>row.checks.every(check=>check.passed))).toBe(true);expect(rows[0]?.checks.map(check=>check.metric)).toContain('warmRenderMax')});
it('rejects incomplete, nonfinite and mismatched evidence',()=>{expect(()=>compareBaselines(baseline,{},budget)).toThrow();const source=baselineSchema.parse(baseline);source.results[0]!.renderMs=[1,NaN,3];expect(()=>compareBaselines(baseline,source,budget)).toThrow();source.results=[];expect(()=>compareBaselines(baseline,source,budget)).toThrow()});
it('rejects environment changes, duplicate workloads, fixture drift and resource leaks',()=>{
 const environment=baselineSchema.parse(baseline);environment.environment.browser='other';expect(()=>compareBaselines(baseline,environment,budget)).toThrow();
 const duplicate=baselineSchema.parse(baseline);duplicate.results[1]=duplicate.results[0]!;expect(()=>compareBaselines(baseline,duplicate,budget)).toThrow();
 const fixture=baselineSchema.parse(baseline);fixture.results[0]!.sha256='0'.repeat(64);expect(()=>compareBaselines(baseline,fixture,budget)).toThrow();
 const leak=baselineSchema.parse(baseline);leak.results[0]!.after.styles++;expect(()=>compareBaselines(baseline,leak,budget)).toThrow();
});
it('fails an isolated warm regression without hiding it under first-render cost',()=>{const current=baselineSchema.parse(baseline);current.results[0]!.renderMs[1]=10000;const result=compareBaselines(baseline,current,budget);expect(result[0]?.checks.find(check=>check.metric==='warmRenderMax')?.passed).toBe(false);expect(result[0]?.checks.find(check=>check.metric==='firstRender')?.passed).toBe(true)});
