import {analyzeMarkdown} from '../../src/core/parse/markdown';
import {documentSchema} from '../../src/core/model/documentSchema';
const result=analyzeMarkdown('# pure');
void result;void documentSchema;
// @ts-expect-error: Worker/pure compilation must never acquire browser Window globals.
void window;
// @ts-expect-error: Worker/pure compilation must never acquire DOM document globals.
void document;
// @ts-expect-error: Worker/pure compilation must never acquire Node process globals.
void process;
