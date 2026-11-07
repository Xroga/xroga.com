import test from 'node:test';
import assert from 'node:assert/strict';
import { remarkCitationsV2, sourceKeyV2, sourceRegistryV2 } from './sourceRegistry';
import { adaptResponseV2 } from './document';

test('page registry deduplicates fragment references without merging distinct pages or query data', () => {
  const result = adaptResponseV2({ id: 'r', content: 'A [1], B [2].', webSources: [
    { title: 'Page', url: 'https://example.com/page#one', snippet: 'First evidence' },
    { title: 'Same page', url: 'https://example.com/page#two', snippet: '' },
    { title: 'Other page', url: 'https://example.com/other', snippet: '' },
    { title: 'Dated result', url: 'https://example.com/page?date=2026-11-01', snippet: '' },
  ] });
  assert.ok(result.supported);
  const registry = sourceRegistryV2(result.document);
  assert.equal(registry.size, 3);
  assert.equal(registry.get('https://example.com/page')?.snippet, 'First evidence');
  assert.equal(result.document.sources.length, 4, 'citation numbering must remain unchanged');
  assert.equal(result.document.originalText, 'A [1], B [2].');
});
test('invalid or credential-bearing URLs cannot become source identities', () => {
  for (const url of ['javascript:alert(1)', 'https://user:password@example.com', 'not a URL']) assert.equal(sourceKeyV2(url), undefined);
});
test('adjacent duplicate pages collapse but citations supporting separate claims remain', () => {
  const tree = { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'Claim [1] [2]. Another claim [2].' }] }] };
  remarkCitationsV2([
    { title: 'A', url: 'https://example.com/a#one', snippet: '' },
    { title: 'A again', url: 'https://example.com/a#two', snippet: '' },
  ])()(tree);
  assert.equal(tree.children[0].children.filter(n => n.type === 'link').length, 2);
  assert.ok(JSON.stringify(tree).includes('Another claim'));
});
