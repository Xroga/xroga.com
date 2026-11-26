import { describe, expect, it } from 'vitest';
import { allowedByRobots, describeSiteMap, parseRobots, parseSitemap, sections, type SiteMapReport } from '../site-map';

const ROBOTS = `# comment
Sitemap: https://x.test/sitemap.xml

User-agent: googlebot
Disallow: /only-google

User-agent: *
Disallow: /dev
Disallow: /private/
Allow: /private/public.html
Disallow: /*.pdf$
Crawl-delay: 5
`;

describe('robots.txt', () => {
  const r = parseRobots(ROBOTS);
  it('reads the rules every crawler must follow and the sitemaps', () => {
    expect(r.sitemaps).toEqual(['https://x.test/sitemap.xml']);
    expect(r.disallow).toEqual(['/dev', '/private/', '/*.pdf$']);
    expect(r.allow).toEqual(['/private/public.html']);
    expect(r.crawlDelay).toBe(5);
  });
  it('applies the longest rule, wildcards and the end anchor', () => {
    expect(allowedByRobots('/dev/guide', r)).toBe(false);
    expect(allowedByRobots('/about', r)).toBe(true);
    expect(allowedByRobots('/private/secret.html', r)).toBe(false);
    expect(allowedByRobots('/private/public.html', r)).toBe(true);
    expect(allowedByRobots('/files/report.pdf', r)).toBe(false);
    expect(allowedByRobots('/files/report.pdf?x=1', r)).toBe(true);
    expect(allowedByRobots('/only-google', r)).toBe(true);
  });
});

describe('sitemaps', () => {
  it('reads a page list with dates and ignores alternate-language links', () => {
    const xml = '<?xml version="1.0"?>\r\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>https://x.test/a</loc><lastmod>2026-01-02</lastmod><xhtml:link rel="alternate" hreflang="de" href="https://x.test/de/a"/></url><url><loc>https://x.test/b</loc></url></urlset>';
    expect(parseSitemap(xml)).toEqual({ kind: 'pages', entries: [{ loc: 'https://x.test/a', lastmod: '2026-01-02' }, { loc: 'https://x.test/b' }] });
  });
  it('reads a sitemap index', () => {
    const xml = '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://x.test/en.xml.gz</loc><lastmod>2026-11-26</lastmod></sitemap></sitemapindex>';
    expect(parseSitemap(xml)).toEqual({ kind: 'index', entries: [{ loc: 'https://x.test/en.xml.gz', lastmod: '2026-11-26' }] });
  });
  it('groups pages by section and goes deeper when one section holds most of them', () => {
    const urls = [...Array.from({ length: 30 }, (_, i) => `https://x.test/docs/api/p${i}`), 'https://x.test/blog/one', 'https://x.test/about'];
    const s = sections(urls);
    expect(s[0]).toEqual({ section: '/docs/api/', count: 30 });
    expect(sections(['https://x.test/a/1', 'https://x.test/b/2'])).toEqual([{ section: '/a/', count: 1 }, { section: '/b/', count: 1 }]);
  });
});

describe('describeSiteMap', () => {
  const report: SiteMapReport = {
    origin: 'https://x.test', robotsFound: true, robots: parseRobots(ROBOTS), sitemapsListed: ['https://x.test/sitemap.xml'], sitemapsRead: ['https://x.test/sitemap.xml'], truncated: false, notes: [],
    entries: [{ loc: 'https://x.test/docs/a', lastmod: '2026-01-02' }, { loc: 'https://x.test/dev/hidden' }, { loc: 'https://x.test/docs/b' }, { loc: 'https://x.test/blog/c' }],
  };
  it('leaves out what robots.txt disallows, says how many, and filters', () => {
    const t = describeSiteMap(report, { include: '/docs/' });
    expect(t).toMatch(/Pages: 4 in the files read; 2 after filters/);
    expect(t).toMatch(/https:\/\/x\.test\/docs\/a {2}\(2026-01-02\)/);
    expect(t).not.toMatch(/dev\/hidden/);
    const all = describeSiteMap(report, {});
    expect(all).toMatch(/1 left out because robots\.txt disallows them/);
    expect(describeSiteMap(report, { includeDisallowed: true })).toMatch(/dev\/hidden/);
  });
  it('refuses an invalid pattern plainly and says when nothing was found', () => {
    expect(describeSiteMap(report, { include: '(' })).toMatch(/^error: .*not a valid regular expression/);
    expect(describeSiteMap({ ...report, entries: [] })).toMatch(/No page addresses were found\./);
  });
});
