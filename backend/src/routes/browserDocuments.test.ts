import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { readBrowserDocument } from './browserDocuments.js';

test('browser document ingestion preserves page, sheet and cell references and refuses oversized archives', async () => {
  const document = await PDFDocument.create();
  document.addPage().drawText('Fixture order number XROGA 31');
  document.addPage().drawText('Fixture order number XROGA 82');
  const text = await readBrowserDocument('order.pdf', Buffer.from(await document.save({ useObjectStreams: false })));
  assert.match(text, /\[Page 1\][\s\S]*XROGA 31[\s\S]*\[Page 2\][\s\S]*XROGA 82/);

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Order lines');
  sheet.getCell('A1').value = 'Orion';
  sheet.getCell('B3').value = { formula: '41+41', result: 82 };
  sheet.getCell('C3').value = { formula: '41+41' };
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  const rows = await readBrowserDocument('order.xlsx', bytes);
  assert.match(rows, /\[Sheet: Order lines\][\s\S]*A1="Orion"[\s\S]*B3="82"[\s\S]*C3="\[formula has no cached result\]"/);

  const damaged = Buffer.from(bytes);
  const directory = damaged.readUInt32LE(damaged.length - 22 + 16);
  damaged.writeUInt32LE(40 * 1024 * 1024, directory + 24);
  await assert.rejects(readBrowserDocument('oversized.xlsx', damaged), /Unsafe Office entry/);
  await assert.rejects(readBrowserDocument('wrong.pdf', bytes), /Invalid PDF/);
});

test('a PDF table keeps its rows and columns, a long PDF is read as far as the limits allow, and unreadable files say why', async () => {
  const table = await PDFDocument.create();
  const page = table.addPage();
  const rows = [['Name', 'Email', 'City'], ['Ali Khan', 'ali@example.com', 'Lahore'], ['Sara Noor', 'sara@example.com', 'Karachi']];
  rows.forEach((row, r) => row.forEach((cell, c) => page.drawText(cell, { x: 40 + c * 170, y: 700 - r * 22, size: 11 })));
  const text = await readBrowserDocument('table.pdf', Buffer.from(await table.save({ useObjectStreams: false })));
  assert.match(text, /Name\tEmail\tCity\nAli Khan\tali@example\.com\tLahore\nSara Noor\tsara@example\.com\tKarachi/);

  const long = await PDFDocument.create();
  for (let i = 1; i <= 450; i++) long.addPage().drawText(`page ${i}`);
  const partial = await readBrowserDocument('long.pdf', Buffer.from(await long.save({ useObjectStreams: false })));
  assert.match(partial, /\[Page 400\]\npage 400/);
  assert.match(partial, /\[Stopped after page 400 of 450: the page limit was reached\]/);
  assert.doesNotMatch(partial, /\[Page 401\]/);

  const blank = await PDFDocument.create();
  blank.addPage();
  await assert.rejects(readBrowserDocument('blank.pdf', Buffer.from(await blank.save({ useObjectStreams: false }))), (error: unknown) => (error as { reason?: string }).reason === 'no_text');
  await assert.rejects(readBrowserDocument('wrong.pdf', Buffer.from('not a pdf')), (error: unknown) => (error as { reason?: string }).reason === 'invalid');
  await assert.rejects(readBrowserDocument('broken.pdf', Buffer.from('%PDF-1.4 broken')), (error: unknown) => (error as { reason?: string }).reason === 'invalid');
});
