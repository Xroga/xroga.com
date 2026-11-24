import { describe, expect, it } from 'vitest';
import type { PageAudit } from '../../../probe/source';
import { auditIssues, describeAudit } from '../audit-page';

const good: PageAudit = {
  url: 'https://x.test/',
  https: true,
  title: 'A good page title for the test',
  description: 'A description that is long enough to be useful in a search result snippet, well under the limit.',
  canonical: 'https://x.test/',
  robots: null,
  lang: 'en',
  viewport: true,
  h1: ['One heading'],
  headings: { h2: 3, h3: 2 },
  words: 900,
  images: { total: 4, noAlt: 0, lazy: 2 },
  links: { internal: 20, external: 3, nofollow: 1, noText: 0 },
  social: { ogTitle: true, ogImage: true, twitterCard: true },
  structuredData: ['Organization'],
  hreflang: 0,
  forms: { total: 1, unlabelled: 0 },
  buttonsNoName: 0,
  mixedContent: 0,
  perf: { ttfbMs: 200, fcpMs: 900, lcpMs: 1800, cls: 0.02, domNodes: 400, transferKb: 800, requests: 30 },
};

describe('auditIssues', () => {
  it('finds nothing in a healthy page', () => {
    expect(auditIssues(good)).toEqual([]);
    expect(describeAudit(good).at(-1)).toBe('No findings.');
  });

  it('lists problems before warnings', () => {
    const issues = auditIssues({ ...good, description: null, canonical: null, images: { total: 4, noAlt: 3, lazy: 0 }, perf: { ...good.perf, lcpMs: 3000 } });
    expect(issues.map(i => i.level)).toEqual(['problem', 'problem', 'warning', 'warning']);
    expect(issues[0].text).toMatch(/meta description|alt/);
  });

  it('flags noindex, missing h1, mixed content, https, slow paint and layout shift with the right severity', () => {
    const text = auditIssues({ ...good, https: false, robots: 'noindex,follow', h1: [], mixedContent: 2, perf: { ...good.perf, lcpMs: 5200, cls: 0.4 } })
      .map(i => `${i.level}:${i.text}`)
      .join('\n');
    expect(text).toMatch(/problem:robots meta says "noindex,follow"/);
    expect(text).toMatch(/problem:No <h1>/);
    expect(text).toMatch(/problem:Not served over https/);
    expect(text).toMatch(/problem:2 resources load over http/);
    expect(text).toMatch(/problem:Largest contentful paint 5200/);
    expect(text).toMatch(/problem:Layout shift 0.4/);
  });

  it('treats a missing measurement as unknown, not as a failure', () => {
    const lines = describeAudit({ ...good, perf: { domNodes: 400 } });
    expect(lines.join('\n')).toContain('LCP n/a');
    expect(auditIssues({ ...good, perf: { domNodes: 400 } })).toEqual([]);
  });
});
