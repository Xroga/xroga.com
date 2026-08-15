import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  extractJson,
  generateStructured,
  objectValidator,
  type SchemaValidator,
} from './structuredOutput.js';

const requiresName: SchemaValidator<{ name: string }> = (value) => {
  if (typeof value !== 'object' || value === null) {
    return { valid: false, error: 'expected an object' };
  }
  const name = (value as { name?: unknown }).name;
  if (typeof name !== 'string') return { valid: false, error: 'field "name" must be a string' };
  return { valid: true, value: { name } };
};

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

test('plain JSON parses', () => {
  assert.deepEqual(extractJson('{"name":"ada"}'), { name: 'ada' });
});

test('fenced JSON parses', () => {
  // Models fence JSON however firmly they are asked not to. Spending a repair round on
  // formatting rather than substance is waste.
  assert.deepEqual(extractJson('```json\n{"name":"ada"}\n```'), { name: 'ada' });
  assert.deepEqual(extractJson('```\n{"name":"ada"}\n```'), { name: 'ada' });
});

test('JSON surrounded by prose parses', () => {
  assert.deepEqual(extractJson('Sure! Here it is:\n{"name":"ada"}\nHope that helps.'), {
    name: 'ada',
  });
});

test('arrays parse', () => {
  assert.deepEqual(extractJson('[1,2,3]'), [1, 2, 3]);
});

test('genuinely unparseable content returns undefined rather than throwing', () => {
  assert.equal(extractJson('I cannot help with that.'), undefined);
  assert.equal(extractJson(''), undefined);
});

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

test('valid JSON on the first attempt needs no repair', async () => {
  let calls = 0;
  const result = await generateStructured({
    validate: requiresName,
    attempt: async () => { calls += 1; return '{"name":"ada"}'; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, { name: 'ada' });
  assert.equal(result.repairs, 0);
  assert.equal(calls, 1);
});

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

test('malformed JSON is repaired, and the hint says what was wrong', async () => {
  const hints: (string | undefined)[] = [];
  const result = await generateStructured({
    validate: requiresName,
    attempt: async (hint) => {
      hints.push(hint);
      return hints.length === 1 ? 'not json at all' : '{"name":"ada"}';
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.repairs, 1);
  assert.equal(hints[0], undefined, 'the first attempt carries no repair hint');
  assert.match(hints[1]!, /not valid JSON/);
});

test('a schema mismatch is repaired using the validator\'s own message', async () => {
  // The model already had the schema; what it lacked was what was wrong with its answer.
  const hints: (string | undefined)[] = [];
  const result = await generateStructured({
    validate: requiresName,
    attempt: async (hint) => {
      hints.push(hint);
      return hints.length === 1 ? '{"nome":"ada"}' : '{"name":"ada"}';
    },
  });
  assert.equal(result.ok, true);
  assert.match(hints[1]!, /field "name" must be a string/);
});

test('an empty reply is repaired', async () => {
  const result = await generateStructured({
    validate: requiresName,
    attempt: async (hint) => (hint ? '{"name":"ada"}' : '   '),
  });
  assert.equal(result.ok, true);
  assert.equal(result.repairs, 1);
});

// ---------------------------------------------------------------------------
// Exhaustion — the expensive failure this module exists to bound
// ---------------------------------------------------------------------------

test('repair is bounded and exhaustion is reported, not thrown', async () => {
  let calls = 0;
  const result = await generateStructured({
    validate: requiresName,
    attempt: async () => { calls += 1; return 'still not json'; },
    maxRepairs: 2,
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'repair_exhausted');
  assert.equal(calls, 3, 'one attempt plus two repairs');
});

test('a model that never conforms cannot spend an unbounded budget', async () => {
  // Failures correlate: a model that cannot produce the schema on attempt one usually cannot
  // on attempt four either, and nothing inside an unbounded loop notices.
  let calls = 0;
  await generateStructured({
    validate: requiresName,
    attempt: async () => { calls += 1; return '{"wrong":true}'; },
    maxRepairs: 99,
  });
  assert.ok(calls <= 4, `made ${calls} calls despite the hard cap`);
});

test('maxRepairs zero means exactly one attempt', async () => {
  let calls = 0;
  const result = await generateStructured({
    validate: requiresName,
    attempt: async () => { calls += 1; return 'nope'; },
    maxRepairs: 0,
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'unparseable');
});

test('the failure carries the reason a human can act on', async () => {
  const result = await generateStructured({
    validate: requiresName,
    attempt: async () => '{"nome":"ada"}',
    maxRepairs: 1,
  });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.detail : '', /name/);
});

// ---------------------------------------------------------------------------
// The convenience validator
// ---------------------------------------------------------------------------

test('objectValidator reports every missing field at once', () => {
  const validate = objectValidator(['a', 'b', 'c']);
  const verdict = validate({ a: 1 });
  assert.equal(verdict.valid, false);
  assert.match(verdict.valid === false ? verdict.error : '', /b, c/);
});

test('objectValidator rejects arrays and nulls with a useful message', () => {
  const validate = objectValidator(['a']);
  assert.match((validate([]) as { error: string }).error, /an array/);
  assert.match((validate(null) as { error: string }).error, /null/);
});
