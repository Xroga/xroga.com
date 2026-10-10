import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseXrogaBlock, parseXrogaOutput } from './xrogaBlocks';
import { enhanceAiResponse } from './xrogaResponseDocument';
import { RICH_RESULT_FIXTURES } from './xrogaRichResultFixtures';
import { formatRichPrice, safeRichImageUrl, safeRichSourceUrl } from './xrogaRichResults';
import { webSourcesToRichResults } from './xrogaWebResultAdapter';

const sourcedItem = { id: 'a', domain: 'other', kind: 'Service', title: 'Example service', status: 'search-result', source: { title: 'Provider page', url: 'https://example.com/service' } };

test('33 illustrative fixtures cover all card domains and validate under canonical schema', () => {
  assert.equal(RICH_RESULT_FIXTURES.length, 33);
  assert.deepEqual([...new Set(RICH_RESULT_FIXTURES.map((item) => item.domain))].sort(), ['accommodation', 'business', 'other', 'reservation', 'shopping', 'transport', 'travel', 'vehicle']);
  const block = parseXrogaBlock({ schemaVersion: 1, id: 'fixture-block', type: 'rich-results', items: RICH_RESULT_FIXTURES });
  assert.equal(block?.type, 'rich-results');
  assert.equal(block?.items.length, 33);
});

test('mixed narrative, rich results and historical canonical output survive parsing', () => {
  const response = `A sourced result with limits.\n\n\`\`\`xroga-ui\n${JSON.stringify({ type: 'rich-results', title: 'Results', items: [sourcedItem] })}\n\`\`\``;
  const enhanced = enhanceAiResponse(response, 'historical-message');
  assert.equal(enhanced.content, 'A sourced result with limits.');
  assert.deepEqual(enhanced.output?.blocks.map((block) => block.type), ['narrative', 'rich-results']);
  assert.equal(parseXrogaOutput(enhanced.output)?.blocks[1]?.type, 'rich-results');
  assert.equal(parseXrogaBlock({ schemaVersion: 1, id: 'old-text', type: 'narrative', text: 'Saved answer' })?.type, 'narrative');
});

test('unsafe URLs, unsourced non-demo data and unproven confirmations are rejected', () => {
  const candidate = (item: object) => parseXrogaBlock({ schemaVersion: 1, id: 'bad', type: 'rich-results', items: [item] });
  assert.equal(candidate({ ...sourcedItem, source: { title: 'bad', url: 'javascript:alert(1)' } }), null);
  assert.equal(candidate({ ...sourcedItem, source: undefined }), null);
  assert.equal(candidate({ ...sourcedItem, status: 'availability-checked' }), null);
  assert.equal(candidate({ ...sourcedItem, status: 'confirmed', confirmationReference: 'X' }), null);
  const forged = `\`\`\`xroga-ui\n${JSON.stringify({ type: 'rich-results', items: [{ ...sourcedItem, status: 'confirmed', confirmationReference: 'FAKE', availabilityEvidence: 'Claimed' }] })}\n\`\`\``;
  assert.equal(enhanceAiResponse(forged, 'forged').output, undefined);
  assert.equal(safeRichSourceUrl('https://user:secret@example.com/'), null);
});

test('image policy allows original local demo assets and fails closed for arbitrary hosts', () => {
  assert.equal(safeRichImageUrl('/os-preview/rich-results/alpine-lake.webp', 'demo-generated', true), '/os-preview/rich-results/alpine-lake.webp');
  assert.equal(safeRichImageUrl('/os-preview/rich-results/alpine-lake.webp', 'demo-generated'), null);
  assert.equal(safeRichImageUrl('https://example.com/image.jpg', 'provider-authorized'), null);
  assert.equal(safeRichImageUrl('/os-preview/rich-results/../secret.webp', 'demo-generated'), null);
});

test('web source adapter preserves identity without inventing price or availability', () => {
  const block = webSourcesToRichResults([{ title: 'Provider page', url: 'https://example.com', snippet: 'A brief sourced excerpt.', source: 'Web search', thumbnailUrl: 'https://untrusted.test/img.jpg' }], 'msg');
  assert.equal(block?.type, 'rich-results');
  if (block?.type !== 'rich-results') return;
  assert.equal(block.items[0]?.status, 'search-result');
  assert.equal(block.items[0]?.source?.url, 'https://example.com/');
  assert.equal(block.items[0]?.price, undefined);
  assert.equal(block.items[0]?.images, undefined);
  assert.equal(webSourcesToRichResults([{ title: 'bad', url: 'javascript:alert(1)', snippet: '', source: '' }], 'msg'), null);
});

test('mixed currencies and local time zones remain explicit data, not converted guesses', () => {
  assert.equal(formatRichPrice({ amount: 42, currency: 'EUR', basis: 'per-night' })?.includes('42'), true);
  const transport = RICH_RESULT_FIXTURES.find((item) => item.id === 'flight-sfo-dxb');
  assert.equal(transport?.route?.[0]?.departureTimeZone, 'America/Los_Angeles');
  assert.equal(transport?.route?.[0]?.arrivalTimeZone, 'Asia/Dubai');
  assert.equal(RICH_RESULT_FIXTURES.find((item) => item.id === 'train')?.price?.currency, 'CHF');
  assert.equal(RICH_RESULT_FIXTURES.find((item) => item.id === 'train')?.transportMode, 'train');
});
