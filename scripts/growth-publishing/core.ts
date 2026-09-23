import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { INDEXABLE_PUBLIC_URLS, PUBLIC_URL_INVENTORY, type PublicUrlRecord } from '../../frontend/src/lib/publicUrlInventory.js';
import { redirectRegistry } from '../../frontend/redirects.mjs';

export { INDEXABLE_PUBLIC_URLS, PUBLIC_URL_INVENTORY };

export const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..');
export const ARTIFACT_ROOT = path.join(REPOSITORY_ROOT, 'artifacts', 'growth-publishing');
export const PUBLICATION_STATES = [
  'DRAFT', 'RESEARCH_REQUIRED', 'EVIDENCE_REQUIRED', 'VISUALS_REQUIRED', 'QUALITY_BLOCKED',
  'READY_FOR_REVIEW', 'APPROVED', 'READY_TO_BUILD', 'BUILDING', 'BUILD_FAILED',
  'PREVIEW_READY', 'PREVIEW_VERIFIED', 'MERGED', 'DEPLOYING', 'DEPLOY_FAILED',
  'LIVE_UNVERIFIED', 'LIVE_VERIFIED', 'DISCOVERY_SUBMITTED', 'MONITORING',
  'REFRESH_DUE', 'STALE', 'DRIFTED', 'RETIRED',
] as const;

export type PublicationState = typeof PUBLICATION_STATES[number];
export type PublicationFailure =
  | 'CONTENT_VALIDATION' | 'BUILD_FAILURE' | 'PREVIEW_FAILURE' | 'DEPLOY_FAILURE'
  | 'LIVE_404' | 'LIVE_5XX' | 'CANONICAL_MISMATCH' | 'ROBOTS_BLOCK' | 'NOINDEX'
  | 'SITEMAP_MISSING' | 'STRUCTURED_DATA_ERROR' | 'SOURCE_STALE' | 'INDEXNOW_FAILURE'
  | 'NETWORK_UNKNOWN' | 'DRIFT' | 'REDIRECT' | 'TITLE_MISSING' | 'DESCRIPTION_MISSING'
  | 'CLIENT_ONLY_CRITICAL_CONTENT' | 'AUTH_BLOCKED' | 'RATE_LIMITED' | 'SOFT_404';

const PUBLICATION_TRANSITIONS: Record<PublicationState, readonly PublicationState[]> = {
  DRAFT: ['RESEARCH_REQUIRED', 'EVIDENCE_REQUIRED', 'VISUALS_REQUIRED', 'QUALITY_BLOCKED', 'READY_FOR_REVIEW', 'RETIRED'],
  RESEARCH_REQUIRED: ['DRAFT', 'READY_FOR_REVIEW', 'RETIRED'],
  EVIDENCE_REQUIRED: ['DRAFT', 'READY_FOR_REVIEW', 'RETIRED'],
  VISUALS_REQUIRED: ['DRAFT', 'READY_FOR_REVIEW', 'RETIRED'],
  QUALITY_BLOCKED: ['DRAFT', 'READY_FOR_REVIEW', 'RETIRED'],
  READY_FOR_REVIEW: ['APPROVED', 'DRAFT', 'RETIRED'],
  APPROVED: ['READY_TO_BUILD', 'DRAFT', 'RETIRED'],
  READY_TO_BUILD: ['BUILDING', 'RETIRED'],
  BUILDING: ['BUILD_FAILED', 'PREVIEW_READY'],
  BUILD_FAILED: ['READY_TO_BUILD', 'RETIRED'],
  PREVIEW_READY: ['PREVIEW_VERIFIED', 'BUILD_FAILED'],
  PREVIEW_VERIFIED: ['MERGED', 'BUILDING'],
  MERGED: ['DEPLOYING'],
  DEPLOYING: ['DEPLOY_FAILED', 'LIVE_UNVERIFIED'],
  DEPLOY_FAILED: ['DEPLOYING', 'RETIRED'],
  LIVE_UNVERIFIED: ['LIVE_VERIFIED', 'DEPLOY_FAILED', 'DRIFTED'],
  LIVE_VERIFIED: ['DISCOVERY_SUBMITTED', 'MONITORING', 'DRIFTED', 'RETIRED'],
  DISCOVERY_SUBMITTED: ['MONITORING', 'DRIFTED'],
  MONITORING: ['REFRESH_DUE', 'STALE', 'DRIFTED', 'RETIRED'],
  REFRESH_DUE: ['DRAFT', 'READY_FOR_REVIEW', 'RETIRED'],
  STALE: ['DRAFT', 'READY_FOR_REVIEW', 'RETIRED'],
  DRIFTED: ['READY_TO_BUILD', 'DEPLOYING', 'RETIRED'],
  RETIRED: [],
};

export function publicationTransitionAllowed(from: PublicationState, to: PublicationState) {
  return PUBLICATION_TRANSITIONS[from].includes(to);
}

export type ContentManifest = {
  canonical: string; opportunityId: string; indexStatus: 'INDEX' | 'NOINDEX' | 'DRAFT';
  qualityScore: number; qualityDeficiencies: string[]; sourceIds: string[]; claimIds: string[];
  evidenceManifest: Array<{ publicSafe: boolean; freshnessDue: string }>;
  visualManifest: Array<{ publicSafe: boolean }>;
  updatedAt: string; publishedAt: string; lastVerifiedAt: string; refreshDue: string;
};

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(path.join(REPOSITORY_ROOT, file), 'utf8')) as T;
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const normalizePath = (value: string) => {
  const url = new URL(value, 'https://xroga.com');
  return url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
};
const normalizeCanonical = (value: string) => {
  const url = new URL(value);
  const pathname = normalizePath(url.pathname);
  return `${url.origin}${pathname === '/' ? '' : pathname}`;
};

