import { describe, expect, it } from 'vitest';
import { repairToolInput } from '../repair-input';

describe('repairToolInput', () => {
  it('keeps an object as it is', () => expect(repairToolInput({ a: 1 })).toEqual({ a: 1 }));
  it('reads an empty or null argument as no arguments', () => {
    expect(repairToolInput('')).toEqual({});
    expect(repairToolInput('null')).toEqual({});
  });
  it('reads JSON stringified twice', () => expect(repairToolInput(JSON.stringify(JSON.stringify({ url: 'x' })))).toEqual({ url: 'x' }));
  it('reads a fenced block', () => expect(repairToolInput('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it('reads an object surrounded by words, with a trailing comma', () => expect(repairToolInput('Here: {"a":1,"b":[1,2,],} thanks')).toEqual({ a: 1, b: [1, 2] }));
  it('does not cut a brace inside a string', () => expect(repairToolInput('x {"a":"}{"} y')).toEqual({ a: '}{' }));
  it('gives up on a bare word or an array', () => {
    expect(repairToolInput('hello')).toBeUndefined();
    expect(repairToolInput('[1,2]')).toBeUndefined();
  });
});
