import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePublicBody, pageOfBody } from './publicBodyText.js';

test('a body in the character set its header names is decoded, not turned into replacement characters', () => {
  const cyrillic = Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // "Привет" in windows-1251
  assert.equal(decodePublicBody(cyrillic, 'text/html; charset=windows-1251'), 'Привет');
  assert.equal(decodePublicBody(Buffer.from('héllo', 'utf8'), 'text/plain; charset=utf-8'), 'héllo');
});

test('a page that declares its character set in its own markup is decoded with it, and a plain page is UTF-8', () => {
  const head = Buffer.from('<html><head><meta charset="shift_jis"></head><body>', 'latin1');
  const page = Buffer.concat([head, Buffer.from([0x93, 0xfa, 0x96, 0x7b]), Buffer.from('</body></html>', 'latin1')]); // 日本
  assert.match(decodePublicBody(page, 'text/html'), /日本/);
  assert.equal(decodePublicBody(Buffer.from('{"a":"é"}', 'utf8'), 'application/json'), '{"a":"é"}');
});

test('a byte-order mark wins, and an unknown character set name falls back to UTF-8', () => {
  assert.equal(decodePublicBody(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('ok')]), 'text/plain; charset=latin1'), 'ok');
  assert.equal(decodePublicBody(Buffer.from('plain'), 'text/plain; charset=not-a-charset'), 'plain');
});

test('a long text is read in pages that continue from where the last one ended', () => {
  const text = 'a'.repeat(100);
  assert.deepEqual(pageOfBody(text, 0, 200), { body: text });
  const first = pageOfBody(text, 0, 40);
  assert.deepEqual({ ...first, body: first.body.length }, { body: 40, truncated: true, totalChars: 100, nextOffset: 40 });
  const last = pageOfBody(text, 80, 40);
  assert.deepEqual({ ...last, body: last.body.length }, { body: 20, truncated: true, totalChars: 100 });
  assert.equal(pageOfBody(text, 500, 40).body, '');
});
