import { describe, expect, it } from 'vitest';
import { shapeBody } from '../plugins';

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
