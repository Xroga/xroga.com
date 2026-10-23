import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResponseSources } from '../../components/terminal/ResponseSources.js';

test('source strip shows at most four verified links and offers a full drawer', () => {
  const sources = Array.from({ length: 6 }, (_, index) => ({ title: `Evidence ${index + 1}`, url: `https://example.com/${index + 1}`, snippet: `Context ${index + 1}` }));
  const html = renderToStaticMarkup(createElement(ResponseSources, { sources }));
  assert.match(html, /View all/);
  assert.match(html, /Evidence 4/);
  assert.doesNotMatch(html, /Evidence 5/);
  assert.equal((html.match(/xv-source-tile/g) ?? []).length, 4);
});

test('unsafe source URLs never become clickable tiles', () => {
  const html = renderToStaticMarkup(createElement(ResponseSources, { sources: [
    { title: 'Unsafe', url: 'javascript:alert(1)', snippet: '' },
    { title: 'Safe', url: 'https://example.com/article', snippet: '' },
  ] }));
  assert.doesNotMatch(html, /javascript:|Unsafe/);
  assert.match(html, /Safe/);
});
