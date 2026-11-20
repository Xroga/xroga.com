import { describe, expect, it } from 'vitest';
import { identify, matchSite, renderWhy, validateRule } from '../site-context';
import { searchSkills } from '../skill-catalog';

const match = (rule: Parameters<typeof matchSite>[0], url: string) => matchSite(rule, identify(url)!).matched;

describe('identify', () => {
  it('parses origin, host, port, path and locale, and refuses non-web or credentialed addresses', () => {
    expect(identify('https://Ads.Google.com:443/aw/campaigns?x=1')).toMatchObject({ origin: 'https://ads.google.com', host: 'ads.google.com', path: '/aw/campaigns' });
    expect(identify('https://shop.example.com/en-US/cart')?.locale).toBe('en-US');
    expect(identify('chrome://extensions')).toBeNull();
    expect(identify('about:blank')).toBeNull();
    expect(identify('https://user:pass@example.com/')).toBeNull();
    expect(identify('not a url')).toBeNull();
  });
});

describe('matchSite', () => {
  const rule = { host: 'example.com' };
  it('matches the host and its subdomains on a label boundary only', () => {
    expect(match(rule, 'https://example.com/')).toBe(true);
    expect(match(rule, 'https://app.example.com/x')).toBe(true);
    expect(match(rule, 'https://fake-example.com/')).toBe(false);
    expect(match(rule, 'https://example.com.evil.test/')).toBe(false);
    expect(match(rule, 'https://evilexample.com/')).toBe(false);
    expect(match(rule, 'https://evil.test/example.com')).toBe(false);
    expect(match(rule, 'https://notexample.com/')).toBe(false);
  });
  it('explicit subdomain policy', () => {
    expect(match({ host: 'example.com', subdomains: 'exact' }, 'https://app.example.com/')).toBe(false);
    expect(match({ host: 'example.com', subdomains: 'listed', allowedSubdomains: ['admin'] }, 'https://admin.example.com/')).toBe(true);
    expect(match({ host: 'example.com', subdomains: 'listed', allowedSubdomains: ['admin'] }, 'https://other.example.com/')).toBe(false);
  });
  it('plain http never activates a site rule by default, and ports are ignored for host identity', () => {
    expect(match(rule, 'http://example.com/')).toBe(false);
    expect(match({ host: 'example.com', schemes: ['https', 'http'] }, 'http://example.com/')).toBe(true);
    expect(match(rule, 'https://example.com:8443/')).toBe(true);
  });
  it('path prefix on a segment boundary and locale rules', () => {
    const p = { host: 'example.com', pathPrefix: '/admin' };
    expect(match(p, 'https://example.com/admin')).toBe(true);
    expect(match(p, 'https://example.com/admin/users')).toBe(true);
    expect(match(p, 'https://example.com/administrator')).toBe(false);
    expect(match({ host: 'example.com', locales: ['en', 'en-US'] }, 'https://example.com/en/home')).toBe(true);
    expect(match({ host: 'example.com', locales: ['en'] }, 'https://example.com/de/home')).toBe(false);
    expect(match({ host: 'example.com', locales: ['en'] }, 'https://example.com/home')).toBe(false);
  });
  it('rejects malformed rules instead of matching broadly', () => {
    expect(validateRule({ host: '*.example.com' })).toContain('plain');
    expect(validateRule({ host: 'localhost' })).toContain('dot');
    expect(validateRule({ host: 'Example.com' })).toContain('lower');
    expect(matchSite({ host: 'com' }, identify('https://example.com/')!).matched).toBe(false);
  });
});

describe('the skill catalog uses the strict matcher', () => {
  const top = (url: string) => searchSkills('set this up for me', { url })[0]?.card.id;
  it('activates a site skill on the real site and its subdomains', () => {
    expect(top('https://ads.google.com/aw/overview')).toBe('google-ads-search-campaigns');
    expect(top('https://admin.shopify.com/store/x')).toBe('shopify-store-admin');
    expect(top('https://shop.myshopify.com/admin')).toBe('shopify-store-admin');
  });
  it('does NOT activate on look-alike hosts (the substring bug)', () => {
    for (const bad of ['https://ads.google.com.evil.test/', 'https://fakeads.google.com.attacker.io/', 'https://evil-ads.google.com.test/', 'https://notshopify.com/', 'http://ads.google.com/']) {
      expect(searchSkills('set this up for me', { url: bad })).toEqual([]);
    }
  });
});

describe('renderWhy', () => {
  it('is a short receipt without page content', () => {
    const t = renderWhy({ user_goal: 'update the deal', site: 'app.hubspot.com', evidence: 'host matches', capability: 'crm-records', permissions: 'write needs approval', expected_result: 'deal stage changed', verification: 're-read the record' });
    expect(t).toContain('Why selected');
    expect(t.length).toBeLessThan(400);
  });
});
