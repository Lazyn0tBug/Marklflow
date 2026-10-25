import {build} from 'vite';
import {resolve,sep} from 'node:path';
const directory=resolve('test-results/worker-probe-dist');
if(!directory.startsWith(resolve('test-results')+sep))throw new Error('Unsafe test output path');
await build({configFile:'vite.config.ts',build:{outDir:directory,emptyOutDir:true,rolldownOptions:{input:[resolve('tests/fixtures/architecture/worker-probe.html'),resolve('tests/fixtures/architecture/markdown-worker-probe.html'),resolve('tests/fixtures/architecture/dual-worker-probe.html'),resolve('tests/fixtures/architecture/shared-dom-probe.html'),resolve('tests/fixtures/architecture/math-dom-probe.html'),resolve('tests/fixtures/architecture/diagram-dom-probe.html'),resolve('tests/fixtures/architecture/pagination-dom-probe.html')]}}});
