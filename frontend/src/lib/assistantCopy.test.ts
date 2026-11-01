import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeAssistantCopy } from './assistantCopy';

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
