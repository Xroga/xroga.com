import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanShareText, prepareShareText, socialShareUrl } from './messageShare';
import { serializeAssistantCopy } from './assistantCopy';

test('V2 share payload preserves the complete copy export without a second Markdown parse', () => {
  const original = '## Storage\nUse `tenant_id`, `user_id` and `stripe_event_id`.\n\n```sql\nSELECT tenant_id, user_id FROM webhook_events;\n```\n\nFormula: a * b * c\n\nhttps://example.com/a_b_c';
  const exported = serializeAssistantCopy(original);
  const shared = prepareShareText(exported, true);
  assert.equal(shared, exported);
  for (const literal of ['tenant_id', 'user_id', 'stripe_event_id', 'webhook_events', 'https://example.com/a_b_c']) assert.ok(shared.includes(literal), literal);
  const prompt = 'Keep __private_key__ and a_b_c exactly as typed.';
  assert.equal(prepareShareText(prompt, true), prompt);
});

test('legacy share preparation keeps its established default', () => {
  assert.equal(prepareShareText('## **Answer**'), cleanShareText('## **Answer**'));
});

test('shared response text is literal and free of presentation markers', () => {
  assert.equal(
    cleanShareText('### **Answer**\n___\n- Real output\n/////'),
    'Answer\n\nReal output',
  );
});

test('every social action receives the durable link', () => {
  const link = 'https://xroga.com/share/opaque-token';
  for (const platform of ['x', 'linkedin', 'facebook', 'whatsapp', 'reddit'] as const) {
    const target = socialShareUrl(platform, link);
    assert.match(target, /^https:\/\//);
    assert.ok(target.includes(encodeURIComponent(link)), platform);
  }
});
