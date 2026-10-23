/**
 * MarkFlow (墨流) 原生 DOCX 导出协调器
 * 使用 docx 库直接在浏览器端构建原生 OpenXML 文档与 Blob
 * 保证在 Word 与 WPS 中原生可编辑
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from 'docx';
import { DocumentRecord } from '../model/document';

export async function exportDocumentToDocx(doc: DocumentRecord): Promise<Blob> {
  const lines = doc.markdown.split('\n');
  const docChildren: (Paragraph | Table)[] = [];

  // 1. 文档头部
  docChildren.push(
    new Paragraph({
      text: doc.meta.title || 'MarkFlow 文档',
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    })
  );

  docChildren.push(
    new Paragraph({
      children: [
        new TextRun({ text: `编制作者：${doc.meta.author || 'MarkFlow 用户'}    `, color: '666666', size: 20 }),
        new TextRun({ text: `修订时间：${new Date(doc.meta.updatedAt).toLocaleDateString('zh-CN')}`, color: '666666', size: 20 }),
      ],
      spacing: { after: 300 },
    })
  );

  let inCode = false;
  let codeLines: string[] = [];
  let inTable = false;
  let tableRowsData: string[][] = [];

  const flushTable = () => {
    if (inTable && tableRowsData.length > 0) {
      const rows = tableRowsData.map((rowCells, rIdx) => {
        const isHeader = rIdx === 0;
        return new TableRow({
          tableHeader: isHeader,
          children: rowCells.map((cellText) => {
            return new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cellText.trim(),
                      bold: isHeader,
                      size: isHeader ? 22 : 20,
                    }),
                  ],
                }),
              ],
              shading: isHeader ? { fill: 'F3F4F6' } : undefined,
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
            });
          }),
        });
      });

      docChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows,
        })
      );

      docChildren.push(new Paragraph({ spacing: { after: 150 } }));
      tableRowsData = [];
      inTable = false;
    }
  };

  const flushCode = () => {
    if (inCode && codeLines.length > 0) {
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: codeLines.join('\n'),
              font: 'Courier New',
              size: 18,
            }),
          ],
          shading: { fill: 'F8FAFC' },
          border: {
            left: { style: BorderStyle.SINGLE, size: 6, color: '0D9488' },
          },
          spacing: { before: 120, after: 120 },
        })
      );
      codeLines = [];
      inCode = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 分页符
    if (trimmed === '---pagebreak---') {
      flushTable();
      flushCode();
      docChildren.push(
        new Paragraph({
          pageBreakBefore: true,
        })
      );
      continue;
    }

    // 代码块
    if (trimmed.startsWith('```')) {
      flushTable();
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    // 表格
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      const isAlignRow = cells.every((c) => /^:?-+:?$/.test(c));
      if (!isAlignRow) {
        inTable = true;
        tableRowsData.push(cells);
      }
      continue;
    } else if (inTable) {
      flushTable();
    }

    // 独立公式 $$ ... $$
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      const latex = trimmed.slice(2, -2).trim();
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: `[公式]  ${latex}`, italics: true, color: '0F766E', bold: true }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 140, after: 140 },
        })
      );
      continue;
    }

    // 标题 #
    const headingMatch = rawLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].replace(/[*_`]/g, '').trim();
      let hLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1;
      if (level === 2) hLevel = HeadingLevel.HEADING_2;
      else if (level === 3) hLevel = HeadingLevel.HEADING_3;
      else if (level >= 4) hLevel = HeadingLevel.HEADING_4;

      docChildren.push(
        new Paragraph({
          text,
          heading: hLevel,
          spacing: { before: 240, after: 120 },
        })
      );
      continue;
    }

    // 引用块 >
    if (trimmed.startsWith('>')) {
      const quoteText = rawLine.replace(/^\s*>\s?/, '');
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: quoteText, italics: true, color: '475569' }),
          ],
          border: {
            left: { style: BorderStyle.SINGLE, size: 8, color: '0D9488' },
          },
          indent: { left: 360 },
          spacing: { before: 80, after: 80 },
        })
      );
      continue;
    }

    // 列表项
    const listMatch = rawLine.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const itemText = listMatch[3];
      docChildren.push(
        new Paragraph({
          children: [new TextRun({ text: `• ${itemText}`, size: 21 })],
          indent: { left: 400 },
          spacing: { before: 40, after: 40 },
        })
      );
      continue;
    }

    // 普通空行
    if (!trimmed) {
      continue;
    }

    // 普通段落
    docChildren.push(
      new Paragraph({
        children: [new TextRun({ text: rawLine, size: 22 })],
        spacing: { before: 80, after: 80 },
      })
    );
  }

  flushTable();
  flushCode();

  const wordDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch = 1440 dxa (~25mm)
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  return await Packer.toBlob(wordDoc);
}
