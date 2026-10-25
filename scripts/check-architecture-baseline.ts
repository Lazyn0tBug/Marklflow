import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {compareBaselines} from './architecture-baseline-contract';
const current=process.argv[2];if(!current)throw new Error('Usage: bun run check:architecture-baseline <measurement.json>');
const read=async(file:string):Promise<unknown>=>JSON.parse(await readFile(file,'utf8'));
const budget=z.object({regression:z.unknown()}).parse(await read('docs/contracts/architecture-runtime-budget.json'));
const results=compareBaselines(await read('docs/acceptance/architecture-a0-baseline.json'),await read(current),budget.regression);
console.log(JSON.stringify(results,null,2));if(results.some(row=>row.checks.some(check=>!check.passed)))process.exitCode=1;
