import {z} from 'zod';
import {themeSchema} from '../render/htmlPolicy';
export const assetSchema=z.object({
 source:z.string().max(15*1024*1024).refine(v=>v.startsWith('data:')||v.length<=4096),mime:z.enum(['image/png','image/jpeg','image/gif','image/webp','image/avif']),bytes:z.number().int().min(0).max(10*1024*1024),
 sha256:z.string().regex(/^[a-f0-9]{64}$/),data:z.string().max(15*1024*1024).regex(/^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i),license:z.string().max(2048).optional(),
});
const date=z.string().max(100).refine(v=>Number.isFinite(Date.parse(v)));
export const documentSchema=z.object({
 schemaVersion:z.literal(1),id:z.string().min(1).max(256),revision:z.number().int().min(0),markdown:z.string().max(10*1024*1024),
 meta:z.object({title:z.string().max(1000),author:z.string().max(1000).optional(),createdAt:date,updatedAt:date,tags:z.array(z.string().max(100)).max(100).optional()}),
 theme:themeSchema,options:z.object({syntaxProfile:z.literal('commonmark-gfm-v1'),mathMode:z.enum(['mathml','svg'])}),
 assets:z.array(assetSchema).max(128).optional(),
});
