import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRssFeed } from '../../frontend/src/lib/seoFeeds.js';
import { buildSitemapRecords } from '../../frontend/src/lib/publicUrlInventory.js';
import {
  CRAWLER_PROFILES, INDEXABLE_PUBLIC_URLS, PUBLICATION_STATES, PUBLIC_URL_INVENTORY,
  analyzeLinkGraph, analyzeSemanticHtml, assertSafeFetchUrl, assessDeploymentRevision, auditRouteInventoryPaths,
  buildFreshnessQueue, buildPublicationReceipt, classifyDeploymentImpact,
  classifyExternalSourceHealth, classifyProductChange, detectChallengePage, detectRedirectProblems, detectSoft404, evaluatePublicationEligibility,
  fingerprintDrift, googleDiscoveryState, indexNowEligibility, inspectGoogleUrl, inspectHtml, loadPublicationSource,
  isPrivateNetworkAddress, mapChangedFilesToUrls, meaningfulLastmod, normalizePath, publicationTransitionAllowed,
  scheduledPublicationEligibility, submitIndexNow,
  parseRobots, redirectRecommendation, robotsAllows, safeFetch, verifyLiveUrl, verifyReleaseSha, writeArtifact,
} from './core.js';

const page = (overrides = '') => `<!doctype html><html><head><title>Useful public page</title><meta name="description" content="A sufficiently descriptive summary for this public Xroga page and the people who need to understand it before taking action."><link rel="canonical" href="https://xroga.com/example">${overrides}<script type="application/ld+json">{"@type":"WebPage"}</script></head><body><main><h1>Useful public page</h1><p>${'Meaningful server rendered content '.repeat(12)}</p><a href="/pricing">Pricing</a></main></body></html>`;
const response = (html: string, status = 200, headers: Record<string, string> = { 'content-type': 'text/html' }) => new Response(html, { status, headers });
const record = { ...INDEXABLE_PUBLIC_URLS[0], path: '/example', canonical: 'https://xroga.com/example' };

test('publication state machine contains build, live, discovery, refresh and retirement states', () => {
  for (const state of ['DRAFT', 'BUILD_FAILED', 'PREVIEW_VERIFIED', 'LIVE_VERIFIED', 'DISCOVERY_SUBMITTED', 'REFRESH_DUE', 'DRIFTED', 'RETIRED']) assert.ok(PUBLICATION_STATES.includes(state as never));
});

test('publication state transitions reject illegitimate lifecycle jumps', () => {
  assert.equal(publicationTransitionAllowed('DRAFT', 'LIVE_VERIFIED'), false);
  assert.equal(publicationTransitionAllowed('APPROVED', 'READY_TO_BUILD'), true);
  assert.equal(publicationTransitionAllowed('PREVIEW_VERIFIED', 'MERGED'), true);
  assert.equal(publicationTransitionAllowed('RETIRED', 'DRAFT'), false);
});

test('public URL registry is unique and classifies private, system, and indexable routes', () => {
  assert.equal(new Set(PUBLIC_URL_INVENTORY.map((item) => item.path)).size, PUBLIC_URL_INVENTORY.length);
  assert.equal(PUBLIC_URL_INVENTORY.find((item) => item.path === '/workspace')?.classification, 'PRIVATE');
  assert.equal(PUBLIC_URL_INVENTORY.find((item) => item.path === '/robots.txt')?.classification, 'SYSTEM');
  assert.equal(PUBLIC_URL_INVENTORY.find((item) => item.path === '/build-with/github')?.classification, 'PUBLIC_INDEXABLE');
  assert.equal(PUBLIC_URL_INVENTORY.find((item) => item.path === '/image')?.classification, 'PUBLIC_NOINDEX');
  assert.equal(PUBLIC_URL_INVENTORY.find((item) => item.path === '/showcase/modern-business-website/preview')?.classification, 'PUBLIC_NOINDEX');
});

test('manifest-backed and legacy runtime pages coexist in the normalized inventory', () => {
  assert.match(PUBLIC_URL_INVENTORY.find((item) => item.path === '/build-with/github')?.manifestSource ?? '', /manifest/);
  assert.equal(PUBLIC_URL_INVENTORY.find((item) => item.path === '/compare/xroga-vs-lovable')?.manifestSource, undefined);
});