export async function loadPublicationSource() {
  const manifestFiles = ['content/manifests/build-with-github.json', 'content/manifests/production-readiness-checker.json'];
  const [manifests, sources, claims, facts, assets] = await Promise.all([
    Promise.all(manifestFiles.map(async (file) => ({ file, manifest: await readJson<ContentManifest>(file) }))),
    readJson<Array<{ sourceId: string; pagesUsingSource: string[]; verifiedAt: string; volatility: string }>>('growth/content/sources.json'),
    readJson<Array<{ claimId: string; pagesUsingClaim: string[]; nextVerificationDue: string; verifiedAt: string }>>('growth/content/claims.json'),
    readJson<Array<{ factKey: string; affectedPublicPages: string[]; lastVerifiedAt: string; verificationIntervalDays: number }>>('growth/source/facts.json'),
    readJson<Array<{ url: string; sourcePath: string; indexable: boolean; updatedAt: string; lastVerifiedAt: string; qualityScore: number | null }>>('growth/content/asset-inventory.json'),
  ]);
  return { manifests, sources, claims, facts, assets };
}

export function evaluatePublicationEligibility(record: PublicUrlRecord, manifest?: ContentManifest) {
  const reasons: string[] = [];
  if (record.classification !== 'PUBLIC_INDEXABLE') reasons.push(`classification=${record.classification}`);
  if (!record.canonical?.startsWith('https://xroga.com')) reasons.push('canonical is not a production Xroga URL');
  if (!record.sitemap) reasons.push('indexable URL is excluded from sitemap');
  if (record.manifestSource && !manifest) reasons.push('required content manifest is missing');
  if (manifest) {
    if (manifest.indexStatus !== 'INDEX') reasons.push(`manifest indexStatus=${manifest.indexStatus}`);
    if (manifest.qualityScore < 80) reasons.push(`quality score ${manifest.qualityScore} is below 80`);
    if (!manifest.sourceIds.length || !manifest.claimIds.length) reasons.push('source or claim evidence is empty');
    if (manifest.evidenceManifest.length < 2 || manifest.evidenceManifest.some((item) => !item.publicSafe)) reasons.push('public-safe evidence requirements failed');
    if (!manifest.visualManifest.length || manifest.visualManifest.some((item) => !item.publicSafe)) reasons.push('public-safe visual requirement failed');
    if (manifest.canonical !== record.canonical) reasons.push('manifest canonical does not match URL inventory');
  }
  return { status: reasons.length ? 'PUBLICATION_BLOCKED' as const : 'PUBLICATION_ELIGIBLE' as const, reasons };
}

export type DeploymentImpact = {
  frontendDeploymentRequired: boolean;
  backendDeploymentRequired: boolean;
  publicContentImpact: boolean;
  discoveryImpact: boolean;
  buildInputOnly: boolean;
};
export type ChangedUrlResult = {
  directlyChangedUrls: string[]; dependentUrls: string[]; globalImpact: boolean;
  discoveryImpact: boolean; unknownImpact: string[]; deploymentImpact: DeploymentImpact;
};
const globalContentFiles = new Set([
  'frontend/src/app/layout.tsx', 'frontend/src/lib/seo.ts', 'frontend/src/lib/publicUrlInventory.ts',
  'frontend/src/middleware.ts', 'frontend/next.config.mjs', 'frontend/redirects.mjs',
]);
const globalDiscoveryFiles = new Set([
  'frontend/src/app/robots.ts', 'frontend/src/app/sitemap.ts',
  'scripts/seo-contracts.json', 'scripts/seo-crawlers.json', 'growth/source/crawler-policies.json',
]);

