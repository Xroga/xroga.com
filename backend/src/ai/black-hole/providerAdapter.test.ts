import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ModalityUnsupportedError,
  supportsImages,
  withAttachments,
} from './providerAdapter.js';
import type { ChatMessage, ContentPart } from '../openaiCompat.js';

const VISION_ON = { KIMI_VISION_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv;
const VISION_OFF = {} as NodeJS.ProcessEnv;

// ---------------------------------------------------------------------------
// Modality is a fact, read from one place
// ---------------------------------------------------------------------------

test('Grok genuinely accepts images', () => {
  assert.equal(supportsImages('grok_4_5', VISION_OFF), true);
  assert.equal(supportsImages('grok_4_3', VISION_OFF), true);
});

test('K3 vision is off until an operator verifies it', () => {
  // Not a guess in either direction: the shipped default is off because Moonshot's contract
  // has not been confirmed, and the operator switch exists because it plausibly will be.
  assert.equal(supportsImages('kimi_k3', VISION_OFF), false);
  assert.equal(supportsImages('kimi_k3', VISION_ON), true);
});

test('a text-only model never reports image support', () => {
  for (const id of ['glm_5_2', 'deepseek_v4_pro', 'deepseek_v4_flash'] as const) {
    assert.equal(supportsImages(id, VISION_ON), false, `${id} must not claim vision`);
  }
});

// ---------------------------------------------------------------------------
// Attachment assembly
// ---------------------------------------------------------------------------

const messages: ChatMessage[] = [
  { role: 'system', content: 'be terse' },
  { role: 'user', content: 'what is in this image?' },
];

test('an image is attached to the last user turn in the provider format', () => {
  const result = withAttachments(messages, [
    { mediaType: 'image/png', url: 'data:image/png;base64,AAA' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].role, 'system', 'the system turn must survive');
  const parts = result[1].content as ContentPart[];
  assert.ok(Array.isArray(parts));
  assert.equal(parts[0].type, 'text');
  assert.equal((parts[0] as { text: string }).text, 'what is in this image?');
  assert.equal(parts[1].type, 'image_url');
});

test('a non-image attachment is not smuggled in as an image', () => {
  // Pretending a PDF is an image produces a provider rejection whose message looks nothing
  // like the cause.
  const result = withAttachments(messages, [
    { mediaType: 'application/pdf', url: 'https://example.com/a.pdf' },
  ]);
  assert.equal(typeof result[1].content, 'string');
});

test('multiple images all reach the request', () => {
  const result = withAttachments(messages, [
    { mediaType: 'image/png', url: 'https://example.com/a.png' },
    { mediaType: 'image/jpeg', url: 'https://example.com/b.jpg' },
  ]);
  const parts = result[1].content as ContentPart[];
  assert.equal(parts.filter((part) => part.type === 'image_url').length, 2);
});

test('an image with no user turn still produces a valid request', () => {
  const result = withAttachments(
    [{ role: 'system', content: 'analyse' }],
    [{ mediaType: 'image/png', url: 'https://example.com/a.png' }],
  );
  assert.equal(result.at(-1)!.role, 'user');
});

test('no attachments leaves the messages untouched', () => {
  const result = withAttachments(messages, []);
  assert.deepEqual(result, messages);
});

// ---------------------------------------------------------------------------
// Refusal rather than silent drop
// ---------------------------------------------------------------------------

test('sending an image to a model without vision is refused, not silently dropped', async () => {
  // A silent drop yields a confident description of an image the model never received, which
  // is indistinguishable downstream from the model simply being wrong.
  const { complete } = await import('./providerAdapter.js');
  await assert.rejects(
    complete({
      modelId: 'glm_5_2',
      messages,
      attachments: [{ mediaType: 'image/png', url: 'https://example.com/a.png' }],
      env: VISION_OFF,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ModalityUnsupportedError);
      assert.match(error.message, /never received/);
      return true;
    },
  );
});

test('a text-only request to a text-only model passes modality checks', async () => {
  // It will fail later for lack of credentials in this environment; what matters here is that
  // it is not rejected for modality.
  const { complete } = await import('./providerAdapter.js');
  await assert.rejects(
    complete({ modelId: 'glm_5_2', messages, env: VISION_OFF }),
    (error: unknown) => {
      assert.equal(error instanceof ModalityUnsupportedError, false, 'must not be a modality error');
      return true;
    },
  );
});
