import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSharedText } from './messageShareText.js';

test('share copy removes decorative markdown but keeps the actual words and code', () => {
  const clean = cleanSharedText(`### **Result**\n\n-----\n1. Build the page\n2. Ship it\n\n\`npm run build\`\n/////`);
  assert.equal(clean, 'Result\n\nBuild the page\nShip it\n\nnpm run build');
  assert.doesNotMatch(clean, /###|\*\*|-----|\/\/\/\/\/|^\d+[.)]/m);
});

test('share copy does not invent metrics, counts, or labels', () => {
  const source = 'The build passed.\nRepository: acme/site';
  assert.equal(cleanSharedText(source), source);
});
