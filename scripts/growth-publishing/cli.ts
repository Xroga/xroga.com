import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import {
  CRAWLER_PROFILES, INDEXABLE_PUBLIC_URLS, PUBLIC_URL_INVENTORY, REPOSITORY_ROOT,
  analyzeLinkGraph, buildFreshnessQueue, buildPublicationReceipt, classifyProductChange,
  detectRedirectProblems, evaluatePublicationEligibility, googleDiscoveryState,
  indexNowEligibility, loadPublicationSource, mapChangedFilesToUrls, publicationStatusData,
  robotsAllows, safeFetch, submitIndexNow, verifyLiveUrl, writeArtifact,
} from './core.js';

const execFile = promisify(execFileCallback);
const args = process.argv.slice(2);
const command = args.shift() ?? 'help';
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const json = flag('json');
const print = (result: unknown) => console.log(json ? JSON.stringify(result, null, 2) : typeof result === 'string' ? result : JSON.stringify(result, null, 2));

async function changedFiles() {
  const since = value('since') ?? 'HEAD^';
  const { stdout } = await execFile('git', ['diff', '--name-only', `${since}..HEAD`], { cwd: REPOSITORY_ROOT });
  return stdout.split(/\r?\n/).filter(Boolean);
}

async function sitemapText(baseUrl: string) {
  try { const response = await fetch(`${baseUrl}/sitemap.xml`, { signal: AbortSignal.timeout(15_000) }); return response.ok ? await response.text() : ''; }
  catch { return ''; }
}

async function verify(paths: string[]) {
  const baseUrl = (value('base-url') ?? process.env.SEO_AUDIT_BASE_URL ?? 'https://xroga.com').replace(/\/$/, '');
  const sitemap = await sitemapText(baseUrl);
  const records = paths.map((path) => INDEXABLE_PUBLIC_URLS.find((item) => item.path === path)).filter(Boolean) as typeof INDEXABLE_PUBLIC_URLS;
  const results = [];
  for (const record of records.slice(0, 150)) results.push(await verifyLiveUrl(record, { baseUrl, sitemap }));
  return { baseUrl, checked: results.length, results, blockers: results.filter((item) => item.failures.length) };
}

