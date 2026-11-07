import test from 'node:test';
import assert from 'node:assert/strict';
import {isIconDomain,sniffRasterImage,ICON_HOST} from './siteIcon';

test('only a plain public hostname can be requested, so a caller never picks where the server connects', () => {
  for (const ok of ['nextjs.org', 'www.kayak.com', 'docs.github.com', 'a-b.co.uk']) assert.equal(isIconDomain(ok), true, ok);
  for (const bad of ['', 'localhost', '127.0.0.1', '10.0.0.1', '[::1]', 'evil.com/../x', 'evil.com:8080', 'user@evil.com', 'evil.com?x=1', 'a b.com', '-bad.com', 'x.c', 'x'.repeat(300) + '.com'])
    assert.equal(isIconDomain(bad), false, bad);
  assert.equal(ICON_HOST, 'https://cdn.deepseek.com/site-icons/');
});

test('an icon is accepted only when its bytes are a small raster image, never SVG or HTML', () => {
  assert.equal(sniffRasterImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), 'image/png');
  assert.equal(sniffRasterImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffRasterImage(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39])), 'image/gif');
  assert.equal(sniffRasterImage(Uint8Array.from([0x00, 0x00, 0x01, 0x00, 0x01])), 'image/x-icon');
  assert.equal(sniffRasterImage(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'image/webp');
  assert.equal(sniffRasterImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>')), null);
  assert.equal(sniffRasterImage(new TextEncoder().encode('<!doctype html><html>')), null);
  assert.equal(sniffRasterImage(new Uint8Array()), null);
});
