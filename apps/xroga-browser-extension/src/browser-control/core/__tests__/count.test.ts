import { describe, expect, it } from 'vitest';
import { countMatching, describeQuery } from '../interaction/count';
import { ExpectationSchema } from '../../protocol/schemas';
import type { ONode } from '../perception/outline';

const node = (role: string, name: string, children: ONode[] = [], kind: 'element' | 'text' = 'element'): ONode =>
  ({ kind, role, rawRole: role, name, states: [], actionable: false, frameId: 'f', sessionId: 's', loaderId: 'l', children }) as unknown as ONode;

const page: ONode[] = [
  node('heading', 'Customers'),
  node('list', 'Rows', [node('listitem', 'Row 1 Ada'), node('listitem', 'Row 2 Grace'), node('listitem', 'Row 3 Ada')]),
  node('table', 'People', [node('row', 'Ada Lovelace', [node('cell', 'Ada Lovelace')]), node('row', 'Grace Hopper')]),
  node('status', 'Saved Ada', [node('statictext', 'Saved Ada', [], 'text')], 'element'),
];

describe('counting what a page shows', () => {
  it('counts every element with a role, not only the ones that can be acted on', () => {
    expect(countMatching(page, { role: 'listitem' })).toBe(3);
    expect(countMatching(page, { role: 'row' })).toBe(2);
    expect(countMatching(page, { role: 'LISTITEM' })).toBe(3);
  });

  it('matches the name as contained text, ignoring case and spacing, and combines with a role', () => {
    expect(countMatching(page, { role: 'listitem', name: 'ada' })).toBe(2);
    expect(countMatching(page, { role: 'listitem', name: '  row   2 ' })).toBe(1);
    expect(countMatching(page, { name: 'ada lovelace' })).toBe(2);
  });

  it('with a role, finds a name in the text inside an element whose own name is empty, but a name alone does not count the containers', () => {
    const list = [node('list', '', [node('listitem', '', [node('statictext', 'Row 3 Alan', [], 'text')]), node('listitem', '', [node('statictext', 'Row 4 Grace', [], 'text')])])];
    expect(countMatching(list, { role: 'listitem', name: 'row 3' })).toBe(1);
    expect(countMatching(list, { role: 'listitem', name: 'row' })).toBe(2);
    expect(countMatching(list, { role: 'list', name: 'row 4' })).toBe(1);
    // A name alone only looks at an element's own name: neither the list nor the items have one.
    expect(countMatching(list, { name: 'row 3' })).toBe(0);
  });

  it('finds nothing for an empty query or a missing element, and never counts plain text nodes', () => {
    expect(countMatching(page, {})).toBe(0);
    expect(countMatching(page, { role: 'listitem', name: 'nobody' })).toBe(0);
    expect(countMatching([node('x', 'Saved', [], 'text')], { name: 'saved' })).toBe(0);
  });

  it('describes a query for a failure message', () => {
    expect(describeQuery({ role: 'listitem', name: 'Row 2' })).toBe('listitem "Row 2"');
    expect(describeQuery({ role: 'row' })).toBe('row');
    expect(describeQuery({})).toBe('element');
  });
});

describe('the postconditions exists and count', () => {
  it('accepts a role, a name or both, and the three bounds', () => {
    expect(ExpectationSchema.safeParse({ exists: { role: 'row' } }).success).toBe(true);
    expect(ExpectationSchema.safeParse({ exists: { name: 'Ada' } }).success).toBe(true);
    expect(ExpectationSchema.safeParse({ count: { role: 'listitem', equals: 4 } }).success).toBe(true);
    expect(ExpectationSchema.safeParse({ count: { role: 'listitem', atLeast: 1, atMost: 9 } }).success).toBe(true);
    expect(ExpectationSchema.safeParse({ text: 'Saved', count: { name: 'Ada', atLeast: 1 } }).success).toBe(true);
  });

  it('refuses an empty query, a count without a bound, a negative bound and unknown keys', () => {
    expect(ExpectationSchema.safeParse({ exists: {} }).success).toBe(false);
    expect(ExpectationSchema.safeParse({ count: { role: 'row' } }).success).toBe(false);
    expect(ExpectationSchema.safeParse({ count: { role: 'row', equals: -1 } }).success).toBe(false);
    expect(ExpectationSchema.safeParse({ count: { role: 'row', equals: 1, sneaky: true } }).success).toBe(false);
    expect(ExpectationSchema.safeParse({ exists: { role: 'row', eval: 'x' } }).success).toBe(false);
  });
});
