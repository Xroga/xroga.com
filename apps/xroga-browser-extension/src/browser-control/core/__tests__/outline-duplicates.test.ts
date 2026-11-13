import { describe, expect, it } from 'vitest';
import { renderLines, type ONode } from '../perception/outline';

const base = { frameId: 'f', sessionId: 's' as never, loaderId: 'l', states: [], actionable: false, rawRole: '' };
const el = (role: string, name: string, children: ONode[] = [], ref?: string): ONode =>
  ({ ...base, kind: 'element', role, rawRole: role, name, children, ref, actionable: !!ref }) as ONode;
const text = (name: string): ONode => ({ ...base, kind: 'text', role: 'text', name, children: [] }) as ONode;

describe('controls that share a role and a name', () => {
  it('say which row they are in', () => {
    const row = (label: string, ref: string) => el('listitem', '', [text(label), el('button', 'Delete todo', [], ref)]);
    const lines = renderLines([el('list', '', [row('buy milk', 'a1'), row('write report', 'a2')])]).map(l => l.text);
    expect(lines.filter(l => l.includes('Delete todo'))).toEqual([
      '    [a1] button "Delete todo" (in "buy milk")',
      '    [a2] button "Delete todo" (in "write report")',
    ]);
  });

  it('names the row even when the control is the only one of its kind (a button revealed by hovering one row)', () => {
    const lines = renderLines([
      el('list', '', [el('listitem', '', [text('buy milk')]), el('listitem', '', [text('write report'), el('button', 'Delete todo', [], 'a9')])]),
    ]).map(l => l.text);
    expect(lines.find(l => l.includes('Delete todo'))).toBe('    [a9] button "Delete todo" (in "write report")');
  });

  it('leaves a control with a unique name alone', () => {
    const lines = renderLines([el('main', 'Page', [el('button', 'Save', [], 'a1'), el('button', 'Cancel', [], 'a2')])]).map(l => l.text);
    expect(lines.join('\n')).not.toContain('(in ');
  });
});
