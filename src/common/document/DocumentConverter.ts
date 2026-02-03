/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Document Converter - Markdown Centric
 *
 * Core concept: All editable documents are converted to Markdown for unified editing
 * Word/Excel -> Markdown -> Edit -> Word/Excel/PDF
 */
export class DocumentConverter {
  /**
   * Word -> Markdown
   * Uses mammoth + turndown
   */
  async wordToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
    // Dynamic import to reduce initial load
    const mammoth = await import('mammoth');
    const TurndownService = (await import('turndown')).default;
    const { gfm } = await import('turndown-plugin-gfm');

    // 1. Word -> HTML
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value;

    // 2. HTML -> Markdown
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    turndown.use(gfm); // Support GitHub Flavored Markdown (tables, etc.)

    const markdown = turndown.turndown(html);

    return markdown;
  }

  /**
   * Markdown -> Word
   * Uses docx library to convert Markdown to Word document
   */
  async markdownToWord(markdown: string): Promise<ArrayBuffer> {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

    // Simple implementation: convert Markdown paragraphs to Word paragraphs
    // A more complex implementation could parse Markdown AST
    const lines = markdown.split('\n');
    const paragraphs = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(2),
            heading: HeadingLevel.HEADING_1,
          })
        );
      } else if (line.startsWith('## ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(3),
            heading: HeadingLevel.HEADING_2,
          })
        );
      } else if (line.startsWith('### ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(4),
            heading: HeadingLevel.HEADING_3,
          })
        );
      } else if (line.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun(line)],
          })
        );
      } else {
        // Empty line
        paragraphs.push(new Paragraph({ text: '' }));
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    // Convert Buffer to ArrayBuffer
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }

  /**
   * Excel -> Markdown (tables)
   * Uses SheetJS
   */
  async excelToMarkdown(arrayBuffer: ArrayBuffer): Promise<string> {
    const XLSX = await import('xlsx-republish');

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    let markdown = '';

    workbook.SheetNames.forEach((sheetName) => {
      // Add title when there are multiple sheets
      if (workbook.SheetNames.length > 1) {
        markdown += `## ${sheetName}\n\n`;
      }

      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (data.length === 0) return;

      // Headers
      const headers = data[0].map((cell: any) => String(cell || ''));
      markdown += `| ${headers.join(' | ')} |\n`;
      markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

      // Data rows
      for (let i = 1; i < data.length; i++) {
        const row = data[i].map((cell: any) => String(cell || ''));
        // Pad columns to match header count
        while (row.length < headers.length) {
          row.push('');
        }
        markdown += `| ${row.join(' | ')} |\n`;
      }

      markdown += '\n';
    });

    return markdown;
  }

  /**
   * Markdown -> Excel
   * Parse Markdown tables and convert to Excel
   */
  async markdownToExcel(markdown: string): Promise<ArrayBuffer> {
    const XLSX = await import('xlsx-republish');

    const workbook = XLSX.utils.book_new();
    const sheets = this.parseMarkdownTables(markdown);

    sheets.forEach((sheet, index) => {
      const sheetName = sheet.name || `Sheet${index + 1}`;
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const uint8Array = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    // Convert Uint8Array to ArrayBuffer
    return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
  }

  /**
   * Parse Markdown tables
   */
  private parseMarkdownTables(markdown: string): Array<{ name: string; data: any[][] }> {
    const sheets: Array<{ name: string; data: any[][] }> = [];
    const lines = markdown.split('\n');

    let currentSheet: { name: string; data: any[][] } | null = null;
    let currentTable: any[][] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect sheet title (## SheetName)
      if (line.startsWith('## ')) {
        // Save previous sheet
        if (currentSheet && currentTable.length > 0) {
          currentSheet.data = currentTable;
          sheets.push(currentSheet);
        }

        // Create new sheet
        currentSheet = {
          name: line.substring(3).trim(),
          data: [],
        };
        currentTable = [];
        continue;
      }

      // Detect table row
      if (line.startsWith('|')) {
        const cells = line
          .split('|')
          .filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1)
          .map((cell) => cell.trim());

        // Skip separator row (|---|---|)
        if (cells.every((cell) => /^-+$/.test(cell))) {
          continue;
        }

        currentTable.push(cells);
      } else if (currentTable.length > 0) {
        // Table ended
        if (currentSheet) {
          currentSheet.data = currentTable;
          sheets.push(currentSheet);
          currentSheet = null;
        } else {
          sheets.push({ name: `Sheet${sheets.length + 1}`, data: currentTable });
        }
        currentTable = [];
      }
    }

    // Save the last table
    if (currentTable.length > 0) {
      if (currentSheet) {
        currentSheet.data = currentTable;
        sheets.push(currentSheet);
      } else {
        sheets.push({ name: `Sheet${sheets.length + 1}`, data: currentTable });
      }
    }

    return sheets;
  }
}

export const documentConverter = new DocumentConverter();
