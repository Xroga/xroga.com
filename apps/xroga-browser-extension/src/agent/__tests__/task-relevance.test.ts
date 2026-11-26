import { describe, expect, it } from 'vitest';
import { rankAppTools, type AppToolInfo } from '@src/xroga/plugins';
import { Guards } from '../guards';

const tool = (slug: string, toolkit: string, description = ''): AppToolInfo => ({ slug, toolkit, description, kind: 'write', parameters: { type: 'object', properties: {} } });

describe('only task-relevant app tools are offered', () => {
  const apps = ['slack', 'notion', 'gmail', 'hubspot', 'airtable', 'github', 'jira', 'trello', 'asana', 'stripe', 'shopify', 'linear'];
  const many: AppToolInfo[] = apps.flatMap(a => [tool(`${a.toUpperCase()}_LIST_ITEMS`, a, `List items in ${a}`), tool(`${a.toUpperCase()}_CREATE_ITEM`, a, `Create an item in ${a}`), tool(`${a.toUpperCase()}_DELETE_ITEM`, a)]);
  many.push(tool('GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND', 'googlesheets', 'Append rows to a spreadsheet'), tool('GOOGLESHEETS_CREATE_GOOGLE_SHEET1', 'googlesheets', 'Create a spreadsheet'));

  it('puts the tools that fit the task first, with twelve connected apps', () => {
    const r = rankAppTools(many, 'Google Sheets create spreadsheet append rows');
    expect(r.slice(0, 2).map(t => t.slug).sort()).toEqual(['GOOGLESHEETS_CREATE_GOOGLE_SHEET1', 'GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND']);
    expect(r.length).toBeLessThanOrEqual(12);
  });
  it('does not need the app to be named: the action words decide', () => {
    const r = rankAppTools(many, 'append rows to a spreadsheet');
    expect(r[0].toolkit).toBe('googlesheets');
  });
  it('offers only three tools, in provider order, when nothing matches', () => {
    const r = rankAppTools(many, 'zzz qqq');
    expect(r.map(t => t.slug)).toEqual(many.slice(0, 3).map(t => t.slug));
  });
});

describe('loops of wasted work get a changed-strategy note', () => {
  it('notes a repeated tool search, a page opened three times, a repo read four times and duplicate workers', () => {
    const g = new Guards();
    expect(g.record('plugin_search', { query: 'Google Sheets read' }, undefined, false).nudge).toBeUndefined();
    expect(g.record('plugin_search', { query: 'google sheets read ' }, undefined, false).nudge).toMatch(/already run/);
    const n = new Guards();
    for (let i = 0; i < 2; i++) expect(n.record('navigate', { url: 'https://a.com/x#1' }, undefined, false).nudge).toBeUndefined();
    expect(n.record('navigate', { url: 'https://a.com/x#2' }, undefined, false).nudge).toMatch(/3 times/);
    const r = new Guards();
    let note: string | undefined;
    for (const f of ['README.md', 'LICENSE', 'package.json', 'SKILL.md']) note = r.record('http_get', { url: `https://raw.githubusercontent.com/o/r/HEAD/${f}` }, undefined, false).nudge;
    expect(note).toMatch(/repository/);
    const d = new Guards();
    d.record('delegate', { query: 'x' }, undefined, false);
    expect(d.record('delegate', { query: 'x' }, undefined, false).nudge).toMatch(/workers/);
  });
});
