import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Notification } from '@/lib/api';
import { notificationStatus, notificationTone, playNotificationChime, previewNotificationChime, readSeenNotifications, rememberSeenNotifications } from './notificationExperience';

const base: Notification = { id: 'n1', title: 'Build complete', message: 'Verified', type: 'success', read: false, link: '/workspace', created_at: '2026-10-10T00:00:00Z' };

test('notification status reflects the real event type', () => {
  assert.equal(notificationTone(base), 'success');
  assert.equal(notificationStatus(base), 'Done');
  assert.equal(notificationStatus({ ...base, type: 'warning' }), 'Needs attention');
  assert.equal(notificationStatus({ ...base, type: 'error' }), 'Error');
  assert.equal(notificationStatus({ ...base, type: 'info' }), 'Update');
});

test('seen notifications persist per account to avoid repeat alerts', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { value: { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } }, configurable: true });
  rememberSeenNotifications('user-a', new Set(['n1', 'n2']));
  assert.deepEqual([...readSeenNotifications('user-a')], ['n1', 'n2']);
  assert.equal(readSeenNotifications('user-b').size, 0);
});

test('sound preview plays the real chime without enabling future notification sounds', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  let notes = 0;
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    state = 'running';
    createOscillator() {
      return { type: 'sine', frequency: { value: 0 }, connect: (gain: object) => gain, start: () => { notes += 1; }, stop: () => {} };
    }
    createGain() {
      return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => this };
    }
  }
  Object.defineProperty(globalThis, 'window', {
    value: { AudioContext: FakeAudioContext, localStorage: { getItem: () => '0' } },
    configurable: true,
  });
  try {
    playNotificationChime();
    assert.equal(notes, 0);
    previewNotificationChime();
    assert.equal(notes, 2);
    playNotificationChime();
    assert.equal(notes, 2);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