export function classifyDeploymentImpact(files: string[]): DeploymentImpact {
  const normalized = files.map((file) => file.replaceAll('\\', '/').replace(/^\.\//, ''));
  const frontendRuntime = normalized.some((file) =>
    /^(?:frontend\/src\/(?:app|components|lib|styles)\/|frontend\/(?:next\.config\.mjs|redirects\.mjs|public\/))/.test(file)
      && !/(?:\.test\.|\/tests?\/)/.test(file));
  const backendRuntime = normalized.some((file) =>
    /^backend\/(?:src|Dockerfile|fly\.toml)/.test(file) && !/(?:\.test\.|\/tests?\/)/.test(file));
  const publicContentImpact = normalized.some((file) =>
    /^(?:content\/manifests\/|growth\/(?:content|source)\/|frontend\/src\/(?:app|lib)\/)/.test(file)
      && !/(?:\.test\.|\/tests?\/)/.test(file));
  const discoveryImpact = normalized.some((file) => globalDiscoveryFiles.has(file));
  const onlyBuildInputsOrNonRuntime = normalized.length > 0 && normalized.every((file) =>
    /^(?:docs\/|\.github\/|package(?:-lock)?\.json$|.*(?:\.test\.[cm]?[jt]sx?|\/tests?\/))/.test(file));
  return {
    frontendDeploymentRequired: frontendRuntime,
    backendDeploymentRequired: backendRuntime,
    publicContentImpact,
    discoveryImpact,
    buildInputOnly: onlyBuildInputsOrNonRuntime && normalized.some((file) => /^package(?:-lock)?\.json$/.test(file)),
  };
}

export function assessDeploymentRevision(input: {
  mainSha: string; frontendSha: string | null; backendSha: string | null;
  filesSinceFrontend: string[]; filesSinceBackend: string[];
}) {
  const frontendImpact = classifyDeploymentImpact(input.filesSinceFrontend);
  const backendImpact = classifyDeploymentImpact(input.filesSinceBackend);
  return {
    frontend: input.frontendSha === input.mainSha ? 'MATCH' as const
      : frontendImpact.frontendDeploymentRequired ? 'DEPLOY_REQUIRED' as const : 'NO_DEPLOY_REQUIRED' as const,
    backend: input.backendSha === input.mainSha ? 'MATCH' as const
      : backendImpact.backendDeploymentRequired ? 'DEPLOY_REQUIRED' as const : 'NO_DEPLOY_REQUIRED' as const,
    frontendImpact,
    backendImpact,
  };
}

export async function mapChangedFilesToUrls(files: string[]): Promise<ChangedUrlResult> {
  const normalized = files.map((file) => file.replaceAll('\\', '/').replace(/^\.\//, ''));
  const source = await loadPublicationSource();
  const direct = new Set<string>();
  const dependent = new Set<string>();
  const unknown = new Set<string>();
  let globalImpact = false;
  let discoveryImpact = false;
  for (const file of normalized) {
    if (globalContentFiles.has(file)) { globalImpact = true; continue; }
    if (globalDiscoveryFiles.has(file)) { discoveryImpact = true; continue; }
    let matched = false;
    for (const record of INDEXABLE_PUBLIC_URLS) {
      if (record.routeSource === file || record.contentSources.includes(file) || record.manifestSource === file) {
        direct.add(record.path); matched = true;
      }
    }
    if (file === 'growth/source/facts.json') {
      source.facts.flatMap((fact) => fact.affectedPublicPages).forEach((url) => dependent.add(normalizePath(url)));
      matched = true;
    }
    if (file === 'growth/content/claims.json') {
      source.claims.flatMap((claim) => claim.pagesUsingClaim).forEach((url) => dependent.add(normalizePath(url)));
      matched = true;
    }
    if (file === 'growth/content/sources.json') {
      source.sources.flatMap((item) => item.pagesUsingSource).forEach((url) => dependent.add(normalizePath(url)));
      matched = true;
    }
    if (file.startsWith('frontend/src/app/') && /\/page\.tsx$/.test(file)) {
      const route = file.replace('frontend/src/app', '').replace(/\/page\.tsx$/, '').replace(/\([^/]+\)\//g, '').replace(/\[.+?\]/g, '');
      if (route && PUBLIC_URL_INVENTORY.some((item) => item.path === route)) { direct.add(route); matched = true; }
    }
    if (!matched && !/^(?:backend\/.*(?:\.test\.[cm]?[jt]s|\/tests?\/)|\.github\/|docs\/|scripts\/growth-publishing\/|package(?:-lock)?\.json$|frontend\/.*\.(?:css|scss))/.test(file)) unknown.add(file);
  }
  if (globalImpact) INDEXABLE_PUBLIC_URLS.forEach((record) => dependent.add(record.path));
  direct.forEach((url) => dependent.delete(url));
  return {
    directlyChangedUrls: [...direct].sort(), dependentUrls: [...dependent].sort(),
    globalImpact, discoveryImpact, unknownImpact: [...unknown].sort(), deploymentImpact: classifyDeploymentImpact(normalized),
  };
}

export function meaningfulLastmod(record: PublicUrlRecord, manifest?: ContentManifest): string | null {
  if (manifest?.updatedAt) return manifest.updatedAt;
  return record.updatedAt ?? null;
}

export type HtmlSignals = {
  title: string; description: string; h1: string[]; canonical: string; robots: string;
  links: string[]; schemas: string[]; images: Array<{ src: string; alt: string | null }>;
  text: string; contentHash: string;
};
const first = (html: string, expression: RegExp) => html.match(expression)?.[1]?.trim() ?? '';
const stripHtml = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export function inspectHtml(html: string): HtmlSignals {
  const title = first(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = first(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i) || first(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description/i);
  const canonical = first(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || first(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical/i);
  const robots = first(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)/i) || first(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots/i);
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => stripHtml(match[1]));
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)/gi)].map((match) => match[1]);
  const images = [...html.matchAll(/<img\b([^>]*)>/gi)].map((match) => ({
    src: first(match[1], /\bsrc=["']([^"']+)/i),
    alt: /\balt=["']([^"']*)["']/i.test(match[1]) ? first(match[1], /\balt=["']([^"']*)["']/i) : null,
  }));
  const schemas: string[] = [];
  for (const block of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const value = JSON.parse(block[1]); schemas.push(JSON.stringify(value)); } catch { schemas.push('INVALID'); }
  }
  const text = stripHtml(html);
  const semanticFingerprint = JSON.stringify({ title, description, canonical, robots, h1, text });
  return { title, description, h1, canonical, robots, links, schemas, images, text, contentHash: sha256(semanticFingerprint) };
}

export function analyzeSemanticHtml(html: string) {
  const signals = inspectHtml(html); const findings: string[] = [];
  if (signals.h1.length !== 1) findings.push('H1_COUNT');
  if (!/<main\b/i.test(html)) findings.push('MAIN_MISSING');
  if (/<h3\b/i.test(html) && !/<h2\b/i.test(html)) findings.push('HEADING_LEVEL_SKIP');
  if (signals.images.some((image) => image.alt === null)) findings.push('IMAGE_ALT_MISSING');
  if (/<div[^>]+role=["']table["']/i.test(html) && !/<table\b/i.test(html)) findings.push('TABLE_SEMANTICS_MISSING');
  return { findings, signals };
}

export type RobotsGroup = { agents: string[]; allow: string[]; disallow: string[] };
export function parseRobots(body: string) {
  const groups: RobotsGroup[] = []; let current: RobotsGroup | null = null; const sitemaps: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const separator = line.indexOf(':'); if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase(); const entry = line.slice(separator + 1).trim();
    if (key === 'user-agent') { if (!current || current.allow.length || current.disallow.length) { current = { agents: [], allow: [], disallow: [] }; groups.push(current); } current.agents.push(entry.toLowerCase()); }
    else if (key === 'allow' && current) current.allow.push(entry);
    else if (key === 'disallow' && current) current.disallow.push(entry);
    else if (key === 'sitemap') sitemaps.push(entry);
  }
  return { groups, sitemaps };
}

export function robotsAllows(body: string, userAgent: string, pathname: string) {
  const parsed = parseRobots(body); const token = userAgent.toLowerCase();
  const matching = parsed.groups.filter((group) => group.agents.some((agent) => agent === '*' || token.includes(agent)));
  const specific = matching.filter((group) => group.agents.some((agent) => agent !== '*' && token.includes(agent)));
  const rules = (specific.length ? specific : matching).flatMap((group) => [
    ...group.allow.map((rule) => ({ rule, allowed: true })), ...group.disallow.map((rule) => ({ rule, allowed: false })),
  ]).filter(({ rule }) => rule && pathname.startsWith(rule)).sort((a, b) => b.rule.length - a.rule.length);
  return rules[0]?.allowed ?? true;
}

const privateIpv4 = (ip: string) => /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.(?:1[89])\.|192\.0\.0\.)/.test(ip);
const privateIpv6 = (ip: string) => /^(?:::1$|::$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:|::ffff:(?:0*:)?(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.))/i.test(ip);
export const isPrivateNetworkAddress = (ip: string) => privateIpv4(ip) || privateIpv6(ip);
type DnsLookup = typeof dns.lookup;
export async function assertSafeFetchUrl(value: string, allowedOrigin = 'https://xroga.com', allowLocal = false, lookup: DnsLookup = dns.lookup): Promise<URL> {
  const url = new URL(value, allowedOrigin);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only credential-free HTTP(S) URLs are allowed.');
  const allowed = new URL(allowedOrigin);
  if (url.origin !== allowed.origin) throw new Error(`Cross-origin fetch refused: ${url.origin}`);
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    if (!allowLocal) throw new Error('Private network target refused.');
    return url;
  }
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateNetworkAddress(address))) throw new Error('Private or unresolved network target refused.');
  return url;
}

