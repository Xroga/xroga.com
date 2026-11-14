import assert from 'node:assert/strict';
import test from 'node:test';
import { composioActionInputProblem } from './composioActionPreflight.js';

const append = 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND';
const values = [[1, 'A'], [2, 'B'], [3, 'C']];

test('sheets append requires a spreadsheet and range even if the schema lacks minLength', () => {
  const schema = { required: ['spreadsheetId', 'range', 'values'] };
  const request = 'Append three rows to the new sheet';
  assert.match(composioActionInputProblem(append, { spreadsheetId: '', range: '  ', values }, schema, request) ?? '', /Which spreadsheet and tab or range/);
  assert.match(composioActionInputProblem(append, { spreadsheetId: 'sheet-id', values }, schema, request) ?? '', /Which spreadsheet and tab or range/);
  assert.equal(composioActionInputProblem(append, { spreadsheetId: 'sheet-id', range: 'Sheet1!A:B', values }, schema, request), null);
});

test('a Sheets append cannot be approved as a request to create three tables', () => {
  const args = { spreadsheetId: 'sheet-id', range: 'Sheet1!A:B', values };
  assert.match(composioActionInputProblem(append, args, {}, 'Create three tables with these values') ?? '', /Appending rows does not create tables/);
});

test('required fields and nested values are checked on any app without rewriting data', () => {
  const schema = { type: 'object', required: ['channel', 'options'], properties: {
    channel: { type: 'string' },
    options: { type: 'object', required: ['send'], properties: { send: { type: 'boolean' } } },
    note: { type: 'string' },
  } };
  const args = { channel: ' ', options: { send: 'false' }, note: '' };
  assert.match(composioActionInputProblem('EXAMPLE_SEND', args, schema, '') ?? '', /channel.*send/);
  assert.match(composioActionInputProblem('EXAMPLE_SEND', { options: {} }, schema, '') ?? '', /channel.*send/);
  assert.deepEqual(args, { channel: ' ', options: { send: 'false' }, note: '' });
  assert.equal(composioActionInputProblem('EXAMPLE_SEND', { channel: 'my-channel', options: { send: false }, note: '' }, schema, ''), null);
});

test('accepts alternative argument shapes without choosing an account or modifying values', () => {
  const schema = { anyOf: [{ required: ['id'] }, { required: ['url'] }] };
  assert.equal(composioActionInputProblem('EXAMPLE_UPDATE', { url: 'https://example.com/item' }, schema, ''), null);
  assert.ok(composioActionInputProblem('EXAMPLE_UPDATE', {}, schema, ''));
});

test('returns a bounded clarification without provider-controlled field labels', () => {
  const root = { required: ['`<untrusted field>`'] };
  assert.match(composioActionInputProblem('EXAMPLE_UPDATE', {}, root, '') ?? '', /^Please clarify/);
  const branches = { anyOf: Array.from({ length: 33 }, () => ({})) };
  assert.match(composioActionInputProblem('EXAMPLE_UPDATE', {}, branches, '') ?? '', /couldn’t safely check/);
});

test('oneOf rejects overlapping alternatives while anyOf accepts them', () => {
  const branches = [{ required: ['id'] }, { required: ['url'] }];
  const ambiguous = { id: '123', url: 'https://example.com/123' };
  assert.match(composioActionInputProblem('EXAMPLE_UPDATE', ambiguous, { oneOf: branches }, '') ?? '', /Please clarify/);
  assert.equal(composioActionInputProblem('EXAMPLE_UPDATE', ambiguous, { anyOf: branches }, ''), null);
  assert.equal(composioActionInputProblem('EXAMPLE_UPDATE', { id: '123' }, { oneOf: branches }, ''), null);
  assert.match(composioActionInputProblem('EXAMPLE_UPDATE', {}, { oneOf: branches }, '') ?? '', /Please provide|Please clarify/);
});

test('common numeric bounds, maximum lengths, sizes and unknown-property rejection', () => {
  const schema = { type: 'object', required: ['budget', 'title', 'items'], additionalProperties: false, properties: {
    budget: { type: 'number', minimum: 1, maximum: 100 },
    title: { type: 'string', minLength: 2, maxLength: 10 },
    items: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'integer', minimum: 1 } },
  } };
  assert.equal(composioActionInputProblem('EXAMPLE_CREATE', { budget: 50, title: 'Campaign', items: [1, 2] }, schema, ''), null);
  assert.match(composioActionInputProblem('EXAMPLE_CREATE', { budget: 0, title: 'Too long for title', items: [1, 2, 3, 4] }, schema, '') ?? '', /budget|title|items/);
  assert.match(composioActionInputProblem('EXAMPLE_CREATE', { budget: 50, title: 'Valid', items: [1], unknown: 'unsafe' }, schema, '') ?? '', /unknown/);
  assert.match(composioActionInputProblem('EXAMPLE_CREATE', { budget: 50, title: 'Valid', items: [0] }, schema, '') ?? '', /items/);
});

test('exclusive numeric boundaries remain fail-closed at the limit', () => {
  const schema = { type: 'object', required: ['bid'], properties: { bid: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 } } };
  assert.match(composioActionInputProblem('EXAMPLE_BID', { bid: 0 }, schema, '') ?? '', /bid/);
  assert.match(composioActionInputProblem('EXAMPLE_BID', { bid: 10 }, schema, '') ?? '', /bid/);
  assert.equal(composioActionInputProblem('EXAMPLE_BID', { bid: 5 }, schema, ''), null);
});
