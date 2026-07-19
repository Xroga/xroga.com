import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deflateRawSync } from 'zlib';

// Re-test DOCX path via prepareAttachments by crafting a tiny zip with word/document.xml
import { prepareAttachments } from './attachments.js';

function buildMinimalDocxZip(xml: string): Buffer {
  const name = Buffer.from('word/document.xml');
  const data = deflateRawSync(Buffer.from(xml, 'utf8'));
  const local = Buffer.alloc(30 + name.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(0, 14); // crc
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(Buffer.byteLength(xml), 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  name.copy(local, 30);
  return Buffer.concat([local, data]);
}

describe('DOCX attachment extract', () => {
  it('extracts w:t text from a deflated document.xml entry', async () => {
    const xml =
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from DOCX</w:t></w:r></w:p></w:body></w:document>';
    const zip = buildMinimalDocxZip(xml);
    const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${zip.toString('base64')}`;
    const prepared = await prepareAttachments([
      {
        url: dataUrl,
        name: 'brief.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ]);
    assert.equal(prepared.hasDocuments, true);
    assert.match(prepared.documents[0].text, /Hello from DOCX/);
  });
});
