import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validBrowserPushSubscription } from './browserPushService.js';

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuvwxyz1234567890',
  keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
};

test('accepts browser push services with proper encryption keys', () => {
  assert.equal(validBrowserPushSubscription(valid), true);
  assert.equal(validBrowserPushSubscription({ ...valid, endpoint: 'https://web.push.apple.com/QAA' + 'a'.repeat(40) }), true);
});

test('rejects SSRF destinations and malformed subscriptions', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/' + 'a'.repeat(40),
    'https://localhost/' + 'a'.repeat(40),
    'https://fcm.googleapis.com.evil.test/' + 'a'.repeat(40),
    'https://user@fcm.googleapis.com/' + 'a'.repeat(40),
  ]) assert.equal(validBrowserPushSubscription({ ...valid, endpoint }), false);
  assert.equal(validBrowserPushSubscription({ ...valid, keys: { ...valid.keys, auth: 'not valid!' } }), false);
});