test('sitemap contains exactly indexable sitemap records and honest known dates only', () => {
  const output = buildSitemapRecords();
  assert.deepEqual(output.map((item) => item.url), INDEXABLE_PUBLIC_URLS.map((item) => item.canonical));
  assert.equal(output.some((item) => item.url === 'https://xroga.com/workspace'), false);
  assert.equal(output.find((item) => item.url.endsWith('/build-with/github'))?.lastModified?.toISOString().slice(0, 10), '2026-09-22');
  assert.equal(output.find((item) => item.url.endsWith('/features'))?.lastModified, undefined);
});

test('unrelated deploy cannot manufacture a lastmod value', () => {
  const undated = { ...record, updatedAt: undefined };
  assert.equal(meaningfulLastmod(undated), null);
  assert.equal(meaningfulLastmod(record, { updatedAt: '2026-09-01' } as never), '2026-09-01');
});

test('publication eligibility accepts certified manifests and blocks draft/unsafe evidence', async () => {
  const source = await loadPublicationSource();
  const item = PUBLIC_URL_INVENTORY.find((entry) => entry.path === '/build-with/github')!;
  const manifest = source.manifests.find((entry) => entry.file === item.manifestSource)!.manifest;
  assert.equal(evaluatePublicationEligibility(item, manifest).status, 'PUBLICATION_ELIGIBLE');
  assert.equal(evaluatePublicationEligibility(item, { ...manifest, indexStatus: 'DRAFT' }).status, 'PUBLICATION_BLOCKED');
  assert.equal(evaluatePublicationEligibility(item, { ...manifest, evidenceManifest: manifest.evidenceManifest.map((entry) => ({ ...entry, publicSafe: false })) }).status, 'PUBLICATION_BLOCKED');
});

test('changed-file mapping handles direct, dependent, global and unknown impact', async () => {
  const direct = await mapChangedFilesToUrls(['content/manifests/build-with-github.json']);
  assert.deepEqual(direct.directlyChangedUrls, ['/build-with/github']);
  const dependent = await mapChangedFilesToUrls(['growth/source/facts.json']);
  assert.ok(dependent.dependentUrls.length > 0);
  const global = await mapChangedFilesToUrls(['frontend/src/app/layout.tsx']);
  assert.equal(global.globalImpact, true); assert.equal(global.dependentUrls.length, INDEXABLE_PUBLIC_URLS.length);
  const unknown = await mapChangedFilesToUrls(['frontend/src/mystery/unknown.ts']);
  assert.deepEqual(unknown.unknownImpact, ['frontend/src/mystery/unknown.ts']);
  const robots = await mapChangedFilesToUrls(['frontend/src/app/robots.ts']);
  assert.equal(robots.discoveryImpact, true); assert.equal(robots.globalImpact, false);
  const styles = await mapChangedFilesToUrls(['frontend/src/styles/site.css']);
  assert.deepEqual(styles.directlyChangedUrls, []); assert.deepEqual(styles.unknownImpact, []);
  assert.equal(styles.deploymentImpact.frontendDeploymentRequired, true);
});

test('deployment drift is component-aware and does not require main SHA equality', () => {
  const mainSha = 'b'.repeat(40); const deployedSha = 'a'.repeat(40);
  assert.deepEqual(assessDeploymentRevision({
    mainSha, frontendSha: deployedSha, backendSha: deployedSha,
    filesSinceFrontend: ['docs/audit.md'], filesSinceBackend: ['docs/audit.md'],
  }).frontend, 'NO_DEPLOY_REQUIRED');
  assert.equal(assessDeploymentRevision({
    mainSha, frontendSha: deployedSha, backendSha: deployedSha,
    filesSinceFrontend: ['frontend/src/app/pricing/page.tsx'], filesSinceBackend: [],
  }).frontend, 'DEPLOY_REQUIRED');
  assert.equal(assessDeploymentRevision({
    mainSha, frontendSha: deployedSha, backendSha: deployedSha,
    filesSinceFrontend: [], filesSinceBackend: ['backend/src/routes/chat.ts'],
  }).backend, 'DEPLOY_REQUIRED');
  assert.equal(assessDeploymentRevision({
    mainSha, frontendSha: deployedSha, backendSha: deployedSha,
    filesSinceFrontend: ['frontend/src/app/pricing/page.test.tsx'], filesSinceBackend: ['backend/src/foo.test.ts'],
  }).frontend, 'NO_DEPLOY_REQUIRED');
  assert.equal(classifyDeploymentImpact(['content/manifests/build-with-github.json']).publicContentImpact, true);
});

