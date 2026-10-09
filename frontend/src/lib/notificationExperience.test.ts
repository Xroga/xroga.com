import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Notification } from '@/lib/api';
import { notificationStatus, notificationTone, readSeenNotifications, rememberSeenNotifications } from './notificationExperience';

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
