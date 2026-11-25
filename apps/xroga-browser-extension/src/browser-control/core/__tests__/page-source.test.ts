import { describe, expect, it } from 'vitest';
import { cleanSource, linkLine } from '../page-source';

describe('cleanSource', () => {
  const html = `<!-- note --><html><head><meta name="csrf-token" content="abcDEF123"><script>var secret = 1;</script><style>a{}</style></head>
  <body><form id="login" class="f"><input type="password" name="pw" value="hunter2"><input type="hidden" name="t" value='tok-123'><textarea name="n">my private text</textarea>
  <a href="/orders?id=7" data-api-key="k-999">Orders</a><button id="go" nonce="xyz">Go</button></form><svg><path d="M0"/></svg>
  <p>Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk and ${'a1'.repeat(25)}</p></body></html>`;
  const out = cleanSource(html);
  it('removes scripts, styles, drawings and comments', () => {
    expect(out).not.toMatch(/var secret|a\{\}|M0|note/);
  });
  it('never shows a field value, a textarea text, a token in a meta, an attribute key or a nonce', () => {
    expect(out).not.toMatch(/hunter2|tok-123|private text|abcDEF123|k-999|xyz/);
    expect(out).toContain('name="pw"');
    expect(out).toContain('content="[hidden]"');
  });
  it('keeps what a locator needs: ids, classes, names, link targets and text', () => {
    expect(out).toContain('id="login"');
    expect(out).toContain('href="/orders?id=7"');
    expect(out).toContain('>Orders</a>');
    expect(out).toContain('id="go"');
  });
  it('hides a bearer token and a long opaque string', () => {
    expect(out).not.toMatch(/eyJhbGci|a1a1a1a1a1a1a1a1a1a1a1a1a1a1/);
  });
});

describe('linkLine', () => {
  it('shows the words and the address, leaves out addresses that go nowhere, and hides long opaque strings', () => {
    expect(linkLine('  Guide  (PDF) ', 'https://a.test/docs/guide.pdf')).toBe('«Guide (PDF)» → https://a.test/docs/guide.pdf');
    expect(linkLine('x', 'javascript:void(0)')).toBeUndefined();
    expect(linkLine('x', 'data:text/html,hi')).toBeUndefined();
    expect(linkLine('Magic', 'https://a.test/login?token=' + 'k'.repeat(50))).toBe('«Magic» → https://a.test/login?token=…');
    expect(linkLine('', 'mailto:a@b.test')).toBe('«(no text)» → mailto:a@b.test');
  });
});
