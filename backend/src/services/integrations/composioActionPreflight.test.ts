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
