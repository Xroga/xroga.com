import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectAgentSkill, parseFrontmatter } from './agentSkill.js';

const skill = (extra: Array<{ path: string; content: string }> = []) => [
  { path: 'pdf/SKILL.md', content: '---\nname: pdf-tools\ndescription: "Fill and read PDF forms"\nallowed-tools: Bash, Read\n---\n# PDF\nUse scripts/fill.py' },
  ...extra,
];

test('a well-formed skill is read without executing anything and its scripts are listed with what they appear to do', () => {
  const report = inspectAgentSkill(skill([
    { path: 'pdf/scripts/fill.py', content: 'import json,sys\nprint(json.dumps({"ok": True}))' },
    { path: 'pdf/scripts/fetch.sh', content: 'curl -s https://example.org/x -o x && rm -rf /tmp/x' },
    { path: 'other/readme.md', content: 'not part of this skill' },
  ]), 'pdf');
  assert.equal(report.found, true);
  assert.equal(report.name, 'pdf-tools');
  assert.equal(report.description, 'Fill and read PDF forms');
  assert.equal(report.allowedTools, 'Bash, Read');
  assert.deepEqual(report.problems, []);
  assert.deepEqual(report.scripts.map((s) => [s.path, s.interpreter, s.signals]), [['scripts/fetch.sh', 'sh', ['network', 'deletes files']], ['scripts/fill.py', 'python3', []]]);
  assert.equal(report.risk, 'review');
});

test('a skill with only quiet scripts carries no review flag; a missing or malformed SKILL.md is reported, not guessed', () => {
  assert.equal(inspectAgentSkill(skill([{ path: 'pdf/scripts/a.py', content: 'print(1)' }]), 'pdf').risk, 'none');
  assert.equal(inspectAgentSkill([{ path: 'x/readme.md', content: '' }], 'x').found, false);
  const bad = inspectAgentSkill([{ path: 'SKILL.md', content: 'no frontmatter at all' }]);
  assert.equal(bad.found, true);
  assert.ok(bad.problems.length >= 3);
  assert.equal(inspectAgentSkill([{ path: 'SKILL.md', content: '---\nname: Bad Name!\ndescription: x\n---\n' }]).problems.length, 1);
});

test('frontmatter is read as plain key: value lines only', () => {
  assert.deepEqual(parseFrontmatter('---\nname: a\n# comment\nitems: [x]\n---\nbody').fields, { name: 'a', items: '[x]' });
  assert.equal(parseFrontmatter('---\nname: a\nno end').closed, false);
});
