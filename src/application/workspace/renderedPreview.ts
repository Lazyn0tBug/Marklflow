import {z} from 'zod';
import {markdownSummarySchema} from '../../core/parse/markdownSummary';
import {validateMarkdownWorkerArtifact} from './markdownPreviewValidation';
import type {PreviewArtifactValidator} from './previewActivation';
export const renderedPreviewSchema=z.object({schemaVersion:z.literal(1),kind:z.enum(['preview.flow','preview.a4']),html:z.string(),css:z.string(),total:z.number().int().nonnegative(),parse:markdownSummarySchema}).strict().superRefine((value,context)=>{if(value.kind==='preview.a4'&&value.total<1||value.kind==='preview.flow'&&value.total!==0)context.addIssue({code:'custom',message:'Invalid rendered preview page count'})});
export type RenderedPreview=z.infer<typeof renderedPreviewSchema>;
export const validateRenderedPreview:PreviewArtifactValidator=(submission,artifact)=>{
 if(artifact.mediaType!=='application/json')throw new Error('Invalid rendered preview envelope');
 const value=renderedPreviewSchema.parse(JSON.parse(artifact.content));if(value.kind!==submission.cacheKey.previewKind)throw new Error('Preview mode mismatch');
 validateMarkdownWorkerArtifact(submission,{...artifact,content:JSON.stringify(value.parse)});
 if(submission.document.markdown.trim()&&!value.html.trim())throw new Error('Incomplete rendered preview');
 return undefined;
};
