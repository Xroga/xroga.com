// Reading a site's robots.txt and sitemaps on the device (no sign-in is sent). See agent/site-map.ts for what is made of them.
import { parseRobots, parseSitemap, type SiteMapReport, type SitemapEntry } from '@src/agent/site-map';

const MAX_FILE = 50 * 1024 * 1024;
const MAX_ENTRIES = 200_000;

async function gunzip(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_FILE * 2) {
      await reader.cancel();
      throw new Error('the sitemap inflates beyond 100 MB');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(total));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function fetchText(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return { status: res.status, text: '' };
  if (Number(res.headers.get('content-length') ?? 0) > MAX_FILE) throw new Error('the file is larger than 50 MB');
  let bytes: Uint8Array = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_FILE) throw new Error('the file is larger than 50 MB');
  if ((bytes[0] === 0x1f && bytes[1] === 0x8b) || /\.gz($|\?)/i.test(url)) {
    try {
      bytes = await gunzip(bytes);
    } catch (error) {
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) throw error;
    }
  }
  return { status: res.status, text: new TextDecoder('utf-8').decode(bytes) };
}

export async function readSiteMap(startUrl: string, options: { sitemap?: string; maxFiles?: number } = {}): Promise<SiteMapReport> {
  let origin: string;
  try {
    const u = new URL(startUrl);
    if (!/^https?:$/.test(u.protocol)) throw new Error('not http');
    origin = u.origin;
  } catch {
    throw new Error('site_map needs the address of a site (https or http)');
  }
  const report: SiteMapReport = { origin, robotsFound: false, sitemapsListed: [], sitemapsRead: [], entries: [], truncated: false, notes: [] };
  try {
    const r = await fetchText(`${origin}/robots.txt`);
    // A site that answers a missing robots.txt with an HTML page has none.
    if (r.status === 200 && !/^\s*<(?:!doctype|html)/i.test(r.text)) {
      report.robotsFound = true;
      report.robots = parseRobots(r.text);
      report.sitemapsListed = report.robots.sitemaps;
    }
  } catch (error) {
    report.notes.push(`robots.txt could not be read (${error instanceof Error ? error.message.slice(0, 80) : 'error'}).`);
  }
  const roots = report.sitemapsListed.length ? report.sitemapsListed.slice(0, 4) : [`${origin}/sitemap.xml`];
  const maxFiles = Math.min(8, Math.max(1, options.maxFiles ?? 3));
  const queue = [...roots];
  const seen = new Set<string>();
  const indexChildren: string[] = [];
  while (queue.length && report.sitemapsRead.length < maxFiles) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    let parsed;
    try {
      const f = await fetchText(url);
      if (f.status !== 200 || !f.text.trim().startsWith('<')) {
        report.notes.push(`${url} answered ${f.status || 'no sitemap'}.`);
        continue;
      }
      parsed = parseSitemap(f.text);
    } catch (error) {
      report.notes.push(`${url} could not be read (${error instanceof Error ? error.message.slice(0, 80) : 'error'}).`);
      continue;
    }
    if (parsed.kind === 'index') {
      const children = parsed.entries.map(e => e.loc);
      indexChildren.push(...children);
      const wanted = options.sitemap ? children.filter(c => c.toLowerCase().includes(options.sitemap!.toLowerCase())) : children;
      if (options.sitemap && !wanted.length) report.notes.push(`No file of the sitemap index matches "${options.sitemap}". The index lists: ${children.slice(0, 10).join(', ')}${children.length > 10 ? ' …' : ''}.`);
      queue.unshift(...wanted);
      continue;
    }
    report.sitemapsRead.push(url);
    for (const e of parsed.entries as SitemapEntry[]) {
      if (report.entries.length >= MAX_ENTRIES) {
        report.truncated = true;
        break;
      }
      report.entries.push(e);
    }
  }
  if (indexChildren.length > report.sitemapsRead.length && !options.sitemap) {
    report.notes.push(`The sitemap index lists ${indexChildren.length} files; ${report.sitemapsRead.length} were read. Read another with sitemap set to part of its address, for example: ${indexChildren.slice(0, 5).map(c => c.replace(/^https?:\/\/[^/]+/, '')).join(', ')}.`);
  }
  return report;
}
