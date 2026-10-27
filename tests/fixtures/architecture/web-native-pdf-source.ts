import corpus from '../export-source/corpus.json' with {type:'json'};
export const pdfName='EXW0 中文冻结文档';
export const rowMarkers=Array.from({length:60},(_,i)=>'ROW_'+String(i).padStart(3,'0'));
export const paragraphMarkers=Array.from({length:18},(_,i)=>'PARA_'+String(i).padStart(3,'0'));
export const pdfSource=[
 '# EXW0_FROZEN_TITLE 中文文档完整性',
 '', '这份文件用于验证真实文本、中文字体、分页、跨页表格、矢量公式和链接。CJK_CHECK 中文可搜索复制。',
 '', '[外部链接](https://example.com/ex-w0) [内部链接](#最终目标)',
 '', '行内公式 $E=mc^2$；块级公式：', '', '$$', String.raw`\frac{a+b}{c}=\sqrt{x^2+1}`, '$$',
 '', '```mermaid', 'graph LR; A[FLOW_ALPHA]-->B[FLOW_OMEGA];', '```',
 '', '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="56" viewBox="0 0 240 56"><rect x="1" y="1" width="238" height="54" fill="#ccfbf1" stroke="#115e59"/><text x="12" y="34" fill="#134e4a">SVG_VECTOR_CHECK</text></svg>',
 '', '<img src="'+corpus.asset.data+'" width="32" height="32" alt="EXW0_ORIGINAL_IMAGE">',
 '', ...paragraphMarkers.flatMap(marker=>['## '+marker, '', marker+' 中文段落：'+ '稳定排版保留内容、来源和可选取文字。'.repeat(6),'']),
 '## 跨页表格', '', '| 行标记 | 中文内容 |', '| --- | --- |', ...rowMarkers.map(marker=>'| '+marker+' | 表格正文保持每一行完整，不丢失最后一项。 |'),
 '', '<h2 id="最终目标">最终目标</h2>', '', 'EXW0_FINAL_MARKER 最后一段中文正文。',
].join('\n');