export async function safeFetch(value: string, options: { allowedOrigin?: string; allowLocal?: boolean; userAgent?: string; timeoutMs?: number; maxBytes?: number; fetchImpl?: typeof fetch; lookup?: DnsLookup } = {}) {
  const allowedOrigin = options.allowedOrigin ?? 'https://xroga.com';
  let url = await assertSafeFetchUrl(value, allowedOrigin, options.allowLocal ?? false, options.lookup);
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(options.timeoutMs ?? 15_000), headers: { 'user-agent': options.userAgent ?? 'XrogaGrowthVerifier/1.0' } });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (redirects === 5) throw new Error('Redirect limit exceeded.');
      url = await assertSafeFetchUrl(new URL(response.headers.get('location')!, url).href, allowedOrigin, options.allowLocal ?? false, options.lookup);
      continue;
    }
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > (options.maxBytes ?? 2_000_000)) throw new Error('Response exceeds size limit.');
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) { const { done, value: chunk } = await reader.read(); if (done) break; size += chunk.length; if (size > (options.maxBytes ?? 2_000_000)) { await reader.cancel(); throw new Error('Response exceeds size limit.'); } chunks.push(chunk); }
    const body = new TextDecoder().decode(Buffer.concat(chunks));
    return { response, body, finalUrl: url.href };
  }
  throw new Error('Unreachable fetch state.');
}

