import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SKILLS,
  defineSkill,
  evidenceAppliesToCurrentSkill,
  skillById,
  skillsForRole,
  skillsNeedingReevaluation,
  type SkillDefinition,
} from './skillRegistry.js';
import { ENGINEERING_ROLES, isMutationTool, roleMayUseTool } from './engineeringRoles.js';

/**
 * Command 3 §20 — skills are versioned, and a behavioural edit invalidates its evidence.
 *
 * The failure this prevents: a single system prompt has no unit of change, so improving
 * repair silently alters architecture selection with nothing recording it. Worse, benchmark
 * evidence survives the edit and attributes yesterday's results to today's behaviour.
 */

const base: SkillDefinition = {
  id: 'fixture',
  version: '1.0.0',
  roles: ['implementation'],
  applicability: 'a fixture',
  requiredTools: ['read_file'],
  requiredContext: ['x'],
  procedure: ['step one'],
  validation: ['it works'],
  recovery: ['retry'],
  supportedRuntimeAdapters: [],
};

test('changing the procedure changes the content version', () => {
  const before = defineSkill(base);
  const after = defineSkill({ ...base, procedure: ['step one', 'step two'] });
  assert.notEqual(before.contentVersion, after.contentVersion);
});

test('changing validation or recovery changes the content version', () => {
  const before = defineSkill(base);
  assert.notEqual(defineSkill({ ...base, validation: ['stricter'] }).contentVersion, before.contentVersion);
  assert.notEqual(defineSkill({ ...base, recovery: ['different'] }).contentVersion, before.contentVersion);
  assert.notEqual(defineSkill({ ...base, requiredTools: ['read_file', 'apply_patch'] }).contentVersion, before.contentVersion);
});

test('clarifying applicability does not discard evidence', () => {
  // Applicability says when to reach for a skill, not what it does. Rewording it must not
  // throw away benchmark results that are still valid.
  const before = defineSkill(base);
  const after = defineSkill({ ...base, applicability: 'a much better described fixture' });
  assert.equal(before.contentVersion, after.contentVersion);
});

test('tool order does not change the content version', () => {
  // Reordering a list is not a behavioural change; treating it as one would cause
  // pointless re-evaluation.
  const a = defineSkill({ ...base, requiredTools: ['read_file', 'apply_patch'] });
  const b = defineSkill({ ...base, requiredTools: ['apply_patch', 'read_file'] });
  assert.equal(a.contentVersion, b.contentVersion);
});

test('evidence for an older content version no longer applies', () => {
  const skill = SKILLS[0]!;
  assert.equal(
    evidenceAppliesToCurrentSkill({
      skillId: skill.id,
      contentVersion: skill.contentVersion,
      successRate: 0.9,
      samples: 20,
    }),
    true,
  );
  assert.equal(
    evidenceAppliesToCurrentSkill({
      skillId: skill.id,
      contentVersion: 'stale0000000000',
      successRate: 0.9,
      samples: 20,
    }),
    false,
  );
});

test('evidence for an unknown skill never applies', () => {
  assert.equal(
    evidenceAppliesToCurrentSkill({ skillId: 'nope', contentVersion: 'x', successRate: 1, samples: 99 }),
    false,
  );
});

test('skills with stale or missing evidence are reported for re-evaluation', () => {
  const all = skillsNeedingReevaluation([]);
  assert.deepEqual([...all].sort(), SKILLS.map((skill) => skill.id).sort());

  const one = SKILLS[0]!;
  const remaining = skillsNeedingReevaluation([
    { skillId: one.id, contentVersion: one.contentVersion, successRate: 0.9, samples: 10 },
  ]);
  assert.equal(remaining.includes(one.id), false);
  assert.equal(remaining.length, SKILLS.length - 1);
});

test('every skill declares a procedure, validation and recovery', () => {
  for (const skill of SKILLS) {
    assert.ok(skill.procedure.length > 0, `${skill.id} procedure`);
    assert.ok(skill.validation.length > 0, `${skill.id} validation`);
    assert.ok(skill.recovery.length > 0, `${skill.id} recovery`);
    assert.ok(skill.roles.length > 0, `${skill.id} roles`);
  }
});

test('no skill requires a tool its own roles are forbidden', () => {
  // The seam that would otherwise fail at runtime: a skill assigned to a reviewer while
  // requiring apply_patch would be unusable by the role that owns it.
  for (const skill of SKILLS) {
    for (const role of skill.roles) {
      for (const tool of skill.requiredTools) {
        assert.equal(
          roleMayUseTool(role, tool),
          true,
          `skill ${skill.id} needs ${tool} but role ${role} may not use it`,
        );
      }
    }
  }
});

test('no read-only role holds a skill that mutates', () => {
  for (const skill of SKILLS) {
    const mutates = skill.requiredTools.some((tool) => isMutationTool(tool));
    if (!mutates) continue;
    for (const role of skill.roles) {
      assert.notEqual(role, 'research', `${skill.id} exposes mutation to the research role`);
      assert.notEqual(role, 'independent_review', `${skill.id} lets a reviewer edit`);
      assert.notEqual(role, 'security_review', `${skill.id} lets a security reviewer edit`);
    }
  }
});

test('skills resolve by role and by id', () => {
  const implementationSkills = skillsForRole('implementation');
  assert.ok(implementationSkills.length > 0);
  for (const skill of implementationSkills) assert.ok(skill.roles.includes('implementation'));

  assert.equal(skillById(SKILLS[0]!.id)?.id, SKILLS[0]!.id);
  assert.equal(skillById('missing'), null);
});

test('every role a skill names is a real role', () => {
  for (const skill of SKILLS) {
    for (const role of skill.roles) {
      assert.ok(role in ENGINEERING_ROLES, `${skill.id} names unknown role ${role}`);
    }
  }
});
