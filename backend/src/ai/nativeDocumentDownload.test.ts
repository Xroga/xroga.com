import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeDocumentRequiresAttachment, requestedNativeDocumentFormat } from './nativeDocumentDownload.js';

test('recognizes direct DOCX and PDF document deliverables', () => {
  assert.equal(requestedNativeDocumentFormat('Create a PDF executive report from this attached dataset.'), 'pdf');
  assert.equal(requestedNativeDocumentFormat('Create a DOCX proposal with editable sections.'), 'docx');
  assert.equal(requestedNativeDocumentFormat('Could you write an executive summary as a PDF?'), 'pdf');
  assert.equal(requestedNativeDocumentFormat('Please export this as DOCX.'), 'docx');
  assert.equal(nativeDocumentRequiresAttachment('Create a PDF executive report from this attached dataset.'), true);
});

test('does not turn file mentions, other formats, or negated requests into an export', () => {
  for (const prompt of [
    'What is a PDF report?',
    'Do not create a PDF. Show the report here.',
    'Create a PDF report, but do not export a file.',
    'Create a PDF report without a download.',
    'Create a PDF report. No file needed.',
    'Summarize this PDF attachment in chat.',
    'Build a PDF parser.',
    'Create a web app with PDF report export.',
    'Export as XLSX.',
    'Create a report as PDF or DOCX.',
    'Write a message saying “create a PDF report”.',
  ]) assert.equal(requestedNativeDocumentFormat(prompt), undefined, prompt);
});
