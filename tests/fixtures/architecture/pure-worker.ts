import {analyzeMarkdown,extractOutline} from '../../../src/core/parse/markdown';
import {documentSchema} from '../../../src/core/model/documentSchema';
self.postMessage({kind:'ready',text:extractOutline('# Worker &copy; &NotEqualTilde;')[0]?.text,blocks:analyzeMarkdown('# Worker 🧪').blocks,invalidAccepted:documentSchema.safeParse({}).success});
