import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPOSER_PRESETS,
  COMPOSER_SKILLS,
  buildComposerPreamble,
} from '../store/useComposerToolsStore';

test('no rules and no packs attach nothing at all', () => {
  assert.equal(buildComposerPreamble('', []), '');
  assert.equal(buildComposerPreamble('   \n  ', []), '');
  assert.equal(buildComposerPreamble('', ['not-a-real-pack']), '');
});

test('an enabled pack contributes its instruction', () => {
  const preamble = buildComposerPreamble('', ['plan-first']);
  assert.ok(preamble.includes('produce a short plan'), preamble);
  assert.ok(preamble.endsWith('\n\n---\n\n'), 'preamble must be separated from the prompt');
});

test('rules are included verbatim once trimmed', () => {
  const preamble = buildComposerPreamble('  Always use TypeScript strict mode.  ', []);
  assert.ok(preamble.includes('Always use TypeScript strict mode.'));
  assert.ok(!preamble.includes('  Always'), 'surrounding whitespace should be trimmed');
});

test('packs and rules combine, packs first', () => {
  const preamble = buildComposerPreamble('My own rule.', ['plan-first', 'tests-first']);
  const planAt = preamble.indexOf('produce a short plan');
  const testAt = preamble.indexOf('must ship with a test');
  const ruleAt = preamble.indexOf('My own rule.');
  assert.ok(planAt >= 0 && testAt >= 0 && ruleAt >= 0);
  assert.ok(planAt < ruleAt, 'packs should precede the user rules');
  assert.ok(testAt < ruleAt, 'packs should precede the user rules');
});

/**
 * Order follows the catalogue, not the click order. Two users with the same packs
 * enabled must produce the same preamble, or identical settings would send different
 * prompts depending on which was toggled first.
 */
test('pack order is stable regardless of the order they were enabled', () => {
  const a = buildComposerPreamble('', ['tests-first', 'plan-first']);
  const b = buildComposerPreamble('', ['plan-first', 'tests-first']);
  assert.equal(a, b);
});

test('unknown pack ids are ignored rather than throwing', () => {
  const preamble = buildComposerPreamble('', ['plan-first', 'removed-pack']);
  assert.ok(preamble.includes('produce a short plan'));
  assert.ok(!preamble.includes('undefined'), preamble);
});

test('every pack has a unique id and non-empty instruction', () => {
  const ids = COMPOSER_SKILLS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate pack id');
  for (const skill of COMPOSER_SKILLS) {
    assert.ok(skill.label.trim().length > 0, `${skill.id} has no label`);
    assert.ok(skill.description.trim().length > 0, `${skill.id} has no description`);
    assert.ok(skill.instruction.trim().length > 10, `${skill.id} has no real instruction`);
  }
});

/**
 * The scaffolds fill the composer for the user to finish. If one ever arrived
 * already-complete it would invite blind sending, which costs a real run.
 */
test('the presets are scaffolds, not finished prompts', () => {
  assert.ok(COMPOSER_PRESETS.plan.trim().length > 0);
  assert.ok(COMPOSER_PRESETS.debug.includes('```'), 'debug should leave a place to paste');
  for (const preset of Object.values(COMPOSER_PRESETS)) {
    assert.ok(preset.endsWith('\n\n'), 'a scaffold should leave the caret on a fresh line');
  }
});