test('inventory completeness flags omitted static/dynamic routes and accepts registered sources/private prefixes', () => {
  const complete = auditRouteInventoryPaths([
    'frontend/src/app/page.tsx',
    'frontend/src/app/(shell)/dashboard/projects/page.tsx',
    'frontend/src/app/docs/[slug]/page.tsx',
  ]);
  assert.equal(complete.complete, true);
  const missing = auditRouteInventoryPaths(['frontend/src/app/new-public/page.tsx', 'frontend/src/app/catalog/[slug]/page.tsx']);
  assert.deepEqual(missing.uncovered, ['/catalog/[slug]', '/new-public']);
});

test('RSS generation escapes values, uses stable GUIDs and rejects duplicates', () => {
  const xml = buildRssFeed('A & B', '/blog', 'Summary', [{ title: '<Title>', path: '/blog/a', description: 'A & B', publishedAt: '2026-09-01' }]);
  assert.match(xml, /A &amp; B/); assert.match(xml, /<guid isPermaLink="true">https:\/\/xroga.com\/blog\/a<\/guid>/);
  assert.throws(() => buildRssFeed('x', '/blog', 'x', [
    { title: 'a', path: '/blog/a', description: 'a', publishedAt: '2026-09-01' },
    { title: 'b', path: '/blog/a', description: 'b', publishedAt: '2026-09-02' },
  ]), /Duplicate feed GUID/);
});

test('crawler profiles separate traditional search and AI retrieval', () => {
  assert.equal(CRAWLER_PROFILES.find((item) => item.name === 'googlebot')?.purpose, 'TRADITIONAL_SEARCH');
  assert.equal(CRAWLER_PROFILES.find((item) => item.name === 'oai-searchbot')?.purpose, 'SEARCH_RETRIEVAL');
});

test('robots parser preserves search/training distinction and sitemap', () => {
  const robots = 'User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\nSitemap: https://xroga.com/sitemap.xml';
  assert.equal(parseRobots(robots).sitemaps[0], 'https://xroga.com/sitemap.xml');
  assert.equal(robotsAllows(robots, 'OAI-SearchBot/1.4', '/pricing'), true);
  assert.equal(robotsAllows(robots, 'GPTBot/1.4', '/pricing'), false);
});

test('HTML inspection preserves canonical, headings, links and structured data', () => {
  const signals = inspectHtml(page());
  assert.equal(signals.canonical, 'https://xroga.com/example'); assert.deepEqual(signals.h1, ['Useful public page']);
  assert.deepEqual(signals.links, ['/pricing']); assert.equal(signals.schemas.length, 1); assert.ok(signals.text.length > 180);
});

test('semantic fingerprint ignores scripts but changes for content, canonical and important metadata', () => {
  const base = inspectHtml(page());
  assert.equal(inspectHtml(page().replace('</body>', '<script>window.buildId="random"</script></body>')).contentHash, base.contentHash);
  assert.notEqual(inspectHtml(page().replace('Useful public page</h1>', 'Changed public page</h1>')).contentHash, base.contentHash);
  assert.notEqual(inspectHtml(page().replace('https://xroga.com/example', 'https://xroga.com/changed')).contentHash, base.contentHash);
  assert.notEqual(inspectHtml(page().replace('sufficiently descriptive summary', 'different descriptive summary')).contentHash, base.contentHash);
});

test('semantic HTML audit detects heading, main, image-alt and table problems', () => {
  const result = analyzeSemanticHtml('<html><h1>A</h1><h1>B</h1><h3>C</h3><img src="x"><div role="table">x</div></html>');
  assert.deepEqual(result.findings.sort(), ['H1_COUNT', 'HEADING_LEVEL_SKIP', 'IMAGE_ALT_MISSING', 'MAIN_MISSING', 'TABLE_SEMANTICS_MISSING'].sort());
});

