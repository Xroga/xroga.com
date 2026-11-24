import { describe, expect, it, vi } from 'vitest';
const sent: unknown[] = [];
vi.mock('../bridge', () => ({ workspaceRequest: async (_kind: string, payload: { body: unknown }) => { sent.push(payload.body); return { status: 200, contentType: 'text/html', finalUrl: 'https://a.test/', body: '<h1>Hi</h1>'+String.fromCharCode(10)+'line two' }; } }));

import { runPublicGet, shapeBody } from '../plugins';

describe('shapeBody', () => {
  const md = ['# Title', 'intro', '## Pricing', 'Starter 10 pounds', 'Pro 30 pounds', '## Contact', 'mail us'].join('\n');
  it('outlines headings of markdown and html', () => {
    expect(shapeBody(md, { outline: true })).toBe('1: # Title\n3: ## Pricing\n6: ## Contact');
    expect(shapeBody('<h1>Hi <b>there</b></h1><p>x</p>\n<h2 class="a">More</h2>', { outline: true })).toContain('1: Hi there');
  });
  it('outlines JSON by its top-level keys or array shape', () => {
    expect(shapeBody('{"a":[1,2],"b":{"c":1},"d":"x"}', { outline: true })).toBe('a: array of 2\nb: object\nd: string');
    expect(shapeBody('[{"id":1,"name":"x"}]', { outline: true })).toContain('first item keys: id, name');
  });
  it('filters lines with one line of context, case-insensitively', () => {
    expect(shapeBody(md, { filter: 'PRO ' })).toBe('4: Starter 10 pounds\n5: Pro 30 pounds\n6: ## Contact');
    expect(shapeBody(md, { filter: 'nothing' })).toContain('no line contains');
  });
  it('returns the body unchanged without options', () => {
    expect(shapeBody(md, {})).toBe(md);
  });
});

describe('http_get request body', () => {
  it('carries only the address to the server, and applies outline and filter to the answer', async () => {
    sent.length = 0;
    const wrap = (text: string) => text;
    const out = await runPublicGet('run-1', { url: 'https://a.test/', intent: 'read it', outline: true, filter: undefined }, new AbortController().signal, wrap);
    expect(sent).toEqual([{ url: 'https://a.test/' }]);
    expect(out.text).toContain('1: Hi');
    const filtered = await runPublicGet('run-1', { url: 'https://a.test/', intent: 'x', filter: 'line two' }, new AbortController().signal, wrap);
    expect(sent[1]).toEqual({ url: 'https://a.test/' });
    expect(filtered.text).toContain('2: line two');
  });
});
