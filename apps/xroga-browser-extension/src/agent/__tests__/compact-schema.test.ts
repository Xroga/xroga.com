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
    // 0.84 until the diagnostics tool, wait.reading and count.delta (about 1,000 characters, served from the provider's prompt cache) were added.
    // 0.875 with the enabled and attribute postconditions (about 200 characters across the tools that take expect).
    // 0.89 with within taking `dialog "Name"` (a container named by role and part of its name, about 450 characters across the tools that take a semantic target).
    expect(size(tools)).toBeLessThan(32_064 * 0.89);
  });

  it('offers the at option of click only to a run that asks for it', () => {
    expect(json).not.toContain('"at"');
    const withAt = toolsForRun({ vision: false, pointAt: true }).find(t => t.name === 'click')!;
    expect(JSON.stringify(withAt.parameters)).toContain('"at"');
  });

  it('leaves other schemas alone', () => {
    expect(compactSchema({ type: 'object', properties: { a: { type: 'string' } } })).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
  });
});