test('live verifier fails a build-pass/live-404 publication', async () => {
  const result = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', fetchImpl: async () => response('not found', 404) });
  assert.ok(result.failures.includes('LIVE_404'));
});

test('live verifier blocks noindex and canonical mismatch', async () => {
  const noindex = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', fetchImpl: async () => response(page('<meta name="robots" content="noindex">')) });
  assert.ok(noindex.failures.includes('NOINDEX'));
  const mismatch = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', fetchImpl: async () => response(page().replace('https://xroga.com/example', 'https://xroga.com/other')) });
  assert.ok(mismatch.failures.includes('CANONICAL_MISMATCH'));
});

test('live verifier treats the equivalent root canonical with or without a trailing slash as a match', async () => {
  const home = { ...record, path: '/', canonical: 'https://xroga.com/' };
  const html = page().replace('https://xroga.com/example', 'https://xroga.com');
  const result = await verifyLiveUrl(home, { baseUrl: 'http://localhost:3000', fetchImpl: async () => response(html) });
  assert.equal(result.failures.includes('CANONICAL_MISMATCH'), false);
});

test('live verifier detects missing sitemap and client-only critical content', async () => {
  const missing = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', sitemap: '<urlset/>', fetchImpl: async () => response(page()) });
  assert.ok(missing.failures.includes('SITEMAP_MISSING'));
  const shell = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', fetchImpl: async () => response('<html><head><link rel="canonical" href="https://xroga.com/example"></head><body><div id="app"></div></body></html>') });
  assert.ok(shell.failures.includes('CLIENT_ONLY_CRITICAL_CONTENT'));
});

test('live verifier enforces title, description and X-Robots-Tag indexability', async () => {
  const html = page().replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '');
  const result = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', fetchImpl: async () => response(html, 200, { 'content-type': 'text/html', 'x-robots-tag': 'noindex' }) });
  assert.ok(result.failures.includes('TITLE_MISSING'));
  assert.ok(result.failures.includes('DESCRIPTION_MISSING'));
  assert.ok(result.failures.includes('NOINDEX'));
});

test('live verifier exposes semantic and performance diagnostics without inventing a pass', async () => {
  const html = page().replace('<main>', '<div>').replace('</main>', '</div>');
  const result = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', fetchImpl: async () => response(html) });
  assert.ok(result.semanticFindings.includes('MAIN_MISSING'));
  assert.equal(typeof result.durationMs, 'number');
});

test('challenge response differentiates robots permission from WAF retrieval', async () => {
  const result = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', userAgent: CRAWLER_PROFILES[3].userAgent, fetchImpl: async () => response('<title>Just a moment</title><p>Verify you are human</p>', 403) });
  assert.equal(result.challenge, true); assert.ok(result.failures.includes('ROBOTS_BLOCK'));
});

test('challenge detection catches 200 challenge/auth walls and does not flag normal pages', () => {
  assert.equal(detectChallengePage(200, '<title>Vercel Authentication</title><p>Authentication required</p>', 'https://xroga.com/pricing').blocked, true);
  assert.equal(detectChallengePage(200, '<title>Access denied</title>', 'https://xroga.com/pricing').challenge, true);
  assert.equal(detectChallengePage(200, page(), 'https://xroga.com/example').blocked, false);
});

test('network uncertainty is not reported as a confirmed 404', async () => {
  const result = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', fetchImpl: async () => { throw new TypeError('network down'); } });
  assert.equal(result.networkState, 'UNKNOWN'); assert.deepEqual(result.failures, ['NETWORK_UNKNOWN']);
});

test('IndexNow requires a meaningful changed, live verified canonical URL', () => {
  const verification = { status: 200, failures: [] } as never;
  assert.equal(indexNowEligibility(record, verification, true).eligible, true);
  assert.equal(indexNowEligibility(record, verification, false).eligible, false);
  assert.equal(indexNowEligibility(record, { status: 404, failures: ['LIVE_404'] } as never, true).eligible, false);
});

