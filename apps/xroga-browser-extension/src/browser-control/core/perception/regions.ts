// A dense page (an ads manager, an admin dashboard, a long form app) holds many forms, menus, dialogs and tables at once, and a model reading one long outline
// picks the wrong one. This lists the page's regions (dialogs first, then forms, navigation, tables, toolbars, tab lists, main areas) with how many controls each
// holds, so the next call can be scoped to one: snapshot scope or `within` of `dialog "Name"`. Only for pages with many controls; a small page needs no map.
import type { ONode } from './outline';

const REGION_ROLES = new Set(['dialog', 'alertdialog', 'form', 'navigation', 'table', 'grid', 'treegrid', 'toolbar', 'tablist', 'menu', 'main', 'complementary', 'region', 'search', 'banner', 'listbox']);
const ORDER = ['dialog', 'alertdialog', 'form', 'menu', 'tablist', 'toolbar', 'table', 'grid', 'treegrid', 'listbox', 'navigation', 'search', 'main', 'complementary', 'region', 'banner'];
export const DENSE_REFS = 80;

interface Region { role: string; name: string; controls: number; fields: number }

function count(n: ONode): { controls: number; fields: number } {
  let controls = 0, fields = 0;
  const walk = (x: ONode) => {
    if (x.kind === 'element' && x.ref) {
      controls++;
      if (['textbox', 'combobox', 'checkbox', 'radio', 'switch', 'spinbutton', 'slider', 'searchbox'].includes(x.role)) fields++;
    }
    x.children.forEach(walk);
  };
  walk(n);
  return { controls, fields };
}

export function pageRegions(roots: ONode[]): Region[] {
  const out: Region[] = [];
  const visit = (n: ONode, depth: number) => {
    if (n.kind === 'element' && REGION_ROLES.has(n.role) && (n.name || n.role === 'dialog' || n.role === 'form' || n.role === 'table')) {
      const c = count(n);
      if (c.controls >= 2) out.push({ role: n.role, name: n.name, ...c });
    }
    if (depth < 8) n.children.forEach(c => visit(c, depth + 1));
  };
  roots.forEach(r => visit(r, 0));
  return out.sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || b.controls - a.controls);
}

/** The lines to add to a dense page's snapshot, or an empty array. */
export function regionsNote(roots: ONode[], refCount: number): string[] {
  if (refCount < DENSE_REFS) return [];
  const regions = pageRegions(roots).slice(0, 14);
  if (regions.length < 2) return [];
  const q = (s: string) => JSON.stringify(s.length > 50 ? `${s.slice(0, 49)}…` : s);
  return [
    `This page is dense (${refCount} controls). Regions: ${regions.map(r => `${r.role}${r.name ? ` ${q(r.name)}` : ''} (${r.controls} controls${r.fields ? `, ${r.fields} fields` : ''})`).join('; ')}.`,
    'Work inside the region that holds your target: snapshot with scope or a target with within, written as dialog "Name" or form "Name". A dialog that is open comes first.',
  ];
}
