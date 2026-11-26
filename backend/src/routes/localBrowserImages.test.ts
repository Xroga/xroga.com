import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';

process.env.XROGA_LOCAL_BROWSER_ENABLED = 'false';

function png(width: number, height: number): string {
  const crc = (buffer: Buffer) => {
    let c = ~0;
    for (const byte of buffer) {
      c ^= byte;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

const withImage = (url: string) => [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url } }] }];

test('a real PNG is accepted for an image-capable model and replaced by a placeholder for the secret and size checks', async () => {
  const { vetTurnImages } = await import('./localBrowser.js');
  const result = vetTurnImages(withImage(png(64, 48)), true);
  assert.equal(result.images, 1);
  assert.match(JSON.stringify(result.textOnly), /\[image\]/);
  assert.doesNotMatch(JSON.stringify(result.textOnly), /base64/);
});

test('images are refused for a model whose spec does not accept them, and plain text is untouched', async () => {
  const { vetTurnImages } = await import('./localBrowser.js');
  assert.throws(() => vetTurnImages(withImage(png(8, 8)), false), (error: { code?: string }) => error.code === 'BROWSER_IMAGES_NOT_SUPPORTED');
  const text = [{ role: 'user', content: 'hello' }];
  assert.deepEqual(vetTurnImages(text, false), { textOnly: text, images: 0 });
});

test('a non-PNG, an oversized or a four-image turn is refused', async () => {
  const { vetTurnImages } = await import('./localBrowser.js');
  const notPng = `data:image/png;base64,${Buffer.from('this is not a png image at all, just text bytes').toString('base64')}`;
  assert.throws(() => vetTurnImages(withImage(notPng), true), (error: { code?: string }) => error.code === 'BROWSER_IMAGE_INVALID');
  assert.throws(() => vetTurnImages(withImage(png(5000, 10)), true), (error: { code?: string }) => error.code === 'BROWSER_IMAGE_INVALID');
  const one = png(16, 16);
  const four = [{ role: 'user', content: [1, 2, 3, 4].map(() => ({ type: 'image_url', image_url: { url: one } })) }];
  assert.throws(() => vetTurnImages(four, true), (error: { code?: string }) => error.code === 'BROWSER_IMAGES_TOO_MANY');
});
