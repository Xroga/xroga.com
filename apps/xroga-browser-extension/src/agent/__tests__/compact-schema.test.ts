import { describe, expect, it } from 'vitest';
import { compactSchema, toolsForRun } from '../tools';

const size = (list: { name: string; description: string; parameters: unknown }[]) =>
  JSON.stringify(list.map(t => [t.name, t.description, t.parameters])).length;

describe('compactSchema', () => {
  const tools = toolsForRun({ vision: false });
  const click = tools.find(t => t.name === 'click')!;
  const json = JSON.stringify(click.parameters);

  it('removes the language-limit bounds, the timeout and the selector and coordinate targets', () => {
    expect(json).not.toContain('9007199254740991');
    expect(json).not.toContain('timeoutMs');
    expect(json).not.toContain('"selector"');
    expect(json).not.toContain('"x"');
  });

  it('keeps what the model needs to point at an element', () => {
    expect(json).toContain('"ref"');
    expect(json).toContain('"role"');
    expect(json).toContain('"name"');
    expect((click.parameters as { required?: string[] }).required).toContain('target');
  });

  it('keeps wait\'s timeout', () => {
    expect(JSON.stringify(tools.find(t => t.name === 'wait')!.parameters)).toContain('timeoutMs');
  });

  it('makes the full tool catalogue smaller than the 32,064 characters it was by about a fifth', () => {
    expect(size(tools)).toBeLessThan(32_064 * 0.84);
  });

  it('leaves other schemas alone', () => {
    expect(compactSchema({ type: 'object', properties: { a: { type: 'string' } } })).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
  });
});
