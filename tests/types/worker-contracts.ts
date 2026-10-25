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

import type {TaskKind} from '../../src/application/tasks/contracts';
import type {RoleSchedulerHooks} from '../../src/application/tasks/roleScheduler';
// @ts-expect-error: Only the finite preview and export kinds may enter governance.
const arbitraryTask:TaskKind='plugin.custom';
// @ts-expect-error: Preview publication must return undefined synchronously, never a Promise.
const asynchronousPublish:RoleSchedulerHooks['generated']=async()=>{};
void arbitraryTask;void asynchronousPublish;

import type {PreviewSubmission,PreviewCacheKey} from '../../src/application/tasks/previewIdentity';
// @ts-expect-error: Only foreground/background roles belong to preview envelopes.
const invalidRole:PreviewSubmission['role']='compute';
// @ts-expect-error: A cache key cannot be replaced with a partial execution ticket.
const invalidCacheKey:PreviewCacheKey={taskId:'task',activationEpoch:1};
void invalidRole;void invalidCacheKey;

// @ts-expect-error: Legacy nested requests cannot replace a minimal preview envelope.
const legacyPreview:PreviewSubmission={request:{}};
void legacyPreview;
