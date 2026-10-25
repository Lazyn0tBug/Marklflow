import {analyzeMarkdown,extractOutline} from '../../../src/core/parse/markdown';
import {documentSchema} from '../../../src/core/model/documentSchema';
import {DEFAULT_THEME} from '../../../src/core/model/document';
const source='# Worker 🧪\r\n\r\n$a+b$';
const input={schemaVersion:1,id:'worker-probe',revision:1,markdown:source,meta:{title:'worker',createdAt:'2026-10-25T00:00:00Z',updatedAt:'2026-10-25T00:00:00Z'},theme:DEFAULT_THEME,options:{syntaxProfile:'commonmark-gfm-v1',mathMode:'mathml'}};
const result={kind:'ready',text:extractOutline('# Worker &copy; &NotEqualTilde;')[0]?.text,blocks:analyzeMarkdown(source).blocks,validAccepted:documentSchema.safeParse(input).success,invalidAccepted:documentSchema.safeParse({}).success,hasDOM:'document'in globalThis||'window'in globalThis};
self.postMessage(structuredClone(result));
