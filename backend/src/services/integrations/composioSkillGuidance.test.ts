import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedComposioGuidance, rankToolsBySkill } from './composioSkillGuidance.js';

test('skill guidance only exposes permitted discovered slugs and bounds provider text', () => {
  const result = boundedComposioGuidance({
    guidance: 'g'.repeat(4_000),
    skill: {
      primaryToolSlugs: ['GMAIL_SEND_EMAIL', 'GMAIL_DELETE_EMAIL'],
      relatedToolSlugs: ['GMAIL_SEARCH_EMAILS', 'GMAIL_DELETE_EMAIL'],
      recommendedPlanSteps: ['Read with GMAIL_SEARCH_EMAILS, never GMAIL_DELETE_EMAIL', 's'.repeat(500)],
      knownPitfalls: ['Use an email address, not a display name'],
    },
  }, [{ slug: 'GMAIL_SEND_EMAIL' }, { slug: 'GMAIL_SEARCH_EMAILS' }]);

  assert.equal(result.executionGuidance.length, 2_000);
  assert.deepEqual(result.skill?.primaryToolSlugs, ['GMAIL_SEND_EMAIL']);
  assert.deepEqual(result.skill?.relatedToolSlugs, ['GMAIL_SEARCH_EMAILS']);
  assert.equal(result.skill?.recommendedPlanSteps[1]?.length, 400);
  assert.equal(result.skill?.recommendedPlanSteps[0], 'Read with GMAIL_SEARCH_EMAILS, never [unavailable tool]');
});

test('skill ranking keeps only supplied candidates and otherwise preserves search order', () => {
  const tools = [{ slug: 'A' }, { slug: 'B' }, { slug: 'C' }];
  const ranked = rankToolsBySkill(tools, {
    primaryToolSlugs: ['C', 'NOT_DISCOVERED'],
    relatedToolSlugs: [],
    recommendedPlanSteps: [],
    knownPitfalls: [],
  });
  assert.deepEqual(ranked.map((item) => item.slug), ['C', 'A', 'B']);
  assert.deepEqual(tools.map((item) => item.slug), ['A', 'B', 'C']);
});
