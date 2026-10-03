import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeAssistantCopy } from './assistantCopy';

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
