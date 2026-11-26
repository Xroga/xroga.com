// `site_map`: what a site publishes about its own pages: robots.txt (which paths crawlers may not take, where the sitemaps are) and its
// sitemaps (an index of sitemaps or a list of pages, plain or gzip), summarised by section and filterable. The idea comes from
// Crawlee (Apache-2.0: robots.txt and sitemap handling, link filtering with include and exclude patterns); written fresh.
import type { AgentTool } from './tools';
import { kids, kid, parseXml, textOf, type XNode } from './office-read';

export const SITE_MAP_TOOL: AgentTool = {
  name: 'site_map',
  source: 'agent',
  group: 'reading',
  description:
    'List the pages a public site publishes in its robots.txt and sitemaps: which paths crawlers are told to avoid, the sitemaps, and the page addresses with their last-change dates, grouped by section. include and exclude are regular expressions over the address; sitemap picks one file of a sitemap index (a part of its address); limit is how many addresses to list (default 40). Read-only, no sign-in sent.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      include: { type: 'string', maxLength: 200 },
      exclude: { type: 'string', maxLength: 200 },
      sitemap: { type: 'string', maxLength: 200 },
      limit: { type: 'number' },
      includeDisallowed: { type: 'boolean' },
    },
    required: ['url'],
    additionalProperties: false,
  },
};

export interface Robots {
  sitemaps: string[];
  disallow: string[];
  allow: string[];
  crawlDelay?: number;
}

/** The rules every crawler must follow (the group for *), and the sitemaps the file names. */
export function parseRobots(text: string): Robots {
  const out: Robots = { sitemaps: [], disallow: [], allow: [] };
  let inStar = false;
  let sawAgent = false;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === 'sitemap') {
      if (/^https?:\/\//i.test(value)) out.sitemaps.push(value);
    } else if (key === 'user-agent') {
      // A new group starts after rules; consecutive User-agent lines share one group.
      if (!sawAgent) inStar = false;
      inStar = inStar || value === '*';
      sawAgent = true;
    } else {
      sawAgent = false;
      if (!inStar) continue;
      if (key === 'disallow' && value) out.disallow.push(value);
      else if (key === 'allow' && value) out.allow.push(value);
      else if (key === 'crawl-delay' && Number.isFinite(Number(value))) out.crawlDelay = Number(value);
    }
  }
  return out;
}

