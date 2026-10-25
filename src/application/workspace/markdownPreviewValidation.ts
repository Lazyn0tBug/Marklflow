import {validateMarkdownSummary} from '../../core/parse/markdownSummary';
import type {PreviewArtifactValidator} from './previewActivation';
export const validateMarkdownWorkerArtifact:PreviewArtifactValidator=(submission,artifact)=>{
 if(submission.cacheKey.previewKind!=='preview.flow'||artifact.mediaType!=='application/json'||artifact.resources.length)throw new Error('Unexpected Markdown parse artifact');
 const input:unknown=JSON.parse(artifact.content),summary=validateMarkdownSummary(input,submission.document.markdown);
 if(summary.blocks.length!==artifact.sourceMap.length||summary.blocks.some((b,index)=>{const r=artifact.sourceMap[index];return !r||b.nodeId!==r.nodeId||JSON.stringify(b.sourceRange)!==JSON.stringify({start:r.start,end:r.end})}))throw new Error('Markdown artifact mapping mismatch');
 return undefined;
};
