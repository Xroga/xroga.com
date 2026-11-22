import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, StandardFonts } from 'pdf-lib';
import type { XrogaBlock } from './xrogaBlocks';
import { exportAnswerFile, exportDocumentDocx, exportDocumentPdf, exportPresentationPptx, exportTableXlsx, PdfUnsupportedCharactersError } from './xrogaFileExports';

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

test('requested DOCX keeps an unverified link label readable without making it clickable', async () => {
  const block: DocumentBlock = { schemaVersion: 1, id: 'requested-doc', type: 'document', format: 'markdown',
    content: '# Proposal\n[Verified](https://example.org/official) and [Unverified](https://bad.example/claim)' };
  const file = await exportDocumentDocx(block, new Set(['https://example.org/official']));
  const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
  assert.match(await zip.file('word/document.xml')!.async('string'), /Unverified/);
  const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
  assert.match(relationships, /https:\/\/example.org\/official/);
  assert.doesNotMatch(relationships, /bad\.example/);
});

test('DOCX renders Markdown data as a Word table with accessible row grouping and verified links', async () => {
  const report = [
    '# Release checks', '', '| Check | Evidence |', '| --- | --- |',
    '| Navigation | [Verified](https://example.org/official) |',
    '| Forms | [Unverified](https://bad.example/claim) |', '', 'Keep the reviewed evidence.',
  ].join('\n');
  const download = await exportAnswerFile(report, 'docx', new Set(['https://example.org/official']));
  const zip = await JSZip.loadAsync(await download.blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
  assert.equal(download.filename, 'Release-checks.docx');
  assert.equal((xml.match(/<w:tr(?:\s|>)/g) ?? []).length, 3);
  assert.match(xml, /<w:tblHeader\b/);
  assert.match(xml, /<w:tbl>[\s\S]*Navigation[\s\S]*Forms[\s\S]*Unverified[\s\S]*<\/w:tbl>[\s\S]*Keep the reviewed evidence/);
  assert.doesNotMatch(xml, /\| Check \| Evidence \||\| --- \|/);
  assert.match(relationships, /https:\/\/example\.org\/official/);
  assert.doesNotMatch(relationships, /bad\.example/);
});

test('DOCX preserves mixed-language text, marks RTL paragraphs and keeps a Unicode filename', async () => {
  const content = '# تقرير الإطلاق\n\nThe time is 14:30 UTC.\n\n- الموعد ١٤:٣٠ UTC\n\n| الحالة | Ref |\n| --- | --- |\n| جاهز | AX-07 |';
  const file = await exportAnswerFile(content, 'docx', new Set());
  assert.equal(file.filename, 'تقرير-الإطلاق.docx');
  const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const paragraphs = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? [];
  for (const phrase of ['تقرير الإطلاق', 'الموعد ١٤:٣٠ UTC', 'جاهز']) {
    const paragraph = paragraphs.find(item => item.includes(phrase));
    assert.ok(paragraph, phrase);
    assert.match(paragraph, /<w:bidi(?:\/|>)/);
  }
  const english = paragraphs.find(item => item.includes('The time is 14:30 UTC.'));
  assert.ok(english);
  assert.doesNotMatch(english, /<w:bidi(?:\/|>)/);
});

test('PDF export creates multiple parseable pages and rejects unsupported glyphs', async () => {
  const content = '# Report\n' + Array.from({ length: 180 }, (_, index) => `Paragraph ${index + 1}: This is verified sample content for pagination.`).join('\n');
  const file = await exportDocumentPdf({ schemaVersion: 1, id: 'pdf-1', type: 'document', content, format: 'markdown' } as DocumentBlock);
  assert.match(file.filename, /\.pdf$/);
  const parsed = await PDFDocument.load(await file.blob.arrayBuffer());
  assert.ok(parsed.getPageCount() >= 2);
  await assert.rejects(() => exportDocumentPdf({ schemaVersion: 1, id: 'pdf-2', type: 'document', content: 'مرحبا', format: 'text' } as DocumentBlock), PdfUnsupportedCharactersError);
  const latin = await exportAnswerFile('# Résumé\n\nCafé — €25.', 'pdf', new Set());
  assert.equal((await PDFDocument.load(await latin.blob.arrayBuffer())).getTitle(), 'Résumé');
});

test('PDF export wraps verified long URLs and keeps unsupported destinations out of the file', async () => {
  const token = 'https://example.com/path/' + 'original-identifier-'.repeat(15) + 'finish';
  const download = await exportAnswerFile('Official: [source](' + token + ')\n[Unverified label](https://bad.example/claim)', 'pdf', new Set([token]));
  const pdf = await PDFDocument.load(await download.blob.arrayBuffer());
  const page = pdf.getPage(0);
  const contents = page.node.Contents();
  assert.ok(contents instanceof PDFArray);
  const operators = contents.asArray().map(ref => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref, PDFRawStream)).decode()).toString()).join('\n');
  const lines = [...operators.matchAll(/<([0-9a-f]+)> Tj/gi)].map(match => Buffer.from(match[1]!, 'hex').toString('ascii'));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  assert.ok(lines.length > 1);
  const extracted = lines.join('');
  assert.ok(extracted.includes(token), 'every character in the verified URL is retained');
  assert.match(extracted, /Unverified label/);
  assert.doesNotMatch(extracted, /bad\.example/);
  assert.ok(lines.every(line => font.widthOfTextAtSize(line, 10.5) <= page.getWidth() - 96));
});

