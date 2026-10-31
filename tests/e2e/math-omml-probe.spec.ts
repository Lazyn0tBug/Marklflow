import {test,expect} from '@playwright/test';
import {z} from 'zod';
import {writeFile} from 'node:fs/promises';

const recordSchema=z.object({
 id:z.string(),latex:z.string(),display:z.boolean(),hostId:z.string(),line:z.string(),hostTag:z.string(),
 tex:z.string(),mathml:z.string(),tags:z.array(z.string()),hasSemantics:z.boolean(),hasAnnotation:z.boolean(),strayText:z.boolean(),
});
const reportSchema=z.object({version:z.string(),records:z.array(recordSchema)});

/** The DOCX adapter converts the semantic MathML carried by the frozen artifact; this probe pins its real shape. */
for(const environment of ['development','built'] as const)test(`MathML semantic structure stays convertible in ${environment}`,async({page},testInfo)=>{
 const origin=environment==='development'?'http://127.0.0.1:4175':'http://127.0.0.1:4176';
 await page.goto(origin+'/tests/fixtures/architecture/math-omml-probe.html');
 const output=page.locator('[data-state]');await expect(output).toHaveAttribute('data-state','ready',{timeout:25000});
 const raw=await output.textContent()||'null';await testInfo.attach('math-omml-report.json',{body:raw,contentType:'application/json'});
 const report=reportSchema.parse(JSON.parse(raw));
 expect(report.version).toBe('3.2.2');
 expect(report.records.length).toBe(15);
 for(const record of report.records){
  expect(record.mathml.startsWith('<math')).toBe(true);
  expect(record.mathml).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
  expect(record.hostId).toMatch(/^math-\d+$/);
  expect(record.line).toMatch(/^\d+$/);
  expect(record.hostTag).toBe(record.display?'div':'span');
  expect(record.tags.length).toBeGreaterThan(0);
  // The source travels beside the structure on the host, so outputs can describe a formula without reparsing it.
  expect(record.tex).toBe(record.latex);
  // The published semantic layer carries structure only; stray text would leak into the equation.
  expect(record.hasAnnotation).toBe(false);
  expect(record.strayText).toBe(false);
 }
 await writeFile(testInfo.outputPath('mathml-corpus.json'),JSON.stringify({version:report.version,records:report.records},null,2));
});
