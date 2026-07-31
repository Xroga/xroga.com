import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildShowcaseCommand,
  buildVisiblePrompt,
  deriveProjectName,
  exportBranchName,
} from './buildCommand';
import { SHOWCASE_TEMPLATES, getShowcaseById } from './registry';

const template = getShowcaseById('business-website')!;

test('the business website template exists for these tests', () => {
  assert.ok(template);
});

test('an empty answer set produces no fabricated detail', () => {
  const prompt = buildVisiblePrompt(template, {});
  assert.ok(prompt.includes(template.name));
  // Nothing the user did not say may appear as a stated fact.
  for (const fragment of [
    'Purpose:',
    'Typography:',
    'Include:',
    'Primary users:',
    'Payments:',
    'Sign-in:',
    'call to action',
    'palette',
  ]) {
    assert.ok(!prompt.includes(fragment), `unanswered question leaked "${fragment}"`);
  }
});

test('answers appear verbatim and only when supplied', () => {
  const prompt = buildVisiblePrompt(template, {
    brandName: 'Northwind Studio',
    purpose: 'win enterprise leads',
    colors: 'deep green and cream',
    primaryCta: 'Book a call',
  });
  assert.ok(prompt.includes('Northwind Studio'));
  assert.ok(prompt.includes('Purpose: win enterprise leads'));
  assert.ok(prompt.includes('deep green and cream'));
  assert.ok(prompt.includes('"Book a call"'));
  assert.ok(!prompt.includes('Typography:'));
});

test('whitespace-only answers are treated as unanswered', () => {
  const prompt = buildVisiblePrompt(template, { brandName: '   ', purpose: '\n\t ' });
  assert.ok(prompt.includes('for my project'));
  assert.ok(!prompt.includes('Purpose:'));
});

test('multi-line answers are collapsed rather than breaking the prompt', () => {
  const prompt = buildVisiblePrompt(template, { purpose: 'sell\n\n  services   online' });
  assert.ok(prompt.includes('Purpose: sell services online'));
});

test('every template builds a non-empty prompt from no answers', () => {
  for (const item of SHOWCASE_TEMPLATES) {
    const prompt = buildVisiblePrompt(item, {});
    assert.ok(prompt.trim().length > 20, item.id);
  }
});

test('project name falls back to the template rather than being blank', () => {
  assert.equal(deriveProjectName(template, {}), `${template.name} project`);
  assert.equal(deriveProjectName(template, { brandName: ' Acme  Co ' }), 'Acme Co');
  assert.equal(deriveProjectName(template, { brandName: 'x'.repeat(200) }).length, 80);
});

test('buildShowcaseCommand carries the server-side contract fields', () => {
  const command = buildShowcaseCommand({ template, answers: { brandName: 'Acme' } });
  assert.equal(command.templateId, template.id);
  assert.equal(command.templateVersion, template.templateVersion);
  assert.equal(command.templateSlug, template.slug);
  assert.equal(command.projectName, 'Acme');
  assert.deepEqual(command.preserveFeatures, template.capabilities);
  assert.deepEqual(command.requiredValidation, template.requiredValidation);
  assert.equal(command.github, undefined);
});

const BRANCH_RE = /^xroga\/template-[a-z0-9-]{1,40}-[a-z0-9]{1,8}$/;

test('export branch names match the server allow-list pattern', () => {
  for (const item of SHOWCASE_TEMPLATES) {
    assert.match(exportBranchName(item.slug, 'a1b2c3d4'), BRANCH_RE, item.slug);
  }
});

test('export branch names strip anything that could escape the ref namespace', () => {
  const cases: Array<[string, string]> = [
    ['../../main', 'id'],
    ['a/b', 'id'],
    ['spa ce', 'id'],
    ['semi;colon', 'id'],
    ['UPPER', 'id'],
    ['tilde~1', 'id'],
    ['caret^', 'id'],
    ['q?mark', 'id'],
    ['star*', 'id'],
    ['brack[et]', 'id'],
    ['back\\slash', 'id'],
    ['at@{brace}', 'id'],
    ['dot.dot', 'id'],
  ];
  for (const [slug, id] of cases) {
    const branch = exportBranchName(slug, id);
    assert.match(branch, BRANCH_RE, `${slug} -> ${branch}`);
    for (const forbidden of ['..', ' ', '~', '^', ':', '?', '*', '[', '\\', '@{', '.']) {
      assert.ok(!branch.includes(forbidden), `${branch} still contains ${forbidden}`);
    }
  }
});

test('over-long inputs are truncated, not rejected into an invalid ref', () => {
  const branch = exportBranchName('a'.repeat(120), 'b'.repeat(120));
  assert.match(branch, BRANCH_RE);
  assert.equal(branch, `xroga/template-${'a'.repeat(40)}-${'b'.repeat(8)}`);
});
