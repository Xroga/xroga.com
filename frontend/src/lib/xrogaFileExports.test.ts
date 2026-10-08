import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import type { XrogaBlock } from './xrogaBlocks';
import { exportDocumentDocx, exportDocumentPdf, exportPresentationPptx, exportTableXlsx } from './xrogaFileExports';

type DocumentBlock = Extract<XrogaBlock, { type: 'document' }>;
type TableBlock = Extract<XrogaBlock, { type: 'spreadsheet' }>;
type PresentationBlock = Extract<XrogaBlock, { type: 'presentation' }>;

test('DOCX export is a real Word package with headings and source hyperlink', async () => {
  const block = { schemaVersion: 1, id: 'doc-1', type: 'document', content: '# Report\nA sourced finding.\n[Official source](https://example.org/report)', format: 'markdown' } as DocumentBlock;
  const file = await exportDocumentDocx(block);
  assert.match(file.filename, /\.docx$/);
  const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')?.async('string');
  const relationships = await zip.file('word/_rels/document.xml.rels')?.async('string');
  assert.match(xml ?? '', /Report/);
  assert.match(xml ?? '', /A sourced finding/);
  assert.match(relationships ?? '', /https:\/\/example.org\/report/);
});

test('PDF export creates multiple parseable pages and rejects unsupported glyphs', async () => {
  const content = '# Report\n' + Array.from({ length: 180 }, (_, index) => `Paragraph ${index + 1}: This is verified sample content for pagination.`).join('\n');
  const file = await exportDocumentPdf({ schemaVersion: 1, id: 'pdf-1', type: 'document', content, format: 'markdown' } as DocumentBlock);
  assert.match(file.filename, /\.pdf$/);
  const parsed = await PDFDocument.load(await file.blob.arrayBuffer());
  assert.ok(parsed.getPageCount() >= 2);
  await assert.rejects(() => exportDocumentPdf({ schemaVersion: 1, id: 'pdf-2', type: 'document', content: 'مرحبا', format: 'text' } as DocumentBlock), /Latin text only/);
});

test('XLSX export retains typed cells without executing model-supplied formulas', async () => {
  const block = { schemaVersion: 1, id: 'sheet-1', type: 'spreadsheet', columns: [{ key: 'item', label: 'Item' }, { key: 'cost', label: 'Cost', type: 'number' }], rows: [{ item: '=HYPERLINK("https://evil.example")', cost: 25 }], formulas: { cost: 'SUM(B2:B2)' } } as TableBlock;
  const file = await exportTableXlsx(block);
  const workbook = new ExcelJS.Workbook();
  const workbookBytes = Buffer.from(await file.blob.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookBytes);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet?.getCell('A2').value, '=HYPERLINK("https://evil.example")');
  assert.equal(sheet?.getCell('B2').value, 25);
  assert.equal(sheet?.getCell('B2').type, ExcelJS.ValueType.Number);
});

test('PPTX export contains every requested slide and visible slide text', async () => {
  const block = { schemaVersion: 1, id: 'deck-1', type: 'presentation', slides: [
    { id: 's1', title: 'Introduction', body: 'Project goals' },
    { id: 's2', title: 'Results', bullets: ['Passed tests', 'Ready to review'] },
  ] } as PresentationBlock;
  const file = await exportPresentationPptx(block);
  assert.match(file.filename, /\.pptx$/);
  const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
  assert.ok(zip.file('ppt/slides/slide1.xml'));
  assert.ok(zip.file('ppt/slides/slide2.xml'));
  assert.match(await zip.file('ppt/slides/slide2.xml')!.async('string'), /Results/);
});
