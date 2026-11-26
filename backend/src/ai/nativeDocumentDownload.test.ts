import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactNativeDocumentProse, nativeDocumentDelivery, nativeDocumentPrompt, nativeDocumentRequiresAttachment, nativeDocumentRequiresPriorAnswer, plannedNativeDocument, requestedNativeDocumentFormat } from './nativeDocumentDownload.js';

test('plain-text downloads require an actual file request and use the existing delivery contract', () => {
  for (const prompt of [
    'Make a downloadable plain-text UTF-8 shift brief for an inspection crew.',
    'Create a TXT inventory report with the original names.',
    'Write a fictional postmortem with a timeline. Export as downloadable plain-text UTF-8.',
    'Export this as a plain text file.',
  ]) assert.equal(requestedNativeDocumentFormat(prompt), 'txt', prompt);
  for (const prompt of [
    'Write a short plain text brief for an inspection crew.',
    'Explain how to make a TXT report.',
    'Build a downloadable plain-text editor.',
    'Make a downloadable plain-text brief. Export the brief as PDF.',
    'Create a TXT report or DOCX report.',
    'Make a downloadable plain-text brief, but do not create a file.',
  ]) assert.equal(requestedNativeDocumentFormat(prompt), undefined, prompt);
  assert.deepEqual(nativeDocumentDelivery('txt', false, 'Make a TXT brief', '# Café\n\nRésumé / خطة',
    { status: 'complete' }), { completion: { status: 'complete' }, downloadFormat: 'txt' });
  assert.match(nativeDocumentPrompt('txt'), /Unicode characters and line breaks/);
});

test('recognizes a named document followed by a description of its contents', () => {
  assert.equal(requestedNativeDocumentFormat('Create a downloadable XLSX budget showing typed numeric values and text IDs.'), 'xlsx');
  assert.equal(requestedNativeDocumentFormat('Draft an editable DOCX handbook covering volunteer onboarding.'), 'docx');
  assert.equal(requestedNativeDocumentFormat('Build an XLSX budgeting app showing current team targets.'), undefined);
});
import { buildNativeOpenUiShare, readNativeOpenUiShare } from './nativeOpenUiShare.js';
import { completeNativeWorkspaceAnswer } from './nativeOpenUiWorkspace.js';
import { answerObligationsSchema, type AnswerObligations } from './responsePresentation.js';

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

test('requires the referenced prior answer for a contextual export', () => {
  const prompt = 'Put the above into an editable .docx.';
  assert.equal(requestedNativeDocumentFormat(prompt), 'docx');
  assert.equal(nativeDocumentRequiresPriorAnswer(prompt), true);
  assert.equal(requestedNativeDocumentFormat('Turn your last report into a printable PDF.'), 'pdf');
  assert.equal(requestedNativeDocumentFormat('Put the previous answer into a DOCX, but do not create a file.'), undefined);
  assert.equal(nativeDocumentRequiresPriorAnswer('Make a DOCX report about earlier project decisions.'), false);
  assert.deepEqual(nativeDocumentDelivery('docx', true, prompt, 'Paste the content to export.', { status: 'complete' }),
    { completion: { status: 'partial', reason: 'presentation_contract' } });
});

test('existing model obligations identify multilingual downloads with a literal supported format', () => {
  const formatRequest = (sourceQuote: string, format: 'docx' | 'pdf', source: 'prompt' | 'conversation' = 'prompt'): AnswerObligations[0] => ({
    id: 'document', origin: 'requested', description: 'Editable download requested in chat', formats: ['prose'],
    sourceQuote, download: { format, source },
  });
  const arabic = 'أنشئ مستند DOCX قابل للتحرير لخطة الاجتماع';
  const french = 'Transformez le compte rendu ci-dessus en PDF téléchargeable';
  assert.equal(requestedNativeDocumentFormat(arabic), undefined);
  assert.deepEqual(plannedNativeDocument(arabic, answerObligationsSchema.parse([formatRequest(arabic, 'docx')])), { format: 'docx', source: 'prompt' });
  assert.deepEqual(plannedNativeDocument(french, [formatRequest(french, 'pdf', 'conversation')]), { format: 'pdf', source: 'conversation' });
  assert.equal(plannedNativeDocument(arabic, [formatRequest(arabic, 'pdf')]), undefined);
  assert.equal(plannedNativeDocument(arabic, [formatRequest('Make a DOCX', 'docx')]), undefined);
  assert.equal(plannedNativeDocument(arabic, [{ ...formatRequest(arabic, 'docx'), origin: 'necessary-support' }]), undefined);
  assert.equal(plannedNativeDocument(arabic + '. Do not create a file.', [formatRequest(arabic, 'docx')]), undefined);
  const twoFormats = 'Create a DOCX or PDF';
  assert.equal(plannedNativeDocument(twoFormats, [formatRequest(twoFormats, 'docx')]), undefined);
  assert.equal(plannedNativeDocument(french + '. ' + arabic,
    [formatRequest(arabic, 'docx'), { ...formatRequest(french, 'pdf'), id: 'pdf-document' }]), undefined);
});

test('concise file deliverables keep their format without an opening verb', () => {
  for (const [prompt, format] of [
    ['Downloadable DOCX kickoff agenda, 5 items and 2-column checklist.', 'docx'],
    ['One-page PDF inspection checklist, eight checks.', 'pdf'],
    ['XLSX budget inputs 120,250,80 and formula total.', 'xlsx'],
    ['Three-slide PPTX internal weekly status: two wins, one risk.', 'pptx'],
    ['Printable PDF shift handover guide.', 'pdf'],
    ['Editable DOCX viewer for internal training, with accessibility controls.', undefined],
    ['XLSX budgets are useful.', undefined],
    ['One-page PDF inspection checklist, no file needed.', undefined],
    ['One-page PDF checklist or DOCX.', undefined],
  ] as const) assert.equal(requestedNativeDocumentFormat(prompt), format, prompt);
  assert.match(nativeDocumentPrompt('xlsx', false, 'XLSX budget inputs 120,250,80 and formula total.'), /Include the requested calculations/);
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
  assert.deepEqual(nativeDocumentDelivery('pptx', true, '', pptx, complete),
    { completion: { status: 'partial', reason: 'presentation_contract' } });
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

test('a long source body cannot hide a direct document request or a later refusal', () => {
  const source = 'Service status and project results.\n'.repeat(1_100);
  const prompt = 'Create a downloadable editable DOCX report using these facts:\n' + source;
  assert.equal(requestedNativeDocumentFormat(prompt), 'docx');
  assert.equal(requestedNativeDocumentFormat(prompt + '\nDo not attach a DOCX.'), undefined);
  assert.equal(requestedNativeDocumentFormat('Draft a project report with this input:\n' + source
    + '\nExport it as a downloadable PDF.'), 'pdf');
  assert.equal(requestedNativeDocumentFormat('Draft a project report with this input:\n' + source
    + '\nThe moderator said to export it as a downloadable PDF.'), undefined);
});
