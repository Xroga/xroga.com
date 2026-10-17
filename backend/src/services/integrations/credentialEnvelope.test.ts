import assert from 'node:assert/strict';
import test from 'node:test';
import { openCredentialEnvelope as open, sealCredentialEnvelope as seal, type CredentialEnvelopeContext } from './credentialEnvelope.js';

const key = Buffer.alloc(32, 23); // Synthetic fixture, never deployment material.
const provider = { domain: 'provider', owner: 'owner-one', provider: 'apikey_openai' } as const;
const runtime = { domain: 'runtime', owner: 'owner-one', project: 'project-one', name: 'API_KEY', scope: 'preview' } as const;

test('v2 codec roundtrips both domains with randomized IVs and full key material', () => {
  for (const context of [provider, runtime]) {
    const first = seal('synthetic:secret', key, 'fixture-key', context);
    assert.equal(open(first, key, 'fixture-key', context), 'synthetic:secret');
    assert.notEqual(first, seal('synthetic:secret', key, 'fixture-key', context));
    const suffixChanged = Buffer.from(key); suffixChanged[31] ^= 1;
    assert.throws(() => open(first, suffixChanged, 'fixture-key', context));
    assert.throws(() => open(first, key, 'different-key-id', context));
  }
});

test('v2 authenticates exact owner, provider, project, name, scope and domain', () => {
  for (const [context, alternatives] of [
    [provider, [{ ...provider, owner: 'other' }, { ...provider, provider: 'apikey_anthropic' }, runtime]],
    [runtime, [{ ...runtime, owner: 'other' }, { ...runtime, project: 'other' }, { ...runtime, name: 'OTHER_KEY' }, { ...runtime, scope: 'deployment' }, provider]],
  ] as Array<[CredentialEnvelopeContext, CredentialEnvelopeContext[]]>) {
    const envelope = seal('synthetic', key, 'fixture', context);
    for (const changed of alternatives) assert.throws(() => open(envelope, key, 'fixture', changed));
  }
});

test('v2 rejects downgrade, unknown formats, malformed envelope and tampering', () => {
  const envelope = seal('synthetic', key, 'fixture', provider);
  for (const bad of ['enc:c3ludGhldGlj', envelope.replace(/^v2/, 'v1'), envelope.replace(/^v2/, 'v3'), `${envelope}:extra`, envelope.replace(':fixture:', ':unknown:'), envelope + '=', 'x'.repeat(86_001)]) {
    assert.throws(() => open(bad, key, 'fixture', provider));
  }
  for (const index of [2, 3, 4]) {
    const parts = envelope.split(':');
    const bytes = Buffer.from(parts[index]!, 'base64url'); bytes[0] ^= 1;
    parts[index] = bytes.toString('base64url');
    assert.throws(() => open(parts.join(':'), key, 'fixture', provider));
    parts[index] = 'AA';
    assert.throws(() => open(parts.join(':'), key, 'fixture', provider));
  }
});

test('v2 enforces byte bounds, exact keys and canonical identity inputs', () => {
  const maximum = 'a'.repeat(64_000);
  assert.equal(open(seal(maximum, key, 'fixture', provider), key, 'fixture', provider), maximum);
  for (const plain of ['', 'a'.repeat(64_001), '€'.repeat(22_000), '\ud800']) assert.throws(() => seal(plain, key, 'fixture', provider));
  for (const size of [0, 31, 33, 64, 128]) assert.throws(() => seal('synthetic', Buffer.alloc(size), 'fixture', provider));
  for (const id of ['', 'bad:id', 'a'.repeat(65)]) assert.throws(() => seal('synthetic', key, id, provider));
  for (const changed of [{ ...provider, owner: '' }, { ...provider, owner: 'a\nb' }, { ...provider, provider: '../other' }, { ...provider, extra: 'ignored?' }]) {
    assert.throws(() => seal('synthetic', key, 'fixture', changed));
  }
});
