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
