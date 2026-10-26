/** Canonical, serializable HTML export content. Source attachments are deliberately absent. */
import {z} from 'zod';
import {assetSchema} from './documentSchema';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const exportHtmlSchema=z.object({
 schemaVersion:z.literal(1),
 source:z.object({documentId:z.string().min(1),revision:z.number().int().nonnegative(),mdHash:hash,renderConfigVersion:hash}).readonly(),
 meta:z.object({title:z.string(),author:z.string().optional(),createdAt:z.string(),updatedAt:z.string(),tags:z.array(z.string()).readonly().optional()}).readonly(),
 html:z.string().max(50*1024*1024),
 presentation:z.object({css:z.string(),variables:z.record(z.string(),z.string()).readonly(),page:z.object({size:z.literal('A4'),margins:z.object({top:z.number(),right:z.number(),bottom:z.number(),left:z.number()}).readonly()}).readonly()}).readonly(),
 mathMode:z.enum(['mathml','svg']),assets:z.array(assetSchema.readonly()).max(128).readonly(),
 diagnostics:z.array(z.object({nodeId:z.string(),message:z.string(),severity:z.enum(['error','warning'])}).readonly()).readonly(),
}).strict().readonly();
export type ExportHtmlArtifact=z.infer<typeof exportHtmlSchema>;
