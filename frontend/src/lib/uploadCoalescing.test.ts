import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  FIRST_UPLOAD_DELAY_MS,
  SUBSEQUENT_UPLOAD_DELAY_MS,
  fingerprintUpload,
  isDuplicateUpload,
  rememberUpload,
  resetUploadCoalescing,
  uploadDelayMs,
  type UploadPayload,
} from './uploadCoalescing';

beforeEach(() => resetUploadCoalescing());

const SESSION = 'session-abc';

function payload(overrides: Partial<UploadPayload> = {}): UploadPayload {
  return {
    githubRepoName: 'acme/site',
    githubBranch: 'main',
    title: '#1 terminal',
    prompt: 'Build a landing page',
    preview: 'Build a landing page',
    kind: 'chat',
    status: 'active',
    messages: [
      { id: 'm1', role: 'user', content: 'Build a landing page' },
      { id: 'm2', role: 'assistant', content: 'Done.' },
    ],
    ...overrides,
  };
}

/**
 * The egress incident: autosave fires on remount, on focus, on repo selection and
 * on every settled token batch. Each of those used to be a full upload of the
 * transcript even when nothing had changed.
 */
test('repeated saves of an unchanged session upload exactly once', () => {
  const first = fingerprintUpload(payload());
  assert.equal(isDuplicateUpload(SESSION, first), false, 'first save must be sent');
  rememberUpload(SESSION, first, 1_000);

  // Twenty more renders/events, each rebuilding the payload from scratch so the
  // objects and arrays have fresh identities — exactly what React hands us.
  let sent = 0;
  for (let i = 0; i < 20; i += 1) {
    const fp = fingerprintUpload(payload());
    if (!isDuplicateUpload(SESSION, fp)) {
      sent += 1;
      rememberUpload(SESSION, fp, 2_000 + i);
    }
  }

  assert.equal(sent, 0, 'unchanged payloads must not produce any further writes');
});

test('a new object identity with identical content is not a change', () => {
  const a = fingerprintUpload(payload());
  const b = fingerprintUpload(payload());
  assert.equal(a, b);
});

test('a genuinely new message is still uploaded', () => {
  const before = fingerprintUpload(payload());
  rememberUpload(SESSION, before, 1_000);

  const after = fingerprintUpload(
    payload({
      messages: [
        { id: 'm1', role: 'user', content: 'Build a landing page' },
        { id: 'm2', role: 'assistant', content: 'Done.' },
        { id: 'm3', role: 'user', content: 'Now add pricing' },
      ],
    })
  );

  assert.notEqual(after, before);
  assert.equal(isDuplicateUpload(SESSION, after), false, 'real changes must still be written');
});

test('a streamed answer growing token by token is one write per settled payload, not per render', () => {
  // Same assistant message, appended to as tokens arrive. Each distinct body is a
  // real change and must be uploadable; re-rendering the same body must not be.
  const bodies = ['D', 'Do', 'Don', 'Done'].map((content) =>
    payload({ messages: [{ id: 'm2', role: 'assistant', content }] })
  );

  let writes = 0;
  for (const body of bodies) {
    // React re-renders the same content several times per streamed chunk.
    for (let render = 0; render < 3; render += 1) {
      const fp = fingerprintUpload(body);
      if (!isDuplicateUpload(SESSION, fp)) {
        writes += 1;
        rememberUpload(SESSION, fp, 1_000 + writes);
      }
    }
  }

  assert.equal(writes, bodies.length, 'one write per distinct payload, not per render');
});

test('changing only the repo binding is treated as a change worth persisting', () => {
  const original = fingerprintUpload(payload());
  rememberUpload(SESSION, original, 1_000);
  const moved = fingerprintUpload(payload({ githubBranch: 'develop' }));
  assert.equal(isDuplicateUpload(SESSION, moved), false);
});

test('two sessions with identical content do not shadow each other', () => {
  const fp = fingerprintUpload(payload());
  rememberUpload('session-one', fp, 1_000);
  assert.equal(isDuplicateUpload('session-one', fp), true);
  assert.equal(isDuplicateUpload('session-two', fp), false, 'dedupe must be per session');
});

test('first save is prompt; later saves are coalesced over a wider window', () => {
  assert.equal(uploadDelayMs(SESSION), FIRST_UPLOAD_DELAY_MS);
  rememberUpload(SESSION, fingerprintUpload(payload()), 1_000);
  assert.equal(uploadDelayMs(SESSION), SUBSEQUENT_UPLOAD_DELAY_MS);
  assert.ok(
    SUBSEQUENT_UPLOAD_DELAY_MS > FIRST_UPLOAD_DELAY_MS,
    'the coalescing window must actually be wider'
  );
});

test('an unserializable payload fails open rather than silently dropping a session', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const fp = fingerprintUpload(payload({ messages: [cyclic] }));
  assert.equal(isDuplicateUpload(SESSION, fp), false);
  rememberUpload(SESSION, fp, 1_000);
  // A second unserializable payload must not be mistaken for the first.
  const again = fingerprintUpload(payload({ messages: [cyclic] }));
  assert.equal(isDuplicateUpload(SESSION, again), false);
});
