import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { companionPreferencesSchema } from './profile.js';

const valid = {
  name: 'Xo',
  costume: 'techwear',
  accent: 'violet',
  size: 'standard',
  dock: 'composer',
  visible: true,
  voiceEnabled: false,
  careEnabled: true,
  reducedGamification: false,
  mantleEnabled: true,
  lastFedAt: null,
};

describe('companion profile preferences', () => {
  it('accepts the complete bounded preference contract', () => {
    assert.equal(companionPreferencesSchema.safeParse(valid).success, true);
  });

  it('still accepts a save from a client that has not dropped crownEnabled yet', () => {
    // The field is retired, but this object is strict. Rejecting it would 400 every
    // profile write from a browser still holding the previous bundle, which loses the
    // user's preferences for as long as that cache lives.
    const legacy = companionPreferencesSchema.safeParse({ ...valid, crownEnabled: true });
    assert.equal(legacy.success, true);
    assert.equal('crownEnabled' in (legacy.success ? legacy.data : {}), false);
  });

  it('does not persist the retired field', () => {
    const parsed = companionPreferencesSchema.parse(valid);
    assert.equal('crownEnabled' in parsed, false);
  });

  it('rejects unknown fields and invalid names', () => {
    assert.equal(companionPreferencesSchema.safeParse({ ...valid, secret: 'must-not-persist' }).success, false);
    assert.equal(companionPreferencesSchema.safeParse({ ...valid, name: '' }).success, false);
    assert.equal(companionPreferencesSchema.safeParse({ ...valid, name: 'x'.repeat(25) }).success, false);
  });

  it('rejects invented moods and runtime operation state', () => {
    assert.equal(companionPreferencesSchema.safeParse({ ...valid, mood: 'happy' }).success, false);
    assert.equal(companionPreferencesSchema.safeParse({ ...valid, operation: 'success' }).success, false);
  });
});