test('IndexNow defaults safe and remains unavailable without keys', async () => {
  const oldKey = process.env.INDEXNOW_KEY; const oldLocation = process.env.INDEXNOW_KEY_LOCATION;
  delete process.env.INDEXNOW_KEY; delete process.env.INDEXNOW_KEY_LOCATION;
  assert.equal((await submitIndexNow(['https://xroga.com/pricing'])).status, 'UNAVAILABLE');
  process.env.INDEXNOW_KEY = 'test-key'; process.env.INDEXNOW_KEY_LOCATION = 'https://xroga.com/test-key.txt';
  assert.equal((await submitIndexNow(['https://xroga.com/pricing'])).status, 'DRY_RUN');
  if (oldKey) process.env.INDEXNOW_KEY = oldKey; else delete process.env.INDEXNOW_KEY;
  if (oldLocation) process.env.INDEXNOW_KEY_LOCATION = oldLocation; else delete process.env.INDEXNOW_KEY_LOCATION;
});

test('IndexNow hard errors are bounded and do not pretend to submit to Google', async () => {
  const oldKey = process.env.INDEXNOW_KEY; const oldLocation = process.env.INDEXNOW_KEY_LOCATION;
  process.env.INDEXNOW_KEY = 'test-key'; process.env.INDEXNOW_KEY_LOCATION = 'https://xroga.com/test-key.txt';
  let calls = 0; const result = await submitIndexNow(['https://xroga.com/pricing'], { dryRun: false, fetchImpl: async (input) => {
    calls += 1;
    return String(input).includes('test-key.txt') ? new Response('test-key', { status: 200 }) : new Response('', { status: 400 });
  } });
  assert.equal(result.status, 'FAILED'); assert.equal(calls, 2);
  const google = googleDiscoveryState(record, true, true);
  assert.equal(google.submission, 'NOT_SUPPORTED_FOR_GENERAL_WEB_PAGES'); assert.equal(JSON.stringify(google).includes('IndexNow submitted to Google'), false);
  if (oldKey) process.env.INDEXNOW_KEY = oldKey; else delete process.env.INDEXNOW_KEY;
  if (oldLocation) process.env.INDEXNOW_KEY_LOCATION = oldLocation; else delete process.env.INDEXNOW_KEY_LOCATION;
});

test('IndexNow refuses an unverified key and bounds transient retries without exposing it', async () => {
  const oldKey = process.env.INDEXNOW_KEY; const oldLocation = process.env.INDEXNOW_KEY_LOCATION;
  process.env.INDEXNOW_KEY = 'secret-test-key'; process.env.INDEXNOW_KEY_LOCATION = 'https://xroga.com/secret-test-key.txt';
  const refused = await submitIndexNow(['https://xroga.com/pricing'], { dryRun: false, fetchImpl: async () => new Response('wrong', { status: 200 }) });
  assert.equal(refused.status, 'REFUSED'); assert.equal(JSON.stringify(refused).includes('secret-test-key'), false);
  let calls = 0;
  const rateLimited = await submitIndexNow(['https://xroga.com/pricing'], { dryRun: false, fetchImpl: async (input) => {
    calls += 1;
    return String(input).includes('secret-test-key.txt') ? new Response('secret-test-key', { status: 200 }) : new Response('', { status: 429 });
  } });
  assert.equal(rateLimited.status, 'FAILED'); assert.equal(rateLimited.responseCode, 429); assert.equal(calls, 4);
  if (oldKey) process.env.INDEXNOW_KEY = oldKey; else delete process.env.INDEXNOW_KEY;
  if (oldLocation) process.env.INDEXNOW_KEY_LOCATION = oldLocation; else delete process.env.INDEXNOW_KEY_LOCATION;
});

test('GSC URL Inspection remains NO_DATA or returns provider evidence without invention', async () => {
  assert.equal((await inspectGoogleUrl('https://xroga.com/pricing')).state, 'NO_DATA');
  const inspected = await inspectGoogleUrl('https://xroga.com/pricing', async () => ({ state: 'INDEXED', inspectedAt: '2026-09-22T00:00:00Z', googleCanonical: 'https://xroga.com/pricing', lastCrawl: '2026-09-21T00:00:00Z', robotsState: 'ALLOWED', coverage: 'Submitted and indexed' }));
  assert.equal(inspected.state, 'INDEXED');
});

