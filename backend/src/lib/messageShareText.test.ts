import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanSharedText } from './messageShareText.js';

test('serialized V2 text preserves identifiers, formulas, code indentation and literal markup', () => {
  const text = 'tenant_id, user_id, stripe_event_id\n  a * b * c\nhttps://example.com/a_b_c\n<script>alert(1)</script>\n__private_key__';
  assert.equal(cleanSharedText(text, true), text);
});

test('share copy removes decorative markdown but keeps the actual words and code', () => {
  const clean = cleanSharedText(`### **Result**\n\n-----\n1. Build the page\n2. Ship it\n\n\`npm run build\`\n/////`);
  assert.equal(clean, 'Result\n\nBuild the page\nShip it\n\nnpm run build');
  assert.doesNotMatch(clean, /###|\*\*|-----|\/\/\/\/\/|^\d+[.)]/m);
});

test('share copy does not invent metrics, counts, or labels', () => {
  const source = 'The build passed.\nRepository: acme/site';
  assert.equal(cleanSharedText(source), source);
});
