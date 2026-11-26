// `site_scan`: a whole site surveyed over plain HTTP first. The pages come from robots.txt, the sitemap or the home page's links, sampled across the site's sections; each page is read for the
// on-page basics (status, title, description, headings, canonical, robots, words, links, images without alt, structured data); a page that comes back blocked or thin is flagged for the browser
// (audit_page with its address), because only a real browser sees what a script builds. A table of findings across the site comes first, the details per page after it.
// The idea is PinchTab's site scrape (MIT): extract over HTTP, route to the browser only where HTTP was not enough, outline before expand. The code is Xroga's own and reads no more than the
// server's public read gives it; nothing is changed on any site.
export const SITE_SCAN_TOOL = {
  name: 'site_scan',
  source: 'agent' as const,
  group: 'working' as const,
  description:
    'Survey a whole site over plain HTTP: finds its pages (robots.txt, sitemap, links), reads each one’s title, description, headings, canonical, robots, words, links, alt text and structured data, and lists problems across the site. Pages that are blocked or need scripts are listed for audit_page. Use for “audit or crawl this site”; use audit_page for one page’s speed.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 500 },
      pages: { type: 'integer', minimum: 1, maximum: 200 },
      only: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 500 } },
    },
    required: ['url'],
    additionalProperties: false,
  },
};

export interface Fetched {
  status?: number;
  contentType?: string;
  finalUrl?: string;
  body?: string;
  error?: string;
}
export type Fetcher = (url: string) => Promise<Fetched>;

export interface PageFacts {
  url: string;
  status: number | null;
  title: string;
  description: string;
  h1: string[];
  canonical: string;
  robots: string;
  lang: string;
  words: number;
  internalLinks: number;
  images: number;
  noAlt: number;
  structured: string[];
  hreflang: number;
  /** Why a browser is needed for this page, if it is. */
  browser?: string;
}

const DEFAULT_PAGES = 20;
export const THIN_WORDS = 160;
const BLOCKED = new Set([401, 403, 407, 429, 503]);

const text = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

export function sameSite(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

/** Sitemap addresses named in robots.txt. */
export function sitemapsFromRobots(robots: string): string[] {
  return [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1]!).slice(0, 5);
}

/** The `<loc>` addresses of a sitemap; a sitemap index gives `children` instead. */
export function parseSitemap(xml: string): { urls: string[]; children: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map(m => m[1]!.replace(/&amp;/g, '&'));
  return /<sitemapindex/i.test(xml) ? { urls: [], children: locs.slice(0, 20) } : { urls: locs, children: [] };
}

/** Same-site links of a page, without fragments, files that are not pages, and query-string variants beyond the first of a path. */
export function pageLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  const seenPath = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?\shref\s*=\s*["']([^"'#]+)[^"']*["']/gi)) {
    try {
      const u = new URL(m[1]!, base);
      if (!/^https?:$/.test(u.protocol) || !sameSite(u.href, base)) continue;
      if (/\.(?:jpe?g|png|gif|webp|svg|pdf|zip|css|js|ico|mp4|mp3|xml|json|txt)$/i.test(u.pathname)) continue;
      if (seenPath.has(u.pathname)) continue;
      seenPath.add(u.pathname);
      out.add(`${u.origin}${u.pathname}`);
    } catch {
      /* not an address */
    }
  }
  return [...out];
}

/** Up to `n` addresses spread across the site's sections: shallow pages first, then a few from each first path segment in turn, so one large blog does not crowd out the rest. */
export function sample(urls: string[], n: number): string[] {
  const unique = [...new Set(urls)];
  const depth = (u: string) => new URL(u).pathname.split('/').filter(Boolean).length;
  unique.sort((a, b) => depth(a) - depth(b));
  const groups = new Map<string, string[]>();
  for (const u of unique) {
    const seg = new URL(u).pathname.split('/').filter(Boolean)[0] ?? '';
    groups.set(seg, [...(groups.get(seg) ?? []), u]);
  }
  const picked: string[] = [];
  const lists = [...groups.values()];
  for (let i = 0; picked.length < n && lists.some(l => l.length > i); i++) {
    for (const l of lists) if (l[i] && picked.length < n) picked.push(l[i]!);
  }
  return picked;
}

