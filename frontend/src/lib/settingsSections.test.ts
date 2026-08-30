import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sectionFromQuery, SETTINGS_SECTION_IDS } from './settingsSections';

describe('sectionFromQuery', () => {
  it('maps every known section id back to itself', () => {
    for (const id of SETTINGS_SECTION_IDS) {
      assert.equal(sectionFromQuery(id), id);
    }
  });

  it('fuzzy-matches legacy/alternate query spellings', () => {
    assert.equal(sectionFromQuery('Plan'), 'plan');
    assert.equal(sectionFromQuery('plan_usage'), 'plan');
    assert.equal(sectionFromQuery('data-ai'), 'data-ai');
    assert.equal(sectionFromQuery('DATA'), 'data-ai');
    assert.equal(sectionFromQuery('notif'), 'notifications');
    assert.equal(sectionFromQuery('theme'), 'personalization');
    assert.equal(sectionFromQuery('companion'), 'personalization');
    assert.equal(sectionFromQuery('Personalization'), 'personalization');
  });

  it('returns null for empty or unrecognized input', () => {
    assert.equal(sectionFromQuery(null), null);
    assert.equal(sectionFromQuery(undefined), null);
    assert.equal(sectionFromQuery(''), null);
    assert.equal(sectionFromQuery('nonexistent'), null);
  });
});