export type LiveVerification = {
  url: string; agent: string; status: number | null; contentType: string | null; indexability: string;
  finalUrl: string | null; durationMs: number; xRobotsTag: string | null;
  failures: PublicationFailure[]; warnings: string[]; signals?: HtmlSignals; semanticFindings: string[];
  challenge: boolean; networkState: 'CONFIRMED' | 'UNKNOWN';
};
export function detectChallengePage(status: number, body: string, finalUrl: string) {
  const sample = body.slice(0, 100_000);
  const challenge = /captcha|cf-chl-|just a moment|verify you are human|attention required|access denied|bot verification/i.test(sample);
  const authWall = /(?:authentication required|sign in to continue|vercel authentication|log in to continue)/i.test(sample)
    || /\/(?:login|signin|auth)(?:\/|\?|$)/i.test(new URL(finalUrl).pathname);
  return { challenge, authWall, blocked: challenge || authWall || status === 401 || status === 403 };
}
export async function verifyLiveUrl(record: PublicUrlRecord, options: { baseUrl?: string; userAgent?: string; sitemap?: string; fetchImpl?: typeof fetch } = {}): Promise<LiveVerification> {
  const baseUrl = (options.baseUrl ?? 'https://xroga.com').replace(/\/$/, '');
  const target = `${baseUrl}${record.path}`;
  const failures: PublicationFailure[] = []; const warnings: string[] = [];
  const startedAt = Date.now();
  try {
    const { response, body, finalUrl } = await safeFetch(target, { allowedOrigin: baseUrl, allowLocal: /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(baseUrl), userAgent: options.userAgent, fetchImpl: options.fetchImpl });
    const durationMs = Date.now() - startedAt;
    if (response.status === 404) failures.push('LIVE_404');
    else if (response.status >= 500) failures.push('LIVE_5XX');
    else if (response.status === 401 || response.status === 403) failures.push('AUTH_BLOCKED');
    else if (response.status === 429) failures.push('RATE_LIMITED');
    else if (response.status !== 200) failures.push('DRIFT');
    if (normalizePath(new URL(finalUrl).pathname) !== record.path) failures.push('REDIRECT');
    const signals = inspectHtml(body);
    const semanticFindings = analyzeSemanticHtml(body).findings;
    const expectedCanonical = record.canonical;
    if (expectedCanonical && (!signals.canonical || normalizeCanonical(signals.canonical) !== normalizeCanonical(expectedCanonical))) failures.push('CANONICAL_MISMATCH');
    const xRobotsTag = response.headers.get('x-robots-tag');
    if (/noindex/i.test(`${signals.robots} ${xRobotsTag ?? ''}`) && record.classification === 'PUBLIC_INDEXABLE') failures.push('NOINDEX');
    if (!signals.title) failures.push('TITLE_MISSING');
    if (!signals.description) failures.push('DESCRIPTION_MISSING');
    if (signals.h1.length !== 1 || signals.text.length < 180) failures.push('CLIENT_ONLY_CRITICAL_CONTENT');
    if (signals.schemas.includes('INVALID')) failures.push('STRUCTURED_DATA_ERROR');
    if (detectSoft404(response.status, body)) failures.push('SOFT_404');
    if (options.sitemap && expectedCanonical && !options.sitemap.includes(`<loc>${expectedCanonical}</loc>`)) failures.push('SITEMAP_MISSING');
    if (semanticFindings.length) warnings.push(`Semantic HTML findings: ${semanticFindings.join(', ')}`);
    if (durationMs > 3_000) warnings.push(`Slow response observed: ${durationMs}ms`);
    const challengeState = detectChallengePage(response.status, body, finalUrl);
    if (challengeState.challenge) failures.push('ROBOTS_BLOCK');
    if (challengeState.authWall) failures.push('AUTH_BLOCKED');
    const challenge = challengeState.challenge;
    return { url: target, finalUrl, durationMs, xRobotsTag, agent: options.userAgent ?? 'XrogaGrowthVerifier/1.0', status: response.status, contentType: response.headers.get('content-type'), indexability: failures.length ? 'BLOCKED' : 'INDEXABLE', failures: [...new Set(failures)], warnings, signals, semanticFindings, challenge, networkState: 'CONFIRMED' };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
    return { url: target, finalUrl: null, durationMs: Date.now() - startedAt, xRobotsTag: null, agent: options.userAgent ?? 'XrogaGrowthVerifier/1.0', status: null, contentType: null, indexability: 'UNKNOWN', failures: ['NETWORK_UNKNOWN'], warnings, semanticFindings: [], challenge: false, networkState: 'UNKNOWN' };
  }
}

export const CRAWLER_PROFILES = [
  { name: 'browser', userAgent: 'Mozilla/5.0 XrogaGrowthVerifier/1.0', purpose: 'OTHER' },
  { name: 'googlebot', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', purpose: 'TRADITIONAL_SEARCH' },
  { name: 'bingbot', userAgent: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', purpose: 'TRADITIONAL_SEARCH' },
  { name: 'oai-searchbot', userAgent: 'Mozilla/5.0 (compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot)', purpose: 'SEARCH_RETRIEVAL' },
  { name: 'perplexitybot', userAgent: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', purpose: 'SEARCH_RETRIEVAL' },
] as const;

export function indexNowEligibility(record: PublicUrlRecord, verification: LiveVerification | null, meaningfullyChanged: boolean) {
  const reasons: string[] = [];
  if (record.classification !== 'PUBLIC_INDEXABLE' || !record.canonical || !record.sitemap) reasons.push('URL is not a public canonical sitemap URL');
  if (!meaningfullyChanged) reasons.push('URL did not meaningfully change');
  if (!verification || verification.status !== 200 || verification.failures.length) reasons.push('live URL is not verified');
  return { eligible: !reasons.length, reasons };
}

export async function submitIndexNow(urls: string[], options: { dryRun?: boolean; fetchImpl?: typeof fetch } = {}) {
  const key = process.env.INDEXNOW_KEY?.trim(); const keyLocation = process.env.INDEXNOW_KEY_LOCATION?.trim();
  if (!key || !keyLocation) return { status: 'UNAVAILABLE' as const, submitted: [], reason: 'INDEXNOW_KEY and INDEXNOW_KEY_LOCATION are not configured.' };
  let keyUrl: URL;
  try { keyUrl = new URL(keyLocation); } catch { return { status: 'REFUSED' as const, submitted: [], reason: 'Key location is invalid.' }; }
  if (keyUrl.protocol !== 'https:' || keyUrl.origin !== 'https://xroga.com') return { status: 'REFUSED' as const, submitted: [], reason: 'Key location must be hosted on xroga.com.' };
  const unique = [...new Set(urls)];
  if (!unique.length || unique.some((url) => new URL(url).origin !== 'https://xroga.com')) return { status: 'REFUSED' as const, submitted: [], reason: 'Only unique canonical xroga.com URLs may be submitted.' };
  if (options.dryRun !== false) return { status: 'DRY_RUN' as const, submitted: unique };
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const keyResponse = await fetchImpl(keyUrl, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
    const hostedKey = await keyResponse.text();
    if (!keyResponse.ok || hostedKey.trim() !== key) return { status: 'REFUSED' as const, submitted: [], reason: 'The domain-hosted IndexNow key could not be verified.' };
  } catch {
    return { status: 'REFUSED' as const, submitted: [], reason: 'The domain-hosted IndexNow key could not be verified.' };
  }
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: 'xroga.com', key, keyLocation, urlList: unique }), signal: AbortSignal.timeout(15_000) });
      lastStatus = response.status;
      if ([200, 202].includes(response.status)) return { status: 'ACCEPTED' as const, submitted: unique, responseCode: response.status };
      if (response.status !== 429 && response.status < 500) break;
    } catch { if (attempt === 2) return { status: 'FAILED' as const, submitted: [], reason: 'Transient IndexNow request failed after bounded retries.' }; }
  }
  return { status: 'FAILED' as const, submitted: [], responseCode: lastStatus, reason: `IndexNow returned HTTP ${lastStatus}.` };
}