async function main() {
  if (command === 'changed-urls') {
    const files = value('files')?.split(',').filter(Boolean) ?? await changedFiles();
    return print({ files, ...(await mapChangedFilesToUrls(files)) });
  }
  if (command === 'verify-live') {
    const requested = value('url');
    const paths = requested ? [new URL(requested, 'https://xroga.com').pathname] : flag('changed')
      ? [...(await mapChangedFilesToUrls(await changedFiles())).directlyChangedUrls, ...(await mapChangedFilesToUrls(await changedFiles())).dependentUrls]
      : ['/build-with/github', '/tools/production-readiness-checker', '/', '/pricing', '/ai-coding-agent', '/security', '/docs/getting-started', '/blog/what-is-vibe-coding', '/compare/xroga-vs-lovable', '/research/web3-hackathon-winning-patterns'];
    const result = await verify([...new Set(paths)]);
    print(result); if (result.blockers.length) process.exitCode = 2; return;
  }
  if (command === 'crawl') {
    const baseUrl = (value('base-url') ?? 'https://xroga.com').replace(/\/$/, '');
    const paths = value('urls')?.split(',').map((item) => new URL(item, baseUrl).pathname) ?? INDEXABLE_PUBLIC_URLS.map((item) => item.path);
    const sitemap = await sitemapText(baseUrl); const pages = []; const diagnostics = [];
    for (const record of INDEXABLE_PUBLIC_URLS.filter((item) => paths.includes(item.path)).slice(0, 150)) {
      const verification = await verifyLiveUrl(record, { baseUrl, sitemap }); diagnostics.push(verification);
      pages.push({ path: record.path, links: verification.signals?.links ?? [] });
    }
    const result = { diagnostics, linkGraph: analyzeLinkGraph(pages) };
    if (!flag('dry-run')) await writeArtifact('crawl.json', result);
    print(result); if (diagnostics.some((item) => item.failures.some((failure) => failure !== 'NETWORK_UNKNOWN'))) process.exitCode = 2; return;
  }
  if (command === 'ship') {
    const files = value('files')?.split(',').filter(Boolean) ?? await changedFiles();
    const changed = await mapChangedFilesToUrls(files); const source = await loadPublicationSource();
    const paths = [...new Set([...changed.directlyChangedUrls, ...changed.dependentUrls])];
    const plan = paths.map((url) => { const record = INDEXABLE_PUBLIC_URLS.find((item) => item.path === url)!; const manifest = source.manifests.find((item) => item.file === record?.manifestSource)?.manifest; return { url, ...evaluatePublicationEligibility(record, manifest) }; });
    const result: Record<string, unknown> = { mode: flag('submit-indexnow') ? 'AUTHORIZED_SUBMISSION' : 'DRY_RUN', files, changed, plan, productSync: classifyProductChange(files) };
    if (flag('verify')) {
      const live = await verify(paths); result.live = live;
      const eligible = live.results.flatMap((verification) => { const record = INDEXABLE_PUBLIC_URLS.find((item) => `${live.baseUrl}${item.path}` === verification.url); return record && indexNowEligibility(record, verification, true).eligible ? [record.canonical!] : []; });
      result.indexNow = await submitIndexNow(eligible, { dryRun: !flag('submit-indexnow') });
      result.google = paths.map((path) => { const record = INDEXABLE_PUBLIC_URLS.find((item) => item.path === path)!; return googleDiscoveryState(record, true, true); });
    }
    if (!flag('dry-run')) await writeArtifact('publication-plan.json', result);
    print(result); if (plan.some((item) => item.status === 'PUBLICATION_BLOCKED')) process.exitCode = 2; return;
  }
  if (command === 'refresh') return print({ generatedAt: new Date().toISOString(), queue: await buildFreshnessQueue() });
  if (command === 'sync') {
    const files = value('files')?.split(',').filter(Boolean) ?? await changedFiles(); return print({ files, ...classifyProductChange(files), changedUrls: await mapChangedFilesToUrls(files) });
  }
  if (command === 'drift') {
    const result = await verify((value('urls')?.split(',') ?? ['/build-with/github', '/tools/production-readiness-checker']));
    const receipts = result.results.map((verification) => { const record = INDEXABLE_PUBLIC_URLS.find((item) => `${result.baseUrl}${item.path}` === verification.url)!; return buildPublicationReceipt({ record, verification, sitemapPresent: !verification.failures.includes('SITEMAP_MISSING'), commitSha: value('commit') }); });
    if (!flag('dry-run')) await writeArtifact('publication-receipts.json', receipts);
    print({ ...result, receipts }); if (result.blockers.length) process.exitCode = 2; return;
  }
  if (command === 'feeds') {
    const routes = ['/blog/feed.xml', '/research/feed.xml', '/changelog/feed.xml'];
    if (flag('dry-run')) return print({ routes, state: 'NOT_FETCHED_DRY_RUN' });
    const baseUrl = (value('base-url') ?? 'https://xroga.com').replace(/\/$/, '');
    const results = await Promise.all(routes.map(async (route) => { try { const response = await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(15_000) }); const body = await response.text(); return { route, status: response.status, contentType: response.headers.get('content-type'), valid: response.ok && /<rss\b/.test(body) && /<guid\b/.test(body) }; } catch (error) { return { route, status: null, valid: false, error: error instanceof Error ? error.message : String(error) }; } }));
    print(results); if (results.some((item) => !item.valid)) process.exitCode = 2; return;
  }
  if (command === 'indexnow') {
    const baseUrl = (value('base-url') ?? 'https://xroga.com').replace(/\/$/, '');
    const raw = value('urls')?.split(',').filter(Boolean) ?? args.filter((item) => !item.startsWith('--'));
    const paths = raw.length ? raw.map((item) => new URL(item, baseUrl).pathname) : flag('changed')
      ? [...(await mapChangedFilesToUrls(await changedFiles())).directlyChangedUrls, ...(await mapChangedFilesToUrls(await changedFiles())).dependentUrls]
      : [];
    if (!paths.length) throw new Error('IndexNow requires --urls, positional URLs, or --changed.');
    const live = await verify([...new Set(paths)]); const eligible: string[] = []; const refused = [];
    for (const verification of live.results) {
      const record = INDEXABLE_PUBLIC_URLS.find((item) => `${live.baseUrl}${item.path}` === verification.url)!;
      const decision = indexNowEligibility(record, verification, true);
      if (decision.eligible) eligible.push(record.canonical!); else refused.push({ url: record.path, reasons: decision.reasons });
    }
    const result = { live, refused, submission: await submitIndexNow(eligible, { dryRun: !flag('submit') }) };
    if (!flag('dry-run')) await writeArtifact('indexnow-receipt.json', result);
    print(result); if (refused.length) process.exitCode = 2; return;
  }
  if (command === 'crawlers') {
    const path = value('url') ?? '/build-with/github'; const record = INDEXABLE_PUBLIC_URLS.find((item) => item.path === path);
    if (!record) throw new Error(`Unknown indexable URL: ${path}`);
    if (flag('dry-run')) return print({ url: path, profiles: CRAWLER_PROFILES, state: 'NOT_FETCHED_DRY_RUN' });
    const baseUrl = (value('base-url') ?? 'https://xroga.com').replace(/\/$/, '');
    const allowLocal = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(baseUrl);
    const robots = await safeFetch(`${baseUrl}/robots.txt`, { allowedOrigin: baseUrl, allowLocal });
    const results = []; for (const profile of CRAWLER_PROFILES) results.push({
      profile,
      robotsAllowed: robotsAllows(robots.body, profile.userAgent, record.path),
      retrieval: await verifyLiveUrl(record, { baseUrl, userAgent: profile.userAgent }),
    });
    print(results); if (results.some((item) => !item.robotsAllowed || item.retrieval.failures.length)) process.exitCode = 2; return;
  }
  if (command === 'validate') {
    const source = await loadPublicationSource(); const errors: string[] = [];
    const paths = new Set<string>(); for (const record of PUBLIC_URL_INVENTORY) { if (paths.has(record.path)) errors.push(`duplicate URL ${record.path}`); paths.add(record.path); }
    errors.push(...detectRedirectProblems());
    for (const { file, manifest } of source.manifests) { const record = INDEXABLE_PUBLIC_URLS.find((item) => item.canonical === manifest.canonical); if (!record) errors.push(`${file}: canonical absent from public URL inventory`); else errors.push(...evaluatePublicationEligibility(record, manifest).reasons.map((reason) => `${file}: ${reason}`)); }
    const llms = await readFile(new URL('../../frontend/src/app/llms.txt/route.ts', import.meta.url), 'utf8');
    for (const match of llms.matchAll(/https:\/\/xroga\.com([^'`\s)]+)/g)) if (!PUBLIC_URL_INVENTORY.some((item) => item.path === normalize(match[1]))) errors.push(`llms.txt references unknown path ${match[1]}`);
    const result = { inventory: { total: PUBLIC_URL_INVENTORY.length, indexable: INDEXABLE_PUBLIC_URLS.length }, errors };
    print(result); if (errors.length) process.exitCode = 2; return;
  }
  if (command === 'status') return print(INDEXABLE_PUBLIC_URLS.map((record) => publicationStatusData(record)));
  print('Commands: changed-urls, ship, verify-live, refresh, sync, drift, feeds, crawl, crawlers, indexnow, validate, status');
}

const normalize = (path: string) => path === '/' ? '/' : path.replace(/\/$/, '');
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
