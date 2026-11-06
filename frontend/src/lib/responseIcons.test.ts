import test from 'node:test';
import assert from 'node:assert/strict';
import { responseIcon, RESPONSE_ICON_MAP } from './responseIcons';
import { enhanceAiResponse } from './xrogaResponseDocument';
import { adaptResponseV2 } from '../components/response-experience-v2/document';
import { readFileSync } from 'node:fs';

test('only approved icon names resolve, and prototype keys or markup never do', () => {
  assert.ok(responseIcon('home'));
  assert.ok(responseIcon('trending-up'));
  for (const bad of ['', 'Home', '<script>', 'constructor', '__proto__', 'toString', 42, null, undefined]) assert.equal(responseIcon(bad), undefined, String(bad));
});

test('the frontend list matches the backend list exactly', () => {
  const source = readFileSync(new URL('../../../backend/src/ai/responseIcons.ts', import.meta.url), 'utf8');
  const names = [...source.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]).filter(n => n !== 'use');
  assert.deepEqual([...new Set(names)].sort(), Object.keys(RESPONSE_ICON_MAP).sort());
});

test('card and step icons survive the response document adapter', () => {
  const nl = String.fromCharCode(10);
  const cards = ['```xroga-ui', JSON.stringify({ id: 'c', type: 'card-grid', cards: [{ id: 'a', title: 'House', icon: 'home' }, { id: 'b', title: 'Condo', icon: 'building' }] }), '```'].join(nl);
  const steps = ['```xroga-ui', JSON.stringify({ id: 's', type: 'steps', steps: [{ id: 'x', title: 'Pre-approval', icon: 'file-text' }, { id: 'y', title: 'Offer', icon: 'handshake' }] }), '```'].join(nl);
  const enhanced = enhanceAiResponse(['Options', cards, 'Plan', steps].join(nl), 'icons');
  const result = adaptResponseV2({ id: 'icons', content: enhanced.content, featureOutput: enhanced.output });
  assert.ok(result.supported);
  const cardNode = result.document.nodes.find(n => n.kind === 'cards');
  const timeline = result.document.nodes.find(n => n.kind === 'timeline');
  assert.deepEqual(cardNode && cardNode.kind === 'cards' ? cardNode.items.map(i => i.icon) : [], ['home', 'building']);
  assert.deepEqual(timeline && timeline.kind === 'timeline' ? timeline.items.map(i => i.icon) : [], ['file-text', 'handshake']);
});
