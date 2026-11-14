import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(__filename);
nodeRequire.extensions['.css'] = (module) => {
  const classNames = new Proxy({}, { get: (_target, key) => String(key) });
  module.exports = { __esModule: true, default: classNames };
};
const { ResponseSources } = nodeRequire('../../components/terminal/ResponseSources.tsx') as typeof import('../../components/terminal/ResponseSources');

test('source strip shows each distinct destination with a meaningful fallback and no drawer', () => {
  const sources = Array.from({ length: 6 }, (_, index) => ({ title: `Evidence ${index + 1}`, url: `https://example.com/${index + 1}`, snippet: `Context ${index + 1}` }));
  const html = renderToStaticMarkup(createElement(ResponseSources, {
    sources: [...sources, sources[0], { title: 'Source 7', url: 'https://example.com/reference', snippet: '' }],
  }));
  assert.match(html, /Evidence 6/);
  assert.match(html, /Open source: example\.com\/reference/);
  assert.equal((html.match(/aria-label="Open source:/g) ?? []).length, 7);
  assert.doesNotMatch(html, /View all|Source 7/);
});

test('unsafe source URLs never become clickable tiles', () => {
  const html = renderToStaticMarkup(createElement(ResponseSources, { sources: [
    { title: 'Unsafe', url: 'javascript:alert(1)', snippet: '' },
    { title: 'Safe', url: 'https://example.com/article', snippet: '' },
  ] }));
  assert.doesNotMatch(html, /javascript:|Unsafe/);
  assert.match(html, /Safe/);
});
