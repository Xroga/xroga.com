import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import {
  clearPendingCustomization,
  readPendingCustomization,
  savePendingCustomization,
} from './pendingCustomization';
import { SHOWCASE_TEMPLATES } from './registry';

const KEY = 'xroga_pending_showcase_v1';
const template = SHOWCASE_TEMPLATES[0];

/** Minimal localStorage stand-in — the module only needs get/set/remove. */
function installStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  Object.assign(globalThis, { window: globalThis, localStorage: storage });
  return store;
}

let store: Map<string, string>;

beforeEach(() => {
  store = installStorage();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
});

const base = {
  templateId: template.id,
  templateVersion: template.templateVersion,
  templateSlug: template.slug,
  intent: 'customize' as const,
  answers: { brandName: 'Acme' },
  visiblePrompt: 'Customize it for Acme.',
};

test('a saved selection round-trips', () => {
  const saved = savePendingCustomization(base);
  assert.ok(saved);
  const read = readPendingCustomization();
  assert.equal(read?.templateId, template.id);
  assert.equal(read?.visiblePrompt, 'Customize it for Acme.');
  assert.deepEqual(read?.answers, { brandName: 'Acme' });
});

test('each save gets a distinct idempotency key unless one is supplied', () => {
  const first = savePendingCustomization(base);
  const second = savePendingCustomization(base);
  assert.notEqual(first?.idempotencyKey, second?.idempotencyKey);

  const pinned = savePendingCustomization({ ...base, idempotencyKey: 'fixed-key' });
  assert.equal(pinned?.idempotencyKey, 'fixed-key');
  assert.equal(readPendingCustomization()?.idempotencyKey, 'fixed-key');
});

test('nothing stored reads as nothing pending', () => {
  assert.equal(readPendingCustomization(), null);
});

test('an expired selection is discarded rather than silently resumed', () => {
  savePendingCustomization(base);
  const record = JSON.parse(store.get(KEY)!);
  record.savedAt = Date.now() - 61 * 60 * 1000;
  store.set(KEY, JSON.stringify(record));

  assert.equal(readPendingCustomization(), null);
  assert.equal(store.has(KEY), false, 'expired entry should be cleared');
});

test('a selection just inside the TTL still resumes', () => {
  savePendingCustomization(base);
  const record = JSON.parse(store.get(KEY)!);
  record.savedAt = Date.now() - 59 * 60 * 1000;
  store.set(KEY, JSON.stringify(record));
  assert.ok(readPendingCustomization());
});

test('a tampered template id is rejected, not forwarded to the server', () => {
  for (const templateId of ['../../etc/passwd', 'not-a-template', '', '__proto__', 'BUSINESS-WEBSITE']) {
    savePendingCustomization(base);
    const record = JSON.parse(store.get(KEY)!);
    record.templateId = templateId;
    store.set(KEY, JSON.stringify(record));
    assert.equal(readPendingCustomization(), null, templateId);
    assert.equal(store.has(KEY), false, `${templateId} should be cleared`);
  }
});

test('a mismatched id/slug pair is rejected', () => {
  savePendingCustomization(base);
  const record = JSON.parse(store.get(KEY)!);
  record.templateSlug = 'some-other-slug';
  store.set(KEY, JSON.stringify(record));
  assert.equal(readPendingCustomization(), null);
});

test('the version always comes from the registry, never from storage', () => {
  savePendingCustomization({ ...base, templateVersion: '99.99.99' });
  assert.equal(readPendingCustomization()?.templateVersion, template.templateVersion);
});

test('an unknown intent is rejected', () => {
  savePendingCustomization(base);
  const record = JSON.parse(store.get(KEY)!);
  record.intent = 'delete-everything';
  store.set(KEY, JSON.stringify(record));
  assert.equal(readPendingCustomization(), null);
});

test('malformed storage never throws', () => {
  for (const raw of ['', 'not json', '{', '[]', 'null', '{"templateId":1}', '{"savedAt":"soon"}']) {
    store.set(KEY, raw);
    assert.doesNotThrow(() => readPendingCustomization());
    assert.equal(readPendingCustomization(), null, raw);
  }
});

test('clearing removes the entry', () => {
  savePendingCustomization(base);
  clearPendingCustomization();
  assert.equal(readPendingCustomization(), null);
  assert.equal(store.has(KEY), false);
});