export function googleDiscoveryState(record: PublicUrlRecord, sitemapPresent: boolean, hasInboundLink: boolean) {
  return { provider: 'GOOGLE', sitemapPresent, hasInboundLink, inspection: process.env.GSC_URL_INSPECTION_CREDENTIALS ? 'CONFIGURED_NOT_RUN' : 'NO_DATA', submission: 'NOT_SUPPORTED_FOR_GENERAL_WEB_PAGES' };
}

export type GoogleInspection = { state: 'INDEXED' | 'NOT_INDEXED' | 'UNKNOWN'; inspectedAt: string; googleCanonical: string | null; lastCrawl: string | null; robotsState: string; coverage: string | null };
export async function inspectGoogleUrl(url: string, provider?: (url: string) => Promise<GoogleInspection>) {
  if (!provider) return { state: 'NO_DATA' as const, reason: 'Authorized GSC URL Inspection credentials/provider are unavailable.' };
  return provider(url);
}

export async function verifyReleaseSha(baseUrl: string, expectedSha: string, fetchImpl?: typeof fetch) {
  if (!/^[0-9a-f]{40}$/i.test(expectedSha)) return { state: 'INVALID_EXPECTATION' as const, expectedSha, actualSha: null };
  try {
    const { response, body } = await safeFetch(`${baseUrl.replace(/\/$/, '')}/api/release`, { allowedOrigin: baseUrl.replace(/\/$/, ''), allowLocal: /^http:\/\/(?:localhost|127\.0\.0\.1)/.test(baseUrl), fetchImpl });
    const actualSha = response.ok ? (JSON.parse(body) as { release?: string }).release ?? null : null;
    return { state: actualSha === expectedSha ? 'MATCH' as const : 'MISMATCH' as const, expectedSha, actualSha };
  } catch (error) { return { state: 'UNKNOWN' as const, expectedSha, actualSha: null, reason: error instanceof Error ? error.message : String(error) }; }
}

export function fingerprintDrift(expectedHash: string | null, verification: LiveVerification) {
  if (!expectedHash || !verification.signals?.contentHash) return { state: 'UNKNOWN' as const };
  return { state: expectedHash === verification.signals.contentHash ? 'MATCH' as const : 'DRIFTED' as const };
}

export function buildPublicationReceipt(input: { record: PublicUrlRecord; verification: LiveVerification; sitemapPresent: boolean; feedPresent?: boolean; commitSha?: string; mergeSha?: string; deploymentId?: string; deploymentUrl?: string; expectedHash?: string; indexNow?: unknown }) {
  const { record, verification } = input;
  const drift = fingerprintDrift(input.expectedHash ?? null, verification);
  const failures = [...new Set([...verification.failures, ...(drift.state === 'DRIFTED' ? ['DRIFT' as const] : [])])];
  const blocking = failures;
  const receiptIdentity = [record.canonical, input.commitSha ?? '', verification.signals?.contentHash ?? '', verification.status ?? 'UNKNOWN'].join('|');
  return {
    publication_id: `publication_${sha256(receiptIdentity).slice(0, 24)}`, url: record.path, canonical: record.canonical, asset_id: record.manifestSource ?? record.routeSource,
    opportunity_id: null, commit_sha: input.commitSha ?? null, merge_sha: input.mergeSha ?? null,
    deployment_id: input.deploymentId ?? null, deployment_url: input.deploymentUrl ?? null,
    production_url: record.canonical, built_at: null, deployed_at: null, verified_at: new Date().toISOString(),
    http_status: verification.status, content_type: verification.contentType,
    title: verification.signals?.title ?? null, h1: verification.signals?.h1 ?? [],
    canonical_verified: Boolean(verification.signals?.canonical && record.canonical && normalizeCanonical(verification.signals.canonical) === normalizeCanonical(record.canonical)),
    indexability: verification.indexability, robots_state: verification.failures.includes('ROBOTS_BLOCK') ? 'BLOCKED' : 'ALLOWED_OR_NOT_OBSERVED',
    sitemap_present: input.sitemapPresent, feed_present: input.feedPresent ?? null,
    structured_data_state: verification.failures.includes('STRUCTURED_DATA_ERROR') ? 'INVALID' : 'VALID_OR_ABSENT',
    server_content_state: verification.failures.includes('CLIENT_ONLY_CRITICAL_CONTENT') ? 'INSUFFICIENT' : 'VISIBLE',
    visual_state: 'NOT_ASSESSED_BY_HTML_CHECK', internal_links_state: verification.signals?.links.some((link) => {
      try { return new URL(link, 'https://xroga.com').origin === 'https://xroga.com'; } catch { return false; }
    }) ? 'PRESENT' : 'ABSENT',
    indexnow_status: input.indexNow ?? 'NOT_REQUESTED', google_inspection_state: process.env.GSC_URL_INSPECTION_CREDENTIALS ? 'CONFIGURED_NOT_RUN' : 'NO_DATA',
    content_hash: verification.signals?.contentHash ?? null, expected_hash: input.expectedHash ?? null, drift_state: drift.state,
    lastmod: record.updatedAt ?? null,
    result: blocking.length ? 'FAILED' : verification.warnings.length || verification.failures.length ? 'LIVE_WITH_WARNING' : 'LIVE_VERIFIED',
    failures,
  };
}

