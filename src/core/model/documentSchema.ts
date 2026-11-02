import {z} from 'zod';
import {themeSchema} from './themeSchema';
export const DOCUMENT_TITLE_MAX=1000;
export const DOCUMENT_MARKDOWN_MAX=10*1024*1024;
export const assetSchema=z.object({
 source:z.string().max(15*1024*1024).refine(v=>v.startsWith('data:')||v.length<=4096),mime:z.enum(['image/png','image/jpeg','image/gif','image/webp','image/avif']),bytes:z.number().int().min(0).max(10*1024*1024),
 sha256:z.string().regex(/^[a-f0-9]{64}$/),data:z.string().max(15*1024*1024).regex(/^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i),license:z.string().max(2048).optional(),
}).transform(({license,...asset})=>({...asset,...(license===undefined?{}:{license})}));
const date=z.string().max(100).refine(v=>Number.isFinite(Date.parse(v)));
// 未建模的字段原样保留：别处的构建写下的记录在下一次保存时不应被静默剥掉。
export const documentSchema=z.object({
 schemaVersion:z.literal(1),id:z.string().min(1).max(256),revision:z.number().int().min(0),markdown:z.string().max(DOCUMENT_MARKDOWN_MAX),
 meta:z.object({title:z.string().max(DOCUMENT_TITLE_MAX),author:z.string().max(DOCUMENT_TITLE_MAX).optional(),createdAt:date,updatedAt:date,tags:z.array(z.string().max(100)).max(100).optional()}).passthrough().transform(({author,tags,...meta})=>({...meta,...(author===undefined?{}:{author}),...(tags===undefined?{}:{tags})})),
 theme:themeSchema,options:z.object({syntaxProfile:z.literal('commonmark-gfm-v1'),mathMode:z.enum(['mathml','svg'])}),
 assets:z.array(assetSchema).max(128).optional(),
}).passthrough().transform(({assets,...doc})=>({...doc,...(assets===undefined?{}:{assets})}));
