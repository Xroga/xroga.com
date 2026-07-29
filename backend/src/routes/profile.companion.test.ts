import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { companionPreferencesSchema } from './profile.js';

const valid = {
  name: 'Xo',
  costume: 'builder',
  accent: 'violet',
  size: 'standard',
  dock: 'composer',
  visible: true,
  voiceEnabled: false,
  careEnabled: true,
  reducedGamification: false,
  crownEnabled: true,
  mantleEnabled: true,
  lastFedAt: null,
};

describe('companion profile preferences', () => {
  it('accepts the complete bounded preference contract', () => {
    assert.equal(companionPreferencesSchema.safeParse(valid).success, true);
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
