import { describe, expect, it } from 'vitest';
import { allows, normalizePolicy } from '../url-policy';

const policy = normalizePolicy({
  allow: [],
  deny: [],
  publicHttps: true,
  publicOnly: { domain: 'xroga.com', paths: ['/', '/pricing', '/docs', '/blog'] },
});

describe('public pages of a domain whose app is blocked', () => {
  it('opens the home page and public pages, with or without www', () => {
    expect(allows(policy, 'https://xroga.com/')).toBe(true);
    expect(allows(policy, 'https://xroga.com')).toBe(true);
    expect(allows(policy, 'https://www.xroga.com/pricing')).toBe(true);
    expect(allows(policy, 'https://xroga.com/docs/getting-started?x=1')).toBe(true);
    expect(allows(policy, 'https://xroga.com/BLOG/post')).toBe(true);
  });

  it('blocks the app, sign-in, account, API and share routes', () => {
    for (const path of ['/workspace', '/workspace/abc', '/auth/login', '/dashboard', '/admin', '/api/x', '/share/token', '/pricingx']) {
      expect(allows(policy, `https://xroga.com${path}`), path).toBe(false);
    }
  });

  it('blocks every other subdomain', () => {
    expect(allows(policy, 'https://api.xroga.com/')).toBe(false);
    expect(allows(policy, 'https://app.xroga.com/pricing')).toBe(false);
  });

  it('leaves other sites to the remaining rules', () => {
    expect(allows(policy, 'https://example.com/')).toBe(true);
    expect(allows(policy, 'https://notxroga.com/workspace')).toBe(true);
    expect(allows(policy, 'http://example.com/')).toBe(false);
  });

  it('survives normalization', () => {
    expect(normalizePolicy(policy).publicOnly).toEqual(policy.publicOnly);
  });
});
