import { describe, expect, it } from 'vitest';
import { DragArgsSchema } from '../../browser-control/protocol/schemas';
import { toolsForRun } from '../tools';

const props = (tools: ReturnType<typeof toolsForRun>, name: string) =>
  Object.keys(((tools.find(t => t.name === name)?.parameters ?? {}) as { properties?: Record<string, unknown> }).properties ?? {});

describe('drawing inside a canvas: drag between two points', () => {
  it('drag accepts a point inside each element, as fractions of its box', () => {
    const parsed = DragArgsSchema.parse({ from: { ref: 'e1' }, to: { ref: 'e1' }, fromAt: [0.2, 0.3], toAt: [0.6, 0.7] });
    expect(parsed.fromAt).toEqual([0.2, 0.3]);
    expect(() => DragArgsSchema.parse({ from: { ref: 'e1' }, to: { ref: 'e1' }, fromAt: [1.5, 0] })).toThrow();
  });

  it('the point options are hidden from the base tool list and offered together with click at when pointAt is on', () => {
    const base = toolsForRun({ vision: false });
    expect(props(base, 'click')).not.toContain('at');
    expect(props(base, 'drag')).not.toContain('fromAt');
    const pointing = toolsForRun({ vision: false, pointAt: true });
    expect(props(pointing, 'click')).toContain('at');
    expect(props(pointing, 'drag')).toEqual(expect.arrayContaining(['fromAt', 'toAt']));
  });
});