test('native Office requests create real slide and formula content', async () => {
  const xlsx = await exportAnswerFile([
    '# Budget', '| Item | Units | Price | Total |', '| --- | --- | --- | --- |',
    '| =1+1 | 2 | 25 | |', '| Workshops | 3 | 30 | |', '| Sum | | | |',
    '', '## Formulas', '- D2: =B2*C2', '- D3: =B3*C3', '- D4: =SUM(D2:D3)',
  ].join('\n'), 'xlsx', new Set());
  assert.equal(xlsx.filename, 'Budget.xlsx');
  assert.equal(xlsx.blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const workbook = new ExcelJS.Workbook();
  const workbookBytes = Buffer.from(await xlsx.blob.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookBytes);
  const sheet = workbook.worksheets[0]!;
  assert.equal(sheet.getCell('A2').value, '=1+1');
  assert.deepEqual(sheet.getCell('D2').value, { formula: 'B2*C2', result: 50 });
  assert.deepEqual(sheet.getCell('D4').value, { formula: 'SUM(D2:D3)', result: 140 });
  const pptx = await exportAnswerFile('# Planning\n\n## Introduction\nProject goals\n\n## Results\n- 90-minute workshop', 'pptx', new Set());
  assert.equal(pptx.filename, 'Planning.pptx');
  assert.equal(pptx.blob.type, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  const zip = await JSZip.loadAsync(await pptx.blob.arrayBuffer());
  assert.match(await zip.file('ppt/slides/slide1.xml')!.async('string'), /Project goals/);
  assert.match(await zip.file('ppt/slides/slide2.xml')!.async('string'), /90-minute workshop/);
  await assert.rejects(() => exportAnswerFile('# Talking points only', 'pptx', new Set()), /no complete slide deck/);
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

test('native XLSX keeps decimal amounts numeric and long or zero-padded IDs literal', async () => {
  const file = await exportAnswerFile([
    '# Fees', '', '| ID | Fee |', '| --- | --- |', '| 0012 | 10.00 |', '| 1234567890123456 | -2.50 |',
    '| Total | |', '', '## Formulas', '- B4: =SUM(B2:B3)',
  ].join('\n'), 'xlsx', new Set());
  const workbook = new ExcelJS.Workbook();
  const bytes = Buffer.from(await file.blob.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('A2').value, '0012');
  assert.equal(sheet.getCell('A3').value, '1234567890123456');
  assert.equal(sheet.getCell('B2').value, 10);
  assert.equal(sheet.getCell('B3').value, -2.5);
  assert.deepEqual(sheet.getCell('B4').value, { formula: 'SUM(B2:B3)', result: 7.5 });
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

test('PPTX keeps Arabic and Latin slide text editable and direction-specific', async () => {
  const file = await exportAnswerFile('# خطة المشروع\n\n## المرحلة الأولى\nتأكيد الموعد ١٤:٣٠ UTC\n\n## English notes\nKeep reference AX-07.', 'pptx', new Set());
  assert.equal(file.filename, 'خطة-المشروع.pptx');
  const zip = await JSZip.loadAsync(await file.blob.arrayBuffer());
  const rtl = await zip.file('ppt/slides/slide1.xml')!.async('string');
  const ltr = await zip.file('ppt/slides/slide2.xml')!.async('string');
  assert.match(rtl, /<a:pPr[^>]*rtl="1"/);
  assert.match(rtl, /<a:t>تأكيد الموعد ١٤:٣٠ UTC<\/a:t>/);
  assert.match(ltr, /<a:t>Keep reference AX-07\.<\/a:t>/);
  assert.doesNotMatch(ltr, /<a:pPr[^>]*rtl="1"/);
});
