import { describe, expect, it } from 'vitest';
import { pageRegions, regionsNote, DENSE_REFS } from '../regions';
import type { ONode } from '../outline';

const el = (role: string, name: string, children: ONode[] = [], ref?: string): ONode =>
  ({ kind: 'element', role, rawRole: role, name, states: [], actionable: !!ref, ref, frameId: 'f', children }) as unknown as ONode;
const controls = (n: number, role = 'button') => Array.from({ length: n }, (_, i) => el(role, `c${i}`, [], `a${i}`));

describe('page regions', () => {
  const page = [el('RootWebArea', 'Ads', [
    el('navigation', 'Main menu', controls(12, 'link')),
    el('main', 'Campaigns', [el('table', 'Campaign list', controls(30)), el('form', 'Budget', controls(6, 'textbox'))]),
    el('dialog', 'Link WhatsApp Business Account', controls(4)),
  ])];

  it('lists dialogs first, then forms, tables and areas, with control counts', () => {
    const r = pageRegions(page);
    expect(r[0]).toMatchObject({ role: 'dialog', name: 'Link WhatsApp Business Account', controls: 4 });
    expect(r.map(x => x.role)).toEqual(['dialog', 'form', 'table', 'navigation', 'main']);
    expect(r.find(x => x.role === 'form')).toMatchObject({ fields: 6 });
  });

  it('adds a note only for a dense page, naming how to scope to a region', () => {
    expect(regionsNote(page, DENSE_REFS - 1)).toEqual([]);
    const note = regionsNote(page, 150);
    expect(note[0]).toMatch(/dense \(150 controls\).*dialog "Link WhatsApp Business Account" \(4 controls\)/);
    expect(note[1]).toMatch(/scope or a target with within/);
    expect(regionsNote([el('RootWebArea', 'x', controls(3))], 200)).toEqual([]);
  });
});
