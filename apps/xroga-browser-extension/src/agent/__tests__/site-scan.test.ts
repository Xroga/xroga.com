import { describe, expect, it } from 'vitest';
import { THIN_WORDS, findings, pageLinks, parseSitemap, readPage, runSiteScan, sample, sitemapsFromRobots } from '../site-scan';
import type { Fetched } from '../site-scan';

const long = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const page = (title: string, extra = '', words = 400) =>
  `<!doctype html><html lang="en"><head><title>${title}</title><link rel="canonical" href="https://a.test/x">${extra}</head><body><h1>${title}</h1><p>${long(words)}</p><a href="/about">About</a><a href="/blog/one">One</a><a href="https://other.test/">Other</a></body></html>`;

describe('site_scan parsing', () => {
  it('reads sitemap lines from robots.txt and locs from a sitemap or an index', () => {
    expect(sitemapsFromRobots('User-agent: *\nSitemap: https://a.test/s.xml\nsitemap: https://a.test/t.xml')).toEqual(['https://a.test/s.xml', 'https://a.test/t.xml']);
    expect(parseSitemap('<urlset><url><loc>https://a.test/</loc></url><url><loc> https://a.test/b?x=1&amp;y=2 </loc></url></urlset>').urls).toEqual(['https://a.test/', 'https://a.test/b?x=1&y=2']);
    const idx = parseSitemap('<sitemapindex><sitemap><loc>https://a.test/p1.xml</loc></sitemap></sitemapindex>');
    expect(idx).toEqual({ urls: [], children: ['https://a.test/p1.xml'] });
  });
  it('takes same-site page links only, without fragments, files and repeats', () => {
    const html = '<a href="/a#x">1</a><a href="/a">2</a><a href="/img.png">3</a><a href="https://other.test/z">4</a><a href="/b?page=2">5</a><a href="mailto:x@y.z">6</a>';
    expect(pageLinks(html, 'https://a.test/').sort()).toEqual(['https://a.test/a', 'https://a.test/b']);
  });
  it('spreads a sample across sections, shallow first', () => {
    const urls = ['https://a.test/', ...Array.from({ length: 30 }, (_, i) => `https://a.test/blog/p${i}`), 'https://a.test/pricing', 'https://a.test/about', 'https://a.test/contact'];
    const picked = sample(urls, 6);
    expect(picked[0]).toBe('https://a.test/');
    expect(picked).toEqual(expect.arrayContaining(['https://a.test/pricing', 'https://a.test/about', 'https://a.test/contact']));
    expect(picked.filter(u => u.includes('/blog/')).length).toBeLessThanOrEqual(2);
  });
});

describe('readPage and findings', () => {
  it('reads the basics', () => {
    const f = readPage('https://a.test/x', { status: 200, body: page('Plumbers in Leeds', '<meta name="description" content="Fast plumbers"><script type="application/ld+json">{"@type":"Plumber"}</script>') + '<img src="a.png"><img src="b.png" alt="b">' });
    expect(f).toMatchObject({ status: 200, title: 'Plumbers in Leeds', description: 'Fast plumbers', canonical: 'https://a.test/x', lang: 'en', images: 2, noAlt: 1, structured: ['Plumber'] });
    expect(f.h1).toEqual(['Plumbers in Leeds']);
    expect(f.words).toBeGreaterThan(300);
    expect(f.browser).toBeUndefined();
  });
  it('sends blocked, silent and script-built pages to the browser', () => {
    expect(readPage('https://a.test/', { status: 403, body: '' }).browser).toMatch(/blocked over HTTP/);
    expect(readPage('https://a.test/', { error: 'timeout' }).browser).toMatch(/did not answer/);
    const thin = readPage('https://a.test/', { status: 200, body: page('App', '', 20) });
    expect(thin.browser).toMatch(new RegExp(`little text over HTTP \\(\\d+ words`));
    expect(THIN_WORDS).toBe(160);
  });
  it('finds what only shows across pages: duplicate titles, missing descriptions, broken pages, noindex', () => {
    const a = readPage('https://a.test/1', { status: 200, body: page('Same') });
    const b = readPage('https://a.test/2', { status: 200, body: page('Same', '<meta name="robots" content="noindex">') });
    const c = readPage('https://a.test/3', { status: 404, body: '' });
    const out = findings([a, b, c]).join('\n');
    expect(out).toMatch(/PROBLEM · broken.*3 404|broken \(status 400 or more\): 1 page/);
    expect(out).toContain('duplicate titles');
    expect(out).toContain('noindex: 1 page');
    expect(out).toContain('no meta description: 2 pages');
  });
});

describe('runSiteScan', () => {
  const site: Record<string, Fetched> = {
    'https://a.test/robots.txt': { status: 200, body: 'Sitemap: https://a.test/sitemap.xml' },
    'https://a.test/sitemap.xml': { status: 200, body: '<urlset><url><loc>https://a.test/</loc></url><url><loc>https://a.test/about</loc></url><url><loc>https://a.test/app</loc></url></urlset>' },
    'https://a.test/': { status: 200, body: page('Home', '<meta name="description" content="d">') },
    'https://a.test/about': { status: 200, body: page('About', '<meta name="description" content="d">') },
    'https://a.test/app': { status: 200, body: page('App', '', 10) },
  };
  const fetcher = async (u: string): Promise<Fetched> => site[u] ?? { status: 404, body: '' };

  it('finds the pages in the sitemap, reads them and lists the script-built one for the browser', async () => {
    const r = await runSiteScan({ url: 'a.test' }, fetcher);
    expect(r.isError).toBe(false);
    expect(r.text).toContain('3 of 3 pages found (sitemap), 2 read over HTTP, 1 need the browser');
    expect(r.text).toContain('https://a.test/app: little text over HTTP');
    expect(r.text).toContain('Pages:');
  });
  it('falls back to the home page links when there is no sitemap', async () => {
    const bare: Record<string, Fetched> = { 'https://b.test/': { status: 200, body: page('Home') } };
    const r = await runSiteScan({ url: 'https://b.test/' }, async u => bare[u] ?? { status: 404, body: '' });
    expect(r.text).toContain('links from the home page');
  });
  it('reads exactly the addresses asked for, and refuses a bad address', async () => {
    const r = await runSiteScan({ url: 'https://a.test/', only: ['https://a.test/about', 'https://other.test/x'] }, fetcher);
    expect(r.text).toContain('1 of 1 pages found');
    expect((await runSiteScan({ url: '' }, fetcher)).isError).toBe(true);
  });
});