test('release SHA and content fingerprint drift are independently verifiable', async () => {
  const sha = 'a'.repeat(40);
  assert.equal((await verifyReleaseSha('http://localhost:3000', sha, async () => response(JSON.stringify({ release: sha }), 200, { 'content-type': 'application/json' }))).state, 'MATCH');
  const verification = await verifyLiveUrl(record, { baseUrl: 'http://localhost:3000', fetchImpl: async () => response(page()) });
  assert.equal(fingerprintDrift(verification.signals!.contentHash, verification).state, 'MATCH');
  assert.equal(fingerprintDrift('different', verification).state, 'DRIFTED');
  assert.equal((await verifyReleaseSha('http://localhost:3000', sha, async () => response(JSON.stringify({ release: 'b'.repeat(40) }), 200, { 'content-type': 'application/json' }))).state, 'MISMATCH');
});

test('publication receipts never contain credentials and are atomic on blocking failure', () => {
  const receipt = buildPublicationReceipt({ record, verification: { status: 404, contentType: 'text/html', indexability: 'BLOCKED', failures: ['LIVE_404'], warnings: [], challenge: false, networkState: 'CONFIRMED' } as never, sitemapPresent: false, commitSha: 'abc' });
  assert.equal(receipt.result, 'FAILED'); assert.equal('authorization' in receipt, false); assert.equal(receipt.commit_sha, 'abc');
});

test('missing sitemap is a blocking publication receipt failure', () => {
  const receipt = buildPublicationReceipt({
    record,
    verification: { status: 200, contentType: 'text/html', indexability: 'BLOCKED', failures: ['SITEMAP_MISSING'], warnings: [], challenge: false, networkState: 'CONFIRMED' } as never,
    sitemapPresent: false,
  });
  assert.equal(receipt.result, 'FAILED');
});

test('publication receipt identity is stable for the same URL, commit, response and content', () => {
  const verification = { status: 200, contentType: 'text/html', indexability: 'INDEXABLE', failures: [], warnings: [], semanticFindings: [], challenge: false, networkState: 'CONFIRMED', signals: inspectHtml(page()) } as never;
  const first = buildPublicationReceipt({ record, verification, sitemapPresent: true, commitSha: 'abc' });
  const second = buildPublicationReceipt({ record, verification, sitemapPresent: true, commitSha: 'abc' });
  assert.equal(first.publication_id, second.publication_id);
});

test('publication receipt exposes semantic fingerprint drift as a blocking failure', () => {
  const verification = { status: 200, contentType: 'text/html', indexability: 'INDEXABLE', failures: [], warnings: [], semanticFindings: [], challenge: false, networkState: 'CONFIRMED', signals: inspectHtml(page()) } as never;
  const receipt = buildPublicationReceipt({ record, verification, sitemapPresent: true, expectedHash: 'different' });
  assert.equal(receipt.drift_state, 'DRIFTED');
  assert.equal(receipt.result, 'FAILED');
  assert.ok(receipt.failures.includes('DRIFT'));
});

test('redirect registry has no loops, self redirects, or redirects to private product surfaces', () => assert.deepEqual(detectRedirectProblems(), []));

test('link graph reports orphans, broken links and finite click depth', () => {
  const graph = analyzeLinkGraph([{ path: '/', links: ['/a', '/missing'] }, { path: '/a', links: ['/b'] }, { path: '/b', links: [] }, { path: '/orphan', links: [] }]);
  assert.deepEqual(graph.orphans, ['/orphan']); assert.equal(graph.depths['/b'], 2); assert.deepEqual(graph.broken, [{ source: '/', target: '/missing' }]);
});

test('link graph recognizes concrete noindex previews, private subpaths, and public research downloads', () => {
  const graph = analyzeLinkGraph([{ path: '/', links: [
    '/showcase/modern-business-website/preview',
    '/dashboard/projects/example',
    '/research/web3-hackathon-sources.json',
  ] }]);
  assert.deepEqual(graph.broken, []);
});

test('soft 404 detection requires a 200 response with error-like or empty content', () => {
  assert.equal(detectSoft404(200, '<title>Page not found</title><h1>Nothing here</h1>'), true);
  assert.equal(detectSoft404(404, '<title>Page not found</title>'), false);
  assert.equal(detectSoft404(200, page()), false);
});

