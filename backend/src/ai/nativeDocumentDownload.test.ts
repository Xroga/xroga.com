import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeDocumentDelivery, nativeDocumentRequiresAttachment, requestedNativeDocumentFormat } from './nativeDocumentDownload.js';
import { buildNativeOpenUiShare, readNativeOpenUiShare } from './nativeOpenUiShare.js';

test('recognizes direct Office and PDF deliverables', () => {
  assert.equal(requestedNativeDocumentFormat('Create a PDF executive report from this attached dataset.'), 'pdf');
  assert.equal(requestedNativeDocumentFormat('Create a DOCX proposal with editable sections.'), 'docx');
  assert.equal(requestedNativeDocumentFormat('Could you write an executive summary as a PDF?'), 'pdf');
  assert.equal(requestedNativeDocumentFormat('Please export this as DOCX.'), 'docx');
  assert.equal(requestedNativeDocumentFormat('Create an XLSX budget spreadsheet with formulas.'), 'xlsx');
  assert.equal(requestedNativeDocumentFormat('Create a professional PPTX slide deck from these supplied notes.'), 'pptx');
  assert.equal(requestedNativeDocumentFormat('Prepare a PowerPoint slide deck for the planning meeting.'), 'pptx');
  assert.equal(requestedNativeDocumentFormat('Export as XLSX.'), 'xlsx');
  assert.equal(nativeDocumentRequiresAttachment('Create a PDF executive report from this attached dataset.'), true);
});

test('does not turn file mentions, other formats, or negated requests into an export', () => {
  for (const prompt of [
    'What is a PDF report?',
    'Write a word.',
    'Write the summary as a word.',
    'Do not create a PDF. Show the report here.',
    'Create a PDF report, but do not export a file.',
    'Create a PDF report without a download.',
    'Create a PDF report. No file needed.',
    'Summarize this PDF attachment in chat.',
    'Build a PDF parser.',
    'Create a web app with PDF report export.',
    'Build an XLSX viewer.',
    'Create an app with a PPTX export button.',
    'Create a PDF report or an Excel spreadsheet.',
    'Create a report as PDF or DOCX.',
    'Write a message saying “create a PDF report”.',
  ]) assert.equal(requestedNativeDocumentFormat(prompt), undefined, prompt);
});

test('withholds incomplete artifacts and preserves a validated local download in an authorized share projection', () => {
  const workbook = '# Budget\n\n| Item | Cost |\n| --- | --- |\n| Hosting | 25 |\n| Total | |\n\n## Formulas\n- B3: =SUM(B2:B2)';
  const pptx = '# Project\n\n## Results\n- Completed review.';
  const complete = { status: 'complete' as const };
  const xlsxPrompt = 'Create an XLSX budget spreadsheet with formulas.';
  const requested = nativeDocumentDelivery('xlsx', false, xlsxPrompt, workbook, complete);
  assert.deepEqual(requested, { completion: complete, downloadFormat: 'xlsx' });
  for (const unsafe of [
    workbook.replace('SUM(B2:B2)', 'WEBSERVICE("https://wrong.example")'),
    workbook.replace('SUM(B2:B2)', '[elsewhere.xlsx]Sheet1!B2'),
    workbook.replace('SUM(B2:B2)', 'B3+1'),
    workbook.replace('SUM(B2:B2)', 'B2/0'),
    workbook.replace('SUM(B2:B2)', 'B2+A99'),
    workbook.replace('SUM(B2:B2)', '1 2+1'),
    workbook.replace('Total | |', 'Total | 40 |'),
    workbook.split('## Formulas')[0]!,
  ]) assert.deepEqual(nativeDocumentDelivery('xlsx', false, xlsxPrompt, unsafe, complete),
    { completion: { status: 'partial', reason: 'presentation_contract' } }, unsafe);
  assert.deepEqual(nativeDocumentDelivery('pptx', false, '', 'The requested deck is ready.', complete),
    { completion: { status: 'partial', reason: 'presentation_contract' } });
  assert.deepEqual(nativeDocumentDelivery('pptx', true, '', pptx, complete), { completion: complete });
  const shared = buildNativeOpenUiShare(pptx, '', [], 'pptx');
  assert.ok(shared);
  assert.equal(readNativeOpenUiShare(shared)?.documentDownload, 'pptx');
  assert.equal(readNativeOpenUiShare(shared)?.text, pptx);
  assert.equal(buildNativeOpenUiShare('No table here.', '', [], 'xlsx'), undefined);
  assert.equal(readNativeOpenUiShare(buildNativeOpenUiShare('The answer stays readable.', 'root = Col([Text("Sample")])', [], 'xlsx')!)?.documentDownload, undefined);
});