export function classifyExternalSourceHealth(input: { status: number | null; timedOut?: boolean; rateLimited?: boolean; checkedAt?: string }) {
  if (input.rateLimited || input.status === 429) return { state: 'RATE_LIMITED' as const, checkedAt: input.checkedAt ?? null };
  if (input.timedOut || input.status === null) return { state: 'UNKNOWN' as const, checkedAt: input.checkedAt ?? null };
  if (input.status >= 500) return { state: 'TEMPORARILY_UNAVAILABLE' as const, checkedAt: input.checkedAt ?? null };
  if (input.status >= 400) return { state: 'BROKEN' as const, checkedAt: input.checkedAt ?? null };
  return { state: 'HEALTHY' as const, checkedAt: input.checkedAt ?? null };
}

export async function writeArtifact(name: string, value: unknown) {
  const safeName = path.basename(name);
  if (safeName !== name || !/^[a-z0-9._-]+$/i.test(name)) throw new Error('Artifact name is unsafe.');
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  const target = path.join(ARTIFACT_ROOT, safeName);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return target;
}

export function detectRedirectProblems() {
  const destinations = new Map(redirectRegistry.map((item) => [item.source, item.destination]));
  const problems: string[] = [];
  for (const item of redirectRegistry) {
    if (item.source === item.destination) problems.push(`self redirect: ${item.source}`);
    if (/^\/(?:workspace|dashboard|settings|admin|auth)(?:\/|$)/.test(item.destination) && !/^\/(?:login|signin|signup|register|sign-)/.test(item.source)) problems.push(`redirect to private route: ${item.source}`);
    const seen = new Set([item.source]); let cursor = item.destination;
    while (destinations.has(cursor)) { if (seen.has(cursor)) { problems.push(`redirect loop: ${item.source}`); break; } seen.add(cursor); cursor = destinations.get(cursor)!; }
  }
  return problems;
}

export function analyzeLinkGraph(pages: Array<{ path: string; links: string[] }>, roots = ['/']) {
  const known = new Set(pages.map((page) => page.path));
  const knownDestination = (link: string) => {
    if (known.has(link) || PUBLIC_URL_INVENTORY.some((item) => item.path === link)) return true;
    return /^\/(?:api|workspace|dashboard|settings|admin|auth|preview|terminal)(?:\/|$)/.test(link);
  };
  const internal = (value: string): string | null => {
    if (!value || value.startsWith('#') || /^(?:mailto|tel|javascript):/i.test(value)) return null;
    try { const url = new URL(value, 'https://xroga.com'); return url.origin === 'https://xroga.com' ? normalizePath(url.pathname) : null; }
    catch { return null; }
  };
  const normalizedPages = pages.map((page) => ({ ...page, links: page.links.map(internal).filter((link): link is string => Boolean(link)) }));
  const edges = new Map(normalizedPages.map((page) => [page.path, [...new Set(page.links.filter((link) => known.has(link)))]]));
  const depth = new Map<string, number>(); const queue = roots.filter((root) => known.has(root)).map((root) => [root, 0] as const);
  for (const [root] of queue) depth.set(root, 0);
  while (queue.length) { const [current, currentDepth] = queue.shift()!; for (const target of edges.get(current) ?? []) if (!depth.has(target)) { depth.set(target, currentDepth + 1); queue.push([target, currentDepth + 1]); } }
  return { orphans: [...known].filter((path) => !depth.has(path)).sort(), depths: Object.fromEntries([...depth].sort()), broken: normalizedPages.flatMap((page) => page.links.filter((link) => !knownDestination(link)).map((link) => ({ source: page.path, target: link }))) };
}

