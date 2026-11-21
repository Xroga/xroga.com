import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactNativeDocumentProse, nativeDocumentDelivery, nativeDocumentPrompt, nativeDocumentRequiresAttachment, requestedNativeDocumentFormat } from './nativeDocumentDownload.js';
import { buildNativeOpenUiShare, readNativeOpenUiShare } from './nativeOpenUiShare.js';
import { completeNativeWorkspaceAnswer } from './nativeOpenUiWorkspace.js';

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
    'Create a web app with a report preview. Provide the report as a downloadable DOCX.',
    'Summarize this PDF attachment. Provide the summary as DOCX.',
    'Write a memo. Provide it as a DOCX or a PDF.',
    'Write a memo. Provide it as a DOCX. Attach it as a PDF.',
    'Write a memo without a download. Provide it as a DOCX.',
    'Write a memo. Do not provide it as a DOCX.',
  ]) assert.equal(requestedNativeDocumentFormat(prompt), undefined, prompt);
});

test('recognizes a downloadable format requested after the document content', () => {
  const memo = 'Create a one-page memo titled “Website QA Checklist” with 8 specific checks. Provide the memo as a downloadable DOCX if the artifact tool is available.';
  assert.equal(requestedNativeDocumentFormat(memo), 'docx');
  assert.equal(requestedNativeDocumentFormat('Prepare a client report about launch readiness.\nPlease attach it as a downloadable PDF.'), 'pdf');
  assert.equal(requestedNativeDocumentFormat('Draft a short project brief. Export the brief as DOCX.'), 'docx');
});

test('treats explicitly formatted named sheets, agendas and handbooks as local artifacts', () => {
  const cueSheet = 'Create a downloadable editable DOCX cue sheet for a fictional volunteer planetarium show. Use a Cues section and an Operator checkout section. Keep these exact cue names, start times and durations together: Red Beacon, 19:20, 45 seconds; Star Sweep, 19:22, 75 seconds; Final Chime, 19:25, 10 seconds. In checkout, remind the operator to review the cue order and durations before opening. No outside lookup, messages, uploads or other external action.';
  for (const [prompt, format] of [
    [cueSheet, 'docx'],
    ['Draft an agenda as PDF for the rehearsal.', 'pdf'],
    ['Create a DOCX one-page shift checklist.', 'docx'],
    ['Create a volunteer handbook. Provide the handbook as a downloadable DOCX.', 'docx'],
    ['Prepare an XLSX sign-in sheet using these fields.', 'xlsx'],
    ['Build a downloadable DOCX template editor.', undefined],
    ['Create a PDF inspection sheet generator.', undefined],
    ['Create an event agenda tool with PDF downloads.', undefined],
  ] as const) assert.equal(requestedNativeDocumentFormat(prompt), format, prompt);
  const instructions = nativeDocumentPrompt('docx');
  assert.match(instructions, /Workspace handles the local download/);
  assert.match(instructions, /Write only the document body/);
  assert.match(instructions, /without an OpenUI program/);
  assert.match(instructions, /Add derived values or extra instructions only when the user asks for them/);
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

test('document checkout preserves its instruction without reciting the whole preceding table', () => {
  const table = '| Item | Quantity |\n| --- | --- |\n| Blue tape | 2 |\n| Spring clamps | 4 |\n| Cleaning cloth | 1 |';
  const checkout = '- [ ] Confirm the packing list is complete: Blue tape, Spring clamps, Cleaning cloth.';
  const unique = '- [ ] Check the spare supplies: Blue tape, Masking tape.';
  const source = '# Packing sheet\n\n' + table + '\n\n## Checkout\n\n' + checkout + '\n' + unique;
  const prompt = 'Create an editable DOCX packing sheet with a checkout reminder.';
  const response = compactNativeDocumentProse('docx', prompt, source);
  assert.equal(response, source.replace(checkout, '- [ ] Confirm the packing list is complete.'));
  assert.equal(completeNativeWorkspaceAnswer(source, 'stop', undefined, prompt).response, response);
  assert.ok(completeNativeWorkspaceAnswer(source, 'length', undefined, prompt).response.includes(checkout));
  assert.equal(compactNativeDocumentProse('docx', `${prompt} Repeat the item names in checkout.`, source), source);
  assert.equal(compactNativeDocumentProse('xlsx', prompt, source), source);
  assert.equal(readNativeOpenUiShare(buildNativeOpenUiShare(response, '', [], 'docx')!)?.text, response);
});