/** The on-page basics read from HTML text (a regular expression read, no scripts run). */
export function readPage(url: string, f: Fetched): PageFacts {
  const status = typeof f.status === 'number' ? f.status : null;
  const html = f.body ?? '';
  const meta = (name: string) => {
    const m = new RegExp(`<meta\\b[^>]*?\\bname\\s*=\\s*["']${name}["'][^>]*>`, 'i').exec(html);
    return m ? (/content\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1] ?? '') : '';
  };
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const words = (text(body).match(/\S+/g) ?? []).length;
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]);
  const types = [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map(m => m[1]!);
  const facts: PageFacts = {
    url: f.finalUrl || url,
    status,
    title: text(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''),
    description: meta('description'),
    h1: [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => text(m[1]!)).filter(Boolean).slice(0, 4),
    canonical: /<link\b[^>]*?rel\s*=\s*["']canonical["'][^>]*>/i.exec(html)?.[0].match(/href\s*=\s*["']([^"']*)["']/i)?.[1] ?? '',
    robots: meta('robots'),
    lang: /<html\b[^>]*?\slang\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ?? '',
    words,
    internalLinks: pageLinks(html, f.finalUrl || url).length,
    images: imgs.length,
    noAlt: imgs.filter(i => !/\salt\s*=/i.test(i)).length,
    structured: [...new Set(types)].slice(0, 6),
    hreflang: (html.match(/<link\b[^>]*hreflang/gi) ?? []).length,
  };
  if (f.error) facts.browser = `did not answer (${f.error})`;
  else if (status !== null && BLOCKED.has(status)) facts.browser = `blocked over HTTP (status ${status})`;
  else if (status !== null && status < 400 && words < THIN_WORDS) facts.browser = `little text over HTTP (${words} words): probably built by scripts`;
  return facts;
}

/** The problems that show only across pages, then each page's own, worst first. */
export function findings(pages: PageFacts[]): string[] {
  const ok = pages.filter(p => p.status !== null && p.status < 400 && !p.browser);
  const out: string[] = [];
  const list = (label: string, urls: string[]) => urls.length && out.push(`${label}: ${urls.length} page${urls.length === 1 ? '' : 's'}${urls.length <= 4 ? ` (${urls.join(', ')})` : ` (e.g. ${urls.slice(0, 3).join(', ')})`}`);
  list('PROBLEM · broken (status 400 or more)', pages.filter(p => p.status !== null && p.status >= 400 && !BLOCKED.has(p.status)).map(p => `${p.url} ${p.status}`));
  list('PROBLEM · no title', ok.filter(p => !p.title).map(p => p.url));
  list('PROBLEM · noindex', ok.filter(p => /noindex/i.test(p.robots)).map(p => p.url));
  const titles = new Map<string, string[]>();
  for (const p of ok) if (p.title) titles.set(p.title.toLowerCase(), [...(titles.get(p.title.toLowerCase()) ?? []), p.url]);
  const dups = [...titles.values()].filter(v => v.length > 1);
  if (dups.length) out.push(`PROBLEM · duplicate titles: ${dups.length} title${dups.length === 1 ? '' : 's'} shared by ${dups.reduce((n, v) => n + v.length, 0)} pages (e.g. ${dups[0]!.slice(0, 3).join(', ')})`);
  list('warning · no meta description', ok.filter(p => !p.description).map(p => p.url));
  list('warning · title over 60 characters', ok.filter(p => p.title.length > 60).map(p => p.url));
  list('warning · description over 160 characters', ok.filter(p => p.description.length > 160).map(p => p.url));
  list('warning · no h1', ok.filter(p => !p.h1.length).map(p => p.url));
  list('warning · more than one h1', ok.filter(p => p.h1.length > 1).map(p => p.url));
  list('warning · no canonical', ok.filter(p => !p.canonical).map(p => p.url));
  list('warning · images without alt', ok.filter(p => p.noAlt > 0).map(p => `${p.url} ${p.noAlt}/${p.images}`));
  list('warning · no structured data', ok.filter(p => !p.structured.length).map(p => p.url));
  return out;
}

export function render(site: string, how: string, pages: PageFacts[], found: number): string {
  const need = pages.filter(p => p.browser);
  const lines = [
    `site_scan · ${site} · ${pages.length} of ${found} pages found (${how}), ${pages.length - need.length} read over HTTP, ${need.length} need the browser`,
    ...(findings(pages).length ? ['Across the site:', ...findings(pages).map(f => `- ${f}`)] : ['Across the site: no problems found in the pages read over HTTP.']),
    'Pages:',
    ...pages.map(p => `- ${p.url} · ${p.status ?? 'no answer'} · "${p.title.slice(0, 70)}" · desc ${p.description.length} · h1 ${p.h1.length} · ${p.words} words · ${p.internalLinks} links · alt ${p.noAlt}/${p.images}${p.structured.length ? ` · ${p.structured.join('/')}` : ''}${/noindex/i.test(p.robots) ? ' · NOINDEX' : ''}`),
    ...(need.length ? ['For the browser (audit_page with the address; its speed and what scripts build are measured there):', ...need.map(p => `- ${p.url}: ${p.browser}`)] : []),
  ];
  return lines.join(String.fromCharCode(10));
}

function startUrl(raw: string): URL | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

export async function runSiteScan(args: { url?: string; pages?: number; only?: string[] }, fetchPage: Fetcher, signal?: AbortSignal): Promise<{ text: string; isError: boolean }> {
  const start = startUrl(String(args.url ?? ''));
  if (!start) return { text: 'error: site_scan needs the site’s address, for example https://example.com.', isError: true };
  const want = Math.max(1, Math.min(200, Math.floor(Number(args.pages) || DEFAULT_PAGES)));
  const origin = start.origin;
  let how = 'given addresses';
  let found = 0;
  let urls: string[] = [];
  if (Array.isArray(args.only) && args.only.length) {
    urls = args.only.map(u => startUrl(String(u))?.href).filter((u): u is string => !!u && sameSite(u, origin));
    found = urls.length;
  } else {
    const robots = await fetchPage(`${origin}/robots.txt`);
    const maps = [...sitemapsFromRobots(robots.body ?? ''), `${origin}/sitemap.xml`];
    const seen = new Set<string>();
    const queue = [...new Set(maps)].slice(0, 6);
    let fetched = 0;
    while (queue.length && urls.length < want * 25 && fetched < 8 && !signal?.aborted) {
      const m = queue.shift()!;
      if (seen.has(m)) continue;
      seen.add(m);
      fetched++;
      const r = await fetchPage(m);
      if (!r.body || (r.status ?? 0) >= 400) continue;
      const parsed = parseSitemap(r.body);
      urls.push(...parsed.urls.filter(u => sameSite(u, origin)));
      queue.push(...parsed.children);
    }
    if (urls.length) how = 'sitemap';
    else {
      const home = await fetchPage(start.href);
      urls = [start.href, ...(home.body ? pageLinks(home.body, home.finalUrl || start.href) : [])];
      how = 'links from the home page';
    }
    found = new Set(urls).size;
    if (!urls.includes(start.href) && !urls.includes(`${origin}/`)) urls.unshift(start.href);
    urls = sample(urls, want);
  }
  if (!urls.length) return { text: `site_scan · ${origin} · no pages were found over HTTP (no sitemap, and the home page gave no links). Open it in the browser instead.`, isError: false };
  const pages: PageFacts[] = [];
  for (const u of urls) {
    if (signal?.aborted) break;
    pages.push(readPage(u, await fetchPage(u)));
  }
  return { text: render(origin, how, pages, found), isError: false };
}