export async function buildFreshnessQueue(now = new Date()) {
  const source = await loadPublicationSource();
  const due: Array<{ type: string; id: string; pages: string[]; dueAt: string; state: 'REFRESH_DUE' | 'STALE' }> = [];
  for (const claim of source.claims) if (new Date(claim.nextVerificationDue) <= now) due.push({ type: 'CLAIM', id: claim.claimId, pages: claim.pagesUsingClaim, dueAt: claim.nextVerificationDue, state: 'REFRESH_DUE' });
  for (const entry of source.sources) {
    const days = entry.volatility === 'HIGH' ? 30 : entry.volatility === 'MEDIUM' ? 90 : 365;
    const dueAt = new Date(new Date(entry.verifiedAt).getTime() + days * 86_400_000);
    if (dueAt <= now) due.push({ type: 'SOURCE', id: entry.sourceId, pages: entry.pagesUsingSource, dueAt: dueAt.toISOString(), state: 'STALE' });
  }
  for (const { file, manifest } of source.manifests) if (new Date(manifest.refreshDue) <= now) due.push({ type: 'ASSET', id: file, pages: [normalizePath(manifest.canonical)], dueAt: manifest.refreshDue, state: 'REFRESH_DUE' });
  return due.sort((left, right) => left.dueAt.localeCompare(right.dueAt));
}

export function scheduledPublicationEligibility(item: { state: PublicationState; scheduledAt: string; approved: boolean }, now = new Date()) {
  if (new Date(item.scheduledAt) > now) return { eligible: false, reason: 'NOT_DUE' };
  if (!item.approved || !['APPROVED', 'READY_TO_BUILD'].includes(item.state)) return { eligible: false, reason: 'APPROVAL_REQUIRED' };
  return { eligible: true, reason: 'DUE_AND_APPROVED' };
}

export function auditRouteInventoryPaths(routeFiles: string[], inventory = PUBLIC_URL_INVENTORY) {
  const coveredByPrivatePrefix = (route: string) => inventory.some((item) =>
    ['PRIVATE', 'SYSTEM'].includes(item.classification) && (route === item.path || route.startsWith(`${item.path}/`)));
  const uncovered: string[] = [];
  for (const file of routeFiles.map((item) => item.replaceAll('\\', '/'))) {
    if (!/frontend\/src\/app\/.*\/page\.tsx$|frontend\/src\/app\/page\.tsx$/.test(file)) continue;
    const appPart = file.replace(/^.*frontend\/src\/app/, '').replace(/\/page\.tsx$/, '').replace(/\/\([^/]+\)/g, '');
    const route = appPart || '/';
    const routeExpression = new RegExp(`^${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\[[^/]+\\\]/g, '[^/]+')}$`);
    const exact = inventory.some((item) => item.path === route || item.routeSource.replaceAll('\\', '/') === file || routeExpression.test(item.path));
    if (!exact && !coveredByPrivatePrefix(route)) uncovered.push(route);
  }
  return { uncovered: [...new Set(uncovered)].sort(), complete: uncovered.length === 0 };
}

export function classifyProductChange(files: string[]) {
  const normalized = files.map((file) => file.replaceAll('\\', '/'));
  const categories = new Set<string>();
  if (normalized.some((file) => /billing|pricing|whop/i.test(file))) categories.add('PRICING_OR_BILLING');
  if (normalized.some((file) => /integrations|github|vercel|supabase/i.test(file))) categories.add('INTEGRATION');
  if (normalized.some((file) => /capabilit|softwareAgent|universal/i.test(file))) categories.add('PRODUCT_CAPABILITY');
  return { categories: [...categories], refreshRequired: categories.size > 0, state: categories.size ? 'REFRESH_DUE' : 'NO_PUBLIC_KNOWLEDGE_CHANGE' };
}

export function detectSoft404(status: number, html: string) {
  if (status !== 200) return false;
  const signals = inspectHtml(html);
  return signals.text.length < 100 || /(?:page|content) not found|nothing here|does not exist/i.test(`${signals.title} ${signals.h1.join(' ')} ${signals.text.slice(0, 500)}`);
}

export function redirectRecommendation(input: { observations: number; aiReferralVisits: number; destination: string | null; topicallyRelated: boolean }) {
  const destination = input.destination ? PUBLIC_URL_INVENTORY.find((item) => item.path === normalizePath(input.destination)) : null;
  if (input.observations < 3 || input.aiReferralVisits < 2 || !input.topicallyRelated || destination?.classification !== 'PUBLIC_INDEXABLE') return { action: 'NO_ACTION' as const, reason: 'Insufficient repeated referral evidence or no safe unambiguous destination.' };
  return { action: 'RECOMMEND_REDIRECT' as const, destination: destination.path, reason: 'Repeated AI referral demand has a related public canonical destination; human review is required.' };
}

export function publicationStatusData(record: PublicUrlRecord, verification?: LiveVerification) {
  return {
    url: record.path, publicationState: verification?.failures.length ? 'DRIFTED' : verification ? 'LIVE_VERIFIED' : 'LIVE_UNVERIFIED',
    lastLiveVerification: verification ? new Date().toISOString() : null,
    sitemapState: record.sitemap ? 'INCLUDED' : 'EXCLUDED', lastmod: record.updatedAt ?? null,
    crawlerAccess: verification?.failures.includes('ROBOTS_BLOCK') ? 'BLOCKED' : verification ? 'REACHABLE' : 'UNKNOWN',
    lastIndexNowSubmit: null, gscInspection: process.env.GSC_URL_INSPECTION_CREDENTIALS ? 'CONFIGURED_NOT_RUN' : 'NO_DATA',
    drift: verification?.failures ?? [], freshness: record.updatedAt ? 'KNOWN' : 'UNKNOWN', sourceHealth: 'NOT_LIVE_CHECKED',
  };
}
