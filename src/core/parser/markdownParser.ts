/** Legacy browser facade. Pure consumers must use core/parse/markdown. */
export {createHeadingId,extractOutline,generateMarkdownTable,mathExpressions} from '../parse/markdown';
export type {HeadingItem} from '../parse/markdown';
export {parseMarkdownDocument,parseMarkdownToHtml,parseInline} from '../render/markdownHtml';
export type {ParseOptions} from '../render/markdownHtml';
