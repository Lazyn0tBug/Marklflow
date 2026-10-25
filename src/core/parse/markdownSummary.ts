import {z} from 'zod';
import {visit} from 'unist-util-visit';
import {analyzeMarkdown,createHeadingId,textOf} from './markdown';
const point=z.object({line:z.number().int().positive(),column:z.number().int().positive(),offset:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)}).strict();
const range=z.object({start:point,end:point}).strict().refine(r=>r.end.offset>=r.start.offset);
export const markdownSummarySchema=z.object({schemaVersion:z.literal(1),blocks:z.array(z.object({nodeId:z.string().min(1),kind:z.string().min(1),sourceRange:range}).strict()),outline:z.array(z.object({id:z.string().min(1),level:z.number().int().min(1).max(6),text:z.string(),line:z.number().int().positive()}).strict())}).strict();
export type MarkdownSummary=z.infer<typeof markdownSummarySchema>;
/** One parse; offsets remain JavaScript UTF-16 offsets into the exact original source. */
export function summarizeMarkdown(markdown:string,maxNodes=100000):MarkdownSummary {
 const analysis=analyzeMarkdown(markdown),outline:MarkdownSummary['outline']=[];let nodes=0;
 visit(analysis.tree,node=>{if(++nodes>maxNodes)throw new Error('Markdown semantic node limit exceeded');if(node.type==='heading'){const line=node.position!.start.line,text=textOf(node);outline.push({id:createHeadingId(line-1,text),level:node.depth,text,line})}});
 return {schemaVersion:1,blocks:analysis.blocks,outline};
}
/** Checks the returned mapping against original CRLF/BOM/Unicode source, without reparsing. */
export function validateMarkdownSummary(input:unknown,markdown:string):MarkdownSummary {
 const summary=markdownSummarySchema.parse(input),starts=[0];for(const match of markdown.matchAll(/\r\n|\r|\n/g))starts.push(match.index+match[0].length);
 let cursor=0;
 for(const block of summary.blocks){if(block.sourceRange.start.offset<cursor||markdown.slice(cursor,block.sourceRange.start.offset).trim())throw new Error('Incomplete Markdown block coverage');cursor=block.sourceRange.end.offset;for(const p of [block.sourceRange.start,block.sourceRange.end])if(p.offset>markdown.length||starts[p.line-1]===undefined||starts[p.line-1]!+p.column-1!==p.offset||(p.line<starts.length&&p.offset>=starts[p.line]!))throw new Error('Markdown source position mismatch');if(block.nodeId!==`node-${block.kind}-${block.sourceRange.start.offset}-${block.sourceRange.end.offset}`)throw new Error('Markdown node identity mismatch')}
 if(markdown.slice(cursor).trim())throw new Error('Incomplete Markdown block coverage');
 const headingLines=new Set<number>();
 for(const heading of summary.outline){if(heading.line>starts.length||heading.id!==createHeadingId(heading.line-1,heading.text)||headingLines.has(heading.line))throw new Error('Markdown outline mismatch');headingLines.add(heading.line)}
 for(const block of summary.blocks)if(block.kind==='heading'&&!headingLines.has(block.sourceRange.start.line))throw new Error('Incomplete Markdown outline');
 return summary;
}
