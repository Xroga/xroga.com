import { describe, expect, it } from 'vitest';
import { looksLikeHtml, stripSvg, trimHtml } from '../html-trim';

describe('trimHtml', () => {
  it('removes scripts, styles, comments, drawings and data URIs, and keeps the controls', () => {
    const html = '<html><head><style>body{color:red}</style><script>var secret=1;</script></head><body><!-- a comment --><svg><path d="M0 0"/></svg><img src="data:image/png;base64,AAAA"><button id="go">Go</button></body></html>';
    const out = trimHtml(html);
    for (const gone of ['<style', '<script', 'color:red', 'var secret', '<!--', '<svg', 'base64']) expect(out).not.toContain(gone);
    expect(out).toContain('<button id="go">Go</button>');
  });
  it('removes a nested svg as a whole and keeps lookalike elements', () => {
    expect(stripSvg('a<svg><g><svg><path/></svg></g></svg>b')).toBe('ab');
    expect(stripSvg('a<svg/>b<svgIcon>c</svgIcon>')).toBe('ab<svgIcon>c</svgIcon>');
    expect(stripSvg('a<svg><path/>never closed')).toBe('a<svg><path/>never closed');
  });
  it('collapses blank space and leaves short markup as it was', () => {
    expect(trimHtml('<p>a</p>\n\n\n\n<p>b</p>')).toBe('<p>a</p>\n<p>b</p>');
    expect(trimHtml('<p>h\u00e9llo</p>')).toBe('<p>h\u00e9llo</p>');
  });
  it('knows a web page when it sees one', () => {
    expect(looksLikeHtml('text/html; charset=utf-8', '')).toBe(true);
    expect(looksLikeHtml('application/json', '{"a":1}')).toBe(false);
    expect(looksLikeHtml(undefined, '  <!DOCTYPE html><html>')).toBe(true);
  });
});
