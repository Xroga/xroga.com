import { describe, expect, it } from 'vitest';
import { redactBody, shownHeaders } from '../diagnostics';

describe('redactBody', () => {
  it('hides secret-looking keys and opaque long strings in JSON, keeps the rest', () => {
    const out = redactBody(JSON.stringify({ user: 'ann', access_token: 'abc', nested: { password: 'p', id: 7, blob: 'x'.repeat(40) }, items: [1, 2] }), 'application/json');
    expect(out).toContain('"user": "ann"');
    expect(out).toContain('"access_token": "[hidden]"');
    expect(out).toContain('"password": "[hidden]"');
    expect(out).toContain('"id": 7');
    expect(out).not.toContain('xxxxxxxx');
  });
  it('cuts a long body and says how long it was', () => {
    expect(redactBody(JSON.stringify({ a: 'y '.repeat(5000) }), 'application/json', 100)).toMatch(/characters\]$/);
  });
  it('flattens non-JSON text and hides opaque strings', () => {
    const out = redactBody('<p>hi</p>  key=' + 'k'.repeat(50), 'text/html');
    expect(out).toContain('<p>hi</p>');
    expect(out).not.toContain('kkkkkkkk');
  });
});

describe('shownHeaders', () => {
  it('shows descriptive headers and never cookies or credentials', () => {
    const lines = shownHeaders({ 'Content-Type': 'application/json', 'Set-Cookie': 'sid=1', Authorization: 'Bearer x', 'Cache-Control': 'no-store' });
    expect(lines.join('\n')).toContain('content-type: application/json');
    expect(lines.join('\n')).toContain('cache-control: no-store');
    expect(lines.join('\n')).not.toMatch(/cookie|authorization/i);
  });
});