test('external source health keeps timeout, rate limit, server failure and confirmed breakage distinct', () => {
  assert.equal(classifyExternalSourceHealth({ status: null, timedOut: true }).state, 'UNKNOWN');
  assert.equal(classifyExternalSourceHealth({ status: 429 }).state, 'RATE_LIMITED');
  assert.equal(classifyExternalSourceHealth({ status: 503 }).state, 'TEMPORARILY_UNAVAILABLE');
  assert.equal(classifyExternalSourceHealth({ status: 404 }).state, 'BROKEN');
  assert.equal(classifyExternalSourceHealth({ status: 200 }).state, 'HEALTHY');
});

test('URL normalization removes query noise and trailing slash without collapsing the root', () => {
  assert.equal(normalizePath('https://xroga.com/pricing/?utm_source=test'), '/pricing');
  assert.equal(normalizePath('https://xroga.com/?utm_source=test'), '/');
});

test('hallucinated paths need repeated real referral evidence before redirect recommendation', () => {
  assert.equal(redirectRecommendation({ observations: 1, aiReferralVisits: 1, destination: '/pricing', topicallyRelated: true }).action, 'NO_ACTION');
  assert.equal(redirectRecommendation({ observations: 5, aiReferralVisits: 3, destination: '/pricing', topicallyRelated: true }).action, 'RECOMMEND_REDIRECT');
  assert.equal(redirectRecommendation({ observations: 5, aiReferralVisits: 3, destination: '/workspace', topicallyRelated: true }).action, 'NO_ACTION');
});

test('freshness queue returns typed source, claim, or asset work without inventing current data', async () => {
  const queue = await buildFreshnessQueue(new Date('2030-01-01T00:00:00Z'));
  assert.ok(queue.length > 0); assert.ok(queue.every((item) => ['SOURCE', 'CLAIM', 'ASSET'].includes(item.type)));
});

test('scheduled publication is due only when explicitly approved', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  assert.equal(scheduledPublicationEligibility({ state: 'APPROVED', approved: true, scheduledAt: '2026-09-22T11:00:00Z' }, now).eligible, true);
  assert.equal(scheduledPublicationEligibility({ state: 'DRAFT', approved: false, scheduledAt: '2026-09-22T11:00:00Z' }, now).reason, 'APPROVAL_REQUIRED');
  assert.equal(scheduledPublicationEligibility({ state: 'APPROVED', approved: true, scheduledAt: '2026-09-23T11:00:00Z' }, now).reason, 'NOT_DUE');
});

test('product changes create refresh work only for public-knowledge classes', () => {
  assert.equal(classifyProductChange(['backend/src/billing/whop.ts']).state, 'REFRESH_DUE');
  assert.equal(classifyProductChange(['backend/src/foo.test.ts']).state, 'NO_PUBLIC_KNOWLEDGE_CHANGE');
});

test('SSRF defenses reject credentials, cross-origin, and private network targets', async () => {
  await assert.rejects(assertSafeFetchUrl('http://127.0.0.1/admin'), /Cross-origin|Private/);
  await assert.rejects(assertSafeFetchUrl('https://user:pass@xroga.com/'), /credential-free/);
  await assert.rejects(assertSafeFetchUrl('https://example.com/'), /Cross-origin/);
  assert.equal((await assertSafeFetchUrl('http://localhost:3000/page', 'http://localhost:3000', true)).pathname, '/page');
  for (const address of ['100.64.0.1', '198.18.0.1', '192.0.0.1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1']) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }
});

test('SSRF defenses re-check redirects and reject private DNS resolution', async () => {
  await assert.rejects(assertSafeFetchUrl('https://xroga.com/', 'https://xroga.com', false, (async () => [{ address: '127.0.0.1', family: 4 }]) as never), /Private/);
  let calls = 0;
  await assert.rejects(safeFetch('https://xroga.com/start', {
    lookup: (async () => [{ address: '93.184.216.34', family: 4 }]) as never,
    fetchImpl: (async () => {
      calls += 1;
      return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/internal' } });
    }) as never,
  }), /Cross-origin|Private/);
  assert.equal(calls, 1);
});

test('artifact path handling rejects traversal', async () => {
  await assert.rejects(writeArtifact('../secret.json', {}), /unsafe/);
});
