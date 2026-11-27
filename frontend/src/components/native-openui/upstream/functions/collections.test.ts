import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Chunk, Find, Includes, MixColor, Reverse, Slice, Take } from './collections';
import { Histogram } from './data';

test('native list helpers operate on bounded local values and preserve their inputs', () => {
  const rows = [{ id: 1, info: { category: 'a' } }, { id: 2, info: { category: 'b' } }];
  assert.equal(Find.fn({ list: rows, field: 'info.category', value: 'b' }), rows[1]);
  assert.equal(Find.fn({ list: rows, field: 'toString', value: 'b' }), null);
  assert.equal(Includes.fn({ list: rows, item: { id: 2, info: { category: 'b' } } }), true);
  assert.deepEqual(Take.fn({ list: rows, n: -1 }), [rows[1]]);
  assert.deepEqual(Reverse.fn({ list: rows }), [rows[1], rows[0]]);
  assert.deepEqual(Chunk.fn({ list: rows, size: 1 }), [[rows[0]], [rows[1]]]);
  assert.deepEqual(rows.map(row => row.id), [1, 2]);
  assert.equal(Slice.fn({ list: 'ABC', start: -2 }), 'BC');
  assert.equal(Chunk.params.safeParse({ list: rows, size: 0 }).success, false);
  assert.equal(Reverse.params.safeParse({ list: Array(161).fill(1) }).success, false);
});

test('histograms include the maximum once and derive counts only from supplied observations', () => {
  assert.deepEqual(Histogram.fn({ values: [-1, 0, 1, 1, 4, 5], bins: 2, min: 0, max: 4 }), [
    { key: '0', value: 3, start: 0, end: 2 },
    { key: '2', value: 1, start: 2, end: 4 },
  ]);
  assert.deepEqual(Histogram.fn({ values: [1, 1], bins: 2 }), [{ key: '1', value: 2, start: 1, end: 1 }]);
  assert.throws(() => Histogram.fn({ values: [1], bins: 2, min: 4, max: 0 }), /maximum/);
  assert.equal(Histogram.params.safeParse({ values: [1], bins: 41 }).success, false);
});

test('color blending emits only a bounded hexadecimal value', () => {
  assert.equal(MixColor.fn({ from: '#000', to: 'ffffff', t: 0.5 }), '#808080');
  assert.equal(MixColor.fn({ from: '#000', to: '#fff', t: 2 }), '#ffffff');
  assert.equal(MixColor.params.safeParse({ from: 'url(https://example.org)', to: '#fff', t: 1 }).success, false);
});
