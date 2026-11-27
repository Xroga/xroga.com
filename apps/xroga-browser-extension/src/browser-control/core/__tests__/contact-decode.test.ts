import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CONTACT_DECODE_JS } from '../contact-decode';
import { pageDataExpression } from '../page-data';

const fns = runInNewContext(`${CONTACT_DECODE_JS}; ({ decodeCf: decodeCf, deob: deob, junkEmail: junkEmail })`) as { decodeCf(h: string): string; deob(t: string): string; junkEmail(e: string): boolean };

/** What Cloudflare stores for an address: the first byte is the key, each next byte is a character XOR-ed with it. */
const cf = (email: string, key = 0x5a) => key.toString(16).padStart(2, '0') + [...email].map(c => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');

describe('Cloudflare protected addresses', () => {
  it('decodes the hex a page stores, and gives nothing for what is not an address', () => {
    expect(fns.decodeCf(cf('hello@biz.example.org'))).toBe('hello@biz.example.org');
    expect(fns.decodeCf(cf('sales@company.co.uk', 0x12))).toBe('sales@company.co.uk');
    expect(fns.decodeCf('zz')).toBe('');
    expect(fns.decodeCf(cf('not an address'))).toBe('');
  });
});

describe('spelled-out addresses', () => {
  it('turns the usual disguises into addresses', () => {
    expect(fns.deob('write to sales [at] company [dot] com today')).toContain('sales@company.com');
    expect(fns.deob('info(at)shop.co.uk')).toContain('info@shop.co.uk');
    expect(fns.deob('hello&#64;biz.com')).toContain('hello@biz.com');
    expect(fns.deob('contact at acme dot com for details')).toContain('contact@acme.com');
    expect(fns.deob('meet us at the shop at noon')).toBe('meet us at the shop at noon');
  });
});

describe('what only looks like an address', () => {
  it('drops picture names, tracking ids and placeholders, and keeps real ones', () => {
    for (const bad of ['logo@2x.png', 'icon@3x.webp', 'a1b2c3@sentry.io', 'you@example.com', 'name@domain.com', 'f@x.wixpress.com', 'user@test.org']) expect(fns.junkEmail(bad), bad).toBe(true);
    for (const good of ['hello@bakery.co.uk', 'jane.doe@clinic.org', 'info@acme-tools.com']) expect(fns.junkEmail(good), good).toBe(false);
  });
});

describe('in the page script', () => {
  it('carries the decoders into the script that runs in the page', () => {
    const script = pageDataExpression();
    expect(script).toContain('function decodeCf');
    expect(script).toContain('data-cfemail');
    expect(script).toContain('email-protection#');
    expect(script).toContain('deob(body)');
    expect(() => runInNewContext(`(function(){ return typeof document; })`)).not.toThrow();
  });
});

describe('the whole script on a page', () => {
  it('compiles, so the injected decoders have no syntax error', () => {
    // the script is an expression for the page; compiled here (not run: there is no document) to prove its text is valid
    expect(() => new (require('node:vm').Script)(pageDataExpression())).not.toThrow();
  });
});