function ruleToRegex(rule: string): RegExp {
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped.endsWith('\\$') ? escaped.slice(0, -2) + '$' : escaped}`);
}

/** Longest matching rule wins; on a tie Allow wins (the order Google documents). */
export function allowedByRobots(path: string, robots: Robots): boolean {
  let best: { len: number; allow: boolean } | undefined;
  for (const [rules, allow] of [[robots.disallow, false], [robots.allow, true]] as const) {
    for (const rule of rules) {
      let hit = false;
      try {
        hit = ruleToRegex(rule).test(path);
      } catch {
        hit = false;
      }
      if (hit && (!best || rule.length > best.len || (rule.length === best.len && allow))) best = { len: rule.length, allow };
    }
  }
  return best ? best.allow : true;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}
export interface ParsedSitemap {
  kind: 'index' | 'pages';
  entries: SitemapEntry[];
}

export function parseSitemap(xml: string): ParsedSitemap {
  const root = parseXml(xml).children.find((c): c is XNode => typeof c !== 'string');
  if (!root) return { kind: 'pages', entries: [] };
  const index = root.name === 'sitemapindex';
  const entries: SitemapEntry[] = [];
  for (const n of kids(root, index ? 'sitemap' : 'url')) {
    const loc = textOf(kid(n, 'loc')).trim();
    if (!/^https?:\/\//i.test(loc)) continue;
    const lastmod = textOf(kid(n, 'lastmod')).trim();
    entries.push({ loc, ...(lastmod ? { lastmod } : {}) });
  }
  return { kind: index ? 'index' : 'pages', entries };
}

/** Counts by section: the first path segment, and the next ones while one section holds most of the pages. */
export function sections(urls: string[]): Array<{ section: string; count: number }> {
  const parts = urls.map(u => {
    try {
      return new URL(u).pathname.split('/').filter(Boolean);
    } catch {
      return [];
    }
  });
  let depth = 1;
  const keyOf = (p: string[]) => `/${p.slice(0, depth).join('/')}${p.length > depth ? '/' : ''}`;
  for (; depth < 2; depth++) {
    const counts = new Map<string, number>();
    for (const p of parts) counts.set(keyOf(p), (counts.get(keyOf(p)) ?? 0) + 1);
    const top = Math.max(...counts.values(), 0);
    if (top < parts.length * 0.8 || parts.length < 20) break;
  }
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(keyOf(p), (counts.get(keyOf(p)) ?? 0) + 1);
  return [...counts.entries()].map(([section, count]) => ({ section, count })).sort((a, b) => b.count - a.count);
}

export interface SiteMapReport {
  origin: string;
  robots?: Robots;
  robotsFound: boolean;
  sitemapsListed: string[];
  sitemapsRead: string[];
  entries: SitemapEntry[];
  truncated: boolean;
  notes: string[];
}

const NL = String.fromCharCode(10);

export function describeSiteMap(report: SiteMapReport, options: { include?: string; exclude?: string; limit?: number; includeDisallowed?: boolean } = {}): string {
  const limit = Math.max(1, Math.min(300, Math.floor(options.limit ?? 40)));
  const out: string[] = [`site_map for ${report.origin}`];
  if (report.robotsFound && report.robots) {
    const r = report.robots;
    out.push(`robots.txt: found. For all crawlers: ${r.disallow.length} disallowed path rule${r.disallow.length === 1 ? '' : 's'}${r.disallow.length ? ` (${r.disallow.slice(0, 12).join(' ')}${r.disallow.length > 12 ? ' …' : ''})` : ''}${r.allow.length ? `, ${r.allow.length} allow rule${r.allow.length === 1 ? '' : 's'}` : ''}${r.crawlDelay ? `, crawl delay ${r.crawlDelay} s` : ''}.`);
  } else out.push('robots.txt: not found.');
  out.push(report.sitemapsListed.length ? `Sitemaps named: ${report.sitemapsListed.slice(0, 8).join(', ')}${report.sitemapsListed.length > 8 ? ' …' : ''}` : 'Sitemaps named: none (the usual /sitemap.xml was tried).');
  if (report.sitemapsRead.length) out.push(`Sitemap files read (${report.sitemapsRead.length}): ${report.sitemapsRead.slice(0, 6).join(', ')}${report.sitemapsRead.length > 6 ? ' …' : ''}`);
  out.push(...report.notes);
  let entries = report.entries;
  let include: RegExp | undefined;
  let exclude: RegExp | undefined;
  try {
    if (options.include) include = new RegExp(options.include, 'i');
    if (options.exclude) exclude = new RegExp(options.exclude, 'i');
  } catch (error) {
    return `error: the include or exclude pattern is not a valid regular expression (${error instanceof Error ? error.message.slice(0, 100) : 'invalid'}).`;
  }
  const total = entries.length;
  if (include) entries = entries.filter(e => include!.test(e.loc));
  if (exclude) entries = entries.filter(e => !exclude!.test(e.loc));
  let blocked = 0;
  if (report.robots && !options.includeDisallowed) {
    entries = entries.filter(e => {
      let path = '/';
      try {
        const u = new URL(e.loc);
        path = u.pathname + u.search;
      } catch { /* keep */ }
      const ok = allowedByRobots(path, report.robots!);
      if (!ok) blocked++;
      return ok;
    });
  }
  if (!total) {
    out.push('No page addresses were found.');
    return out.join(NL);
  }
  out.push(`Pages: ${total}${report.truncated ? '+ (reading stopped at the size limit)' : ''} in the files read; ${entries.length} after filters${blocked ? `; ${blocked} left out because robots.txt disallows them (includeDisallowed true lists them)` : ''}.`);
  const groups = sections(entries.map(e => e.loc)).slice(0, 12);
  if (groups.length) out.push(`By section: ${groups.map(g => `${g.section} ${g.count}`).join(', ')}`);
  out.push(`First ${Math.min(limit, entries.length)}:`, ...entries.slice(0, limit).map(e => `${e.loc}${e.lastmod ? `  (${e.lastmod})` : ''}`));
  if (entries.length > limit) out.push(`… ${entries.length - limit} more: narrow with include or exclude, or raise limit.`);
  return out.join(NL);
}
