import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanShareText, socialShareUrl } from './messageShare';

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
