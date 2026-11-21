import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeAssistantCopy } from './assistantCopy';
import { publicAnswerExportText } from './publicAnswerText';

test('copy keeps unquoted schema identifiers across prose and exported TSV', () => {
  const identifiers = 'user_id, tenant_id, role\nsubscriptions\tstripe_customer_id\tstripe_subscription_id';
  assert.equal(serializeAssistantCopy(identifiers), identifiers);
  assert.equal(serializeAssistantCopy('Use _care_ and __caution__, preserve tenant_id and a__b__c.'),
    'Use care and caution, preserve tenant_id and a__b__c.');
});

test('copy preserves underscores and operators in inline code', () => {
  assert.equal(serializeAssistantCopy('Use `tenant_id_for_request` and `a ** b` with **care**.'),
    'Use tenant_id_for_request and a ** b with care.');
});

test('assistant copy removes markdown chrome but preserves exact fenced code', () => {
  const source = '### Result\n\nThis is **ready** with `npm test`.\n\n- One\n- Two\n\n```ts\nconst value = "**literal**";\n```';
  const copied = serializeAssistantCopy(source);
  assert.match(copied, /^Result/m);
  assert.match(copied, /This is ready with npm test\./);
  assert.match(copied, /const value = "\*\*literal\*\*";/);
  assert.doesNotMatch(copied, /### Result|This is \*\*ready\*\*/);
});

test('assistant copy converts markdown tables into readable tab-separated text', () => {
  assert.equal(
    serializeAssistantCopy('| Name | State |\n| --- | --- |\n| Build | **Passed** |'),
    'Name\tState\nBuild\tPassed',
  );
});

test('native copy collapses equivalent tables but keeps unique figures and source URLs', () => {
  const table = '| Plan | Cost | Evidence |\n|---|---:|---|\n| Basic | $10 | [Terms](https://example.org/current) |';
  const duplicate = table.replace('|---|---:|---|', '| --- | --- | --- |');
  const corrected = table.replace('$10', '$11').replace('/current', '/corrected');
  const olderEvidence = table.replace('/current', '/prior');
  const source = [table, 'Unused seats are possible.', duplicate, corrected, olderEvidence].join('\n\n');
  const copy = serializeAssistantCopy(source, { collapseDuplicateTables: true });
  assert.equal((copy.match(/Basic\t\$10\tTerms \(https:\/\/example\.org\/current\)/g) ?? []).length, 1);
  assert.match(copy, /Unused seats are possible/);
  assert.match(copy, /Basic\t\$11\tTerms \(https:\/\/example\.org\/corrected\)/);
  assert.match(copy, /Basic\t\$10\tTerms \(https:\/\/example\.org\/prior\)/);
  assert.equal((serializeAssistantCopy(source).match(/example\.org\/current/g) ?? []).length, 2);
});

test('copy keeps every alternative, nested list indentation, exact links and table cells', () => {
  const source = 'https://example.org/Feature_(product)/_release_?edition=2';
  const markdown = [
    '## Standard', '- Deploy the API', '  - Keep the tenant policy', '',
    '## Recovery', '- Restore the previous image', '    - Save the `rollback_id`', '',
    '| Label | Value | Evidence |', '| --- | --- | --- |',
    '| Plan \\| Restore | 40 people | [Release notes](<' + source + '>) |',
    '| Path C:\\\\ | 0 | [Other](https://example.org/Feature_(three(nested))?x=1) |',
  ].join('\n');
  assert.equal(serializeAssistantCopy(markdown), [
    'Standard', '- Deploy the API', '  - Keep the tenant policy', '',
    'Recovery', '- Restore the previous image', '    - Save the rollback_id', '',
    'Label\tValue\tEvidence', 'Plan | Restore\t40 people\tRelease notes (' + source + ')',
    'Path C:\\\t0\tOther (https://example.org/Feature_(three(nested))?x=1)',
  ].join('\n'));
});

test('copy preserves indentation, embedded fences, and blank lines in literal code', () => {
  const sample = ['    indented example', '', '', '```sh', 'echo "keep **literal**"', '```', '', ''];
  const markdown = ['````md', ...sample, '````'].join('\n');
  assert.equal(serializeAssistantCopy(markdown), sample.join('\n'));
  assert.equal(serializeAssistantCopy('~~~text\n  nested\n\n\n  text\n~~~'), '  nested\n\n\n  text');
});

test('saved research exports omit the private action URL and keep the existing answer', () => {
  const link = '[Review action](/dashboard/actions/confirm/9d2d8830-8daa-4d5e-9b52-6ba547a118b8)';
  const legacy = `Review the exact research request before it is sent: ${link}. No live evidence has been retrieved.`;
  const evidence = 'The official result is [documented](https://example.com/evidence).';
  assert.equal(publicAnswerExportText(`${legacy}\n\n${evidence}`), `This search was awaiting review in Workspace.\n\n${evidence}`);
  assert.equal(serializeAssistantCopy(legacy), 'This search was awaiting review in Workspace.');
  assert.equal(publicAnswerExportText(`You:\nLook up the answer.\n\nXroga:\n${legacy}`),
    'You:\nLook up the answer.\n\nXroga:\nThis search was awaiting review in Workspace.');
  assert.equal(publicAnswerExportText(`Sensitive write requires review. ${link}`), 'Sensitive write requires review. Review in Workspace');
});

test('action export filtering preserves literal code and unrelated external sources', () => {
  const example = '[Review action](/dashboard/actions/confirm/9d2d8830-8daa-4d5e-9b52-6ba547a118b8)';
  const markdown = ['Routing example: `' + example + '`', '', '```md', example, '```', '', example.replace('(/dashboard/', '(https://docs.example/dashboard/')].join('\n');
  assert.equal(publicAnswerExportText(markdown), markdown);
});
