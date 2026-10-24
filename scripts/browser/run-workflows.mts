/**
 * Phase 3 workflow suite (INFRA-007): real Chromium in the hardened container, driven through the FULL Xroga path
 *   runBrowserTask -> ExecutionScheduler -> canonical browser task handler -> ContainerBrowserWorker -> container + production egress proxy
 * with failure injection (cancellation, timeout, killed container, concurrency, model refusal). Drive is the in-memory test store here
 * (real R2 is exercised separately); everything else is the production code path.
 *
 *   tsx scripts/browser/run-workflows.mts [--only W01,W06] [--label DOCKER_LOCAL_TESTED|GCE_HOST_TESTED] [--out file.json]
 *
 * Prints and writes one receipt per workflow: expected vs actual, task status, failure code, postconditions, attempts, evidence kinds,
 * timings, model cost, cleanup. A receipt is PASS only when the actual behaviour equals the expected behaviour.
 */
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryExecutionStateStore } from '../../backend/src/ai/executionRuntime.js';
import { createTenantContext } from '../../backend/src/security/tenantContext.js';
import { harness } from '../../backend/src/storage/testing/harness.js';
import { MemoryLeaseStore } from '../../backend/src/workers/leaseStore.js';
import { AdmissionController } from '../../backend/src/workers/admission.js';
import { runBrowserTask, type BrowserCapabilityDeps, type BrowserRunRequest } from '../../backend/src/workers/browserCapability.js';
import { ContainerBrowserWorker, type BrowserModelGateway } from '../../backend/src/workers/containerBrowserWorker.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const only = arg('--only')?.split(',');
const label = arg('--label', 'DOCKER_LOCAL_TESTED')!;
const outFile = resolve(arg('--out', join(repoRoot, 'out', 'phase3-workflows.json'))!);
const browserImage = arg('--browser-image', 'xroga-browser-worker:phase3')!;
const proxyImage = arg('--proxy-image', 'xroga-egress-proxy:phase2-test')!;
const docker = (args: string[]) => spawnSync('docker', args, { encoding: 'utf8' });
const sourceSha = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const imageId = docker(['image', 'inspect', '-f', '{{.Id}}', browserImage]).stdout.trim();

const h = harness();
const stores = new Map<string, InMemoryExecutionStateStore>();
const storeFor = (u: string) => { if (!stores.has(u)) stores.set(u, new InMemoryExecutionStateStore()); return stores.get(u)!; };
const leases = new MemoryLeaseStore();
const admission = new AdmissionController({ maxConcurrent: 4, maxPerTenant: 2, maxQueuedPerTenant: 4, maxQueuedTotal: 16 });
const mkDeps = (gateway?: BrowserModelGateway): BrowserCapabilityDeps => ({
  worker: new ContainerBrowserWorker({ repoRoot, browserImage, proxyImage, gateway, aiChannel: 'chromium' }),
  leases, drive: h.svc, storeFor, workerId: 'workflow-runner', admission,
  authoriseProject: async (actor, projectId) => h.svc.listObjects(actor, { projectId, limit: 1 }).then(() => true, () => false),
});
const alice = createTenantContext({ userId: h.alice.userId, via: 'local_jwt' });
const bob = createTenantContext({ userId: h.bob.userId, via: 'local_jwt' });
const Q = 'https://quotes.toscrape.com';
const limits = (over: Record<string, number> = {}) => ({ maxDurationMs: 120_000, maxNavigations: 30, maxRedirects: 5, maxPages: 3, maxResponseBytes: 50_000_000, maxArtifactBytes: 20_000_000, maxModelCostMicros: 0, ...over });

interface Receipt { id: string; title: string; expected: string; actual: string; pass: boolean; details: Record<string, unknown> }
const receipts: Receipt[] = [];
const leftovers = () => ({ containers: docker(['ps', '-aq', '--filter', 'label=xroga.browser-job=1']).stdout.trim().split('\n').filter(Boolean).length, networks: docker(['network', 'ls', '-q', '--filter', 'label=xroga.browser-job=1']).stdout.trim().split('\n').filter(Boolean).length });

async function run(ctx: typeof alice, req: BrowserRunRequest, deps = mkDeps(), signal?: AbortSignal) {
  const t0 = Date.now();
  try {
    const r = await runBrowserTask(ctx, req, deps, signal);
    const out = (r.task.output ?? {}) as Record<string, any>;
    return { runId: r.runId, status: r.task.status, attempts: r.task.attempts, code: out.failure?.code ?? null, outcomeVerified: out.outcomeVerified ?? null, postconditions: out.postconditions?.map((p: any) => `${p.kind}:${p.passed}`) ?? [], extracted: out.extracted ?? null, metrics: out.metrics ?? null, evidence: r.task.evidence.map((e) => e.kind), elapsedMs: Date.now() - t0 };
  } catch (e) { return { status: 'refused', attempts: 0, code: (e as any).code ?? 'ERROR', error: (e as Error).message.slice(0, 200), elapsedMs: Date.now() - t0 } as any; }
}
function record(id: string, title: string, expected: string, pass: boolean, details: Record<string, unknown>) {
  const r = { id, title, expected, actual: `${details.status}${details.code ? ` (${details.code})` : ''}`, pass, details: { ...details, cleanup: leftovers() } };
  if ((r.details.cleanup as any).containers || (r.details.cleanup as any).networks) r.pass = false;
  receipts.push(r); console.log(`${r.pass ? 'PASS' : 'FAIL'} ${id} ${title}: expected ${expected}; got ${r.actual}`);
}
/** Kills the FIRST browser container once it has run for `afterMs`; later attempts are left alone. Returns a stop function. */
function killFirstAttempt(afterMs: number) {
  let done = false;
  const poll = setInterval(() => {
    if (done) return;
    const id = docker(['ps', '-q', '--filter', 'label=xroga.browser-job=1', '--filter', 'name=xroga-bj-browser']).stdout.trim().split('\n').filter(Boolean)[0];
    if (id) { done = true; setTimeout(() => docker(['kill', id]), afterMs); }
  }, 150);
  return () => clearInterval(poll);
}

const workflows: Record<string, () => Promise<void>> = {
  async W01() {
    const ok = await run(alice, { goal: 'open wikipedia and follow its redirect', startUrl: 'https://wikipedia.org/', allowedOrigins: ['https://wikipedia.org', 'https://www.wikipedia.org'], limits: limits(),
      plan: { steps: [{ op: 'extractText', selector: 'title', name: 'title' }, { op: 'screenshot', name: 'w01.png' }], expect: [{ kind: 'finalUrlPrefix', prefix: 'https://www.wikipedia.org/' }, { kind: 'artifact', name: 'w01.png' }] } });
    record('W01a', 'redirect followed, final destination verified', 'completed, outcome verified', ok.status === 'completed' && ok.outcomeVerified === true, ok);
    const bad = await run(alice, { goal: 'redirect to an origin outside the scope', startUrl: 'https://wikipedia.org/', allowedOrigins: ['https://wikipedia.org'], limits: limits(),
      plan: { steps: [{ op: 'screenshot', name: 'w01b.png' }], expect: [{ kind: 'artifact', name: 'w01b.png' }] } });
    record('W01b', 'redirect to an out-of-scope origin is refused', 'not completed (RESULT_OUT_OF_SCOPE or WORKER_FAILED)', bad.status !== 'completed', bad);
  },
  async W02() {
    const r = await run(alice, { goal: 'read two pages of quotes', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits(), projectId: h.aliceProject,
      plan: { steps: [{ op: 'extractText', selector: '.quote .author', name: 'authors', all: true }, { op: 'click', selector: 'li.next > a' }, { op: 'waitFor', urlPrefix: `${Q}/page/2`, timeoutMs: 15_000 }, { op: 'extractText', selector: '.quote .text', name: 'page2', all: true }, { op: 'screenshot', name: 'w02.png' }],
        expect: [{ kind: 'extracted', name: 'authors', minItems: 10, contains: 'Albert Einstein' }, { kind: 'extracted', name: 'page2', minItems: 10 }, { kind: 'finalUrlPrefix', prefix: `${Q}/page/2` }, { kind: 'artifact', name: 'w02.png', mediaType: 'image/png' }, { kind: 'noConsequentialAction' }] } });
    const stored = (await h.svc.listObjects(h.alice, { projectId: h.aliceProject })).filter((o) => o.filename.endsWith('w02.png') && o.state === 'READY');
    record('W02', 'deterministic click, wait, extraction; evidence READY in Drive', 'completed, outcome verified, 1 READY artifact', r.status === 'completed' && r.outcomeVerified === true && stored.length === 1, { ...r, driveObjects: stored.map((o) => ({ id: o.id, sha256: o.sha256, bytes: o.sizeBytes })) });
  },
  async W04() {
    const r = await run(alice, { goal: 'walk three pages with markup-change recovery', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits(),
      plan: { steps: [
        { op: 'click', selector: ['a.pagination-next-v2', 'nav .next-page', 'li.next > a'] }, { op: 'waitFor', urlPrefix: `${Q}/page/2`, timeoutMs: 15_000 },
        { op: 'click', selector: ['button#load-more', 'li.next > a'] }, { op: 'waitFor', urlPrefix: `${Q}/page/3`, timeoutMs: 15_000 },
        { op: 'extractText', selector: ['.quote-v2 .text', '.quote .text'], name: 'page3', all: true }, { op: 'screenshot', name: 'w04.png' }],
        expect: [{ kind: 'finalUrlPrefix', prefix: `${Q}/page/3` }, { kind: 'extracted', name: 'page3', minItems: 10 }, { kind: 'artifact', name: 'w04.png' }] } });
    record('W04', 'multi-page with selector recovery (first alternatives absent)', 'completed, outcome verified', r.status === 'completed' && r.outcomeVerified === true, r);
  },
  async W06() {
    const login = await run(alice, { goal: 'sign in to the test site and confirm the session', startUrl: `${Q}/login`, allowedOrigins: [Q], limits: limits(),
      plan: { writeGrant: { grantId: 'grant-w06-synthetic-login', actions: ['submit'] }, steps: [
        { op: 'fill', selector: '#username', value: 'xroga-synthetic' }, { op: 'fill', selector: '#password', value: 'synthetic-test-value' },
        { op: 'click', selector: 'input[type=submit]', consequential: true }, { op: 'waitFor', selector: 'a[href="/logout"]', timeoutMs: 15_000 },
        { op: 'extractText', selector: 'a[href="/logout"]', name: 'session' }, { op: 'screenshot', name: 'w06.png' }],
        expect: [{ kind: 'extracted', name: 'session', equals: 'Logout' }, { kind: 'artifact', name: 'w06.png' }] } });
    record('W06a', 'authorised test-session sign-in with an issued write grant', 'completed, outcome verified', login.status === 'completed' && login.outcomeVerified === true, login);
    const fresh = await run(alice, { goal: 'a new job starts without the earlier session', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits(),
      plan: { steps: [{ op: 'extractText', selector: '.header-box a[href="/login"], .header-box a[href="/logout"]', name: 'session' }], expect: [{ kind: 'extracted', name: 'session', equals: 'Login' }] } });
    record('W06b', 'secure teardown: the next job has no cookies from the last', 'completed, session shows Login', fresh.status === 'completed' && fresh.outcomeVerified === true, fresh);
    const noGrant = await run(alice, { goal: 'sign in without a grant', startUrl: `${Q}/login`, allowedOrigins: [Q], limits: limits(), plan: { steps: [{ op: 'click', selector: 'input[type=submit]', consequential: true }] } });
    record('W06c', 'a consequential submit without an issued grant is refused before running', 'refused (RUN_INVALID)', noGrant.status === 'refused' && noGrant.code === 'RUN_INVALID', noGrant);
  },
  async W08() {
    const ac = new AbortController(); setTimeout(() => ac.abort(), 4_000);
    const cancelled = await run(alice, { goal: 'cancel mid-navigation', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits(),
      plan: { steps: [{ op: 'waitFor', selector: '#element-that-never-appears', timeoutMs: 30_000 }], expect: [{ kind: 'noConsequentialAction' }] } }, mkDeps(), ac.signal);
    record('W08a', 'graceful cancellation mid-job; browser and network removed', 'cancelled, nothing left behind', cancelled.status === 'cancelled' || cancelled.code === 'CANCELLED', cancelled);
    const timedOut = await run(alice, { goal: 'time out and reclaim', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits({ maxDurationMs: 8_000 }),
      plan: { steps: [{ op: 'waitFor', selector: '#element-that-never-appears', timeoutMs: 30_000 }], expect: [{ kind: 'noConsequentialAction' }] } });
    record('W08b', 'timeout kills the browser processes and reclaims the job', 'not completed (JOB_TIMEOUT), nothing left behind', timedOut.status !== 'completed' && /TIMEOUT/.test(String(timedOut.code)), timedOut);
  },
  async W09() {
    const stop = killFirstAttempt(1_200);
    const read = await run(alice, { goal: 'survive a worker crash', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits(),
      plan: { steps: [{ op: 'waitFor', selector: '.quote', timeoutMs: 15_000 }, { op: 'click', selector: 'li.next > a' }, { op: 'waitFor', urlPrefix: `${Q}/page/2`, timeoutMs: 15_000 }, { op: 'screenshot', name: 'w09.png' }], expect: [{ kind: 'artifact', name: 'w09.png' }, { kind: 'finalUrlPrefix', prefix: `${Q}/page/2` }] } });
    stop();
    record('W09a', 'read-only task: container killed, fenced retry completes', 'completed on attempt 2', read.status === 'completed' && read.attempts === 2, read);
    const stop2 = killFirstAttempt(1_200);
    const write = await run(alice, { goal: 'consequential task during a crash', startUrl: `${Q}/login`, allowedOrigins: [Q], limits: limits(),
      plan: { writeGrant: { grantId: 'grant-w09-synthetic', actions: ['submit'] }, steps: [{ op: 'waitFor', selector: '#never-there', timeoutMs: 10_000 }, { op: 'click', selector: 'input[type=submit]', consequential: true }], expect: [{ kind: 'noConsequentialAction' }] } });
    stop2();
    record('W09b', 'consequential task is not retried after a crash; reported, not repeated', 'not completed, attempts = 1', write.status !== 'completed' && write.attempts === 1, write);
  },
  async W10() {
    const a = run(alice, { goal: 'tenant A signs in', startUrl: `${Q}/login`, allowedOrigins: [Q], limits: limits(),
      plan: { writeGrant: { grantId: 'grant-w10-synthetic', actions: ['submit'] }, steps: [{ op: 'fill', selector: '#username', value: 'tenant-a' }, { op: 'fill', selector: '#password', value: 'synthetic-a' }, { op: 'click', selector: 'input[type=submit]', consequential: true }, { op: 'waitFor', selector: 'a[href="/logout"]', timeoutMs: 15_000 }, { op: 'extractText', selector: 'a[href="/logout"]', name: 'session' }], expect: [{ kind: 'extracted', name: 'session', equals: 'Logout' }] } });
    const b = run(bob, { goal: 'tenant B reads at the same time', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits(),
      plan: { steps: [{ op: 'waitFor', selector: '.quote', timeoutMs: 15_000 }, { op: 'extractText', selector: '.header-box a[href="/login"], .header-box a[href="/logout"]', name: 'session' }, { op: 'screenshot', name: 'w10b.png' }], expect: [{ kind: 'extracted', name: 'session', equals: 'Login' }] } });
    const [ra, rb] = await Promise.all([a, b]);
    const bobSeesAlice = Boolean(ra.runId && await storeFor(h.bob.userId).load(ra.runId));
    record('W10', 'two tenants concurrently: both complete, no cookie or run leakage', 'both completed, B not signed in, B cannot load A\'s runs', ra.status === 'completed' && rb.status === 'completed' && !bobSeesAlice, { a: ra, b: rb, bobSeesAlice, status: `${ra.status}/${rb.status}` });
  },
  async W13() {
    const plan = { steps: [{ op: 'aiExtract', instruction: 'extract the first author', name: 'author', fields: { author: 'string' } }], expect: [{ kind: 'extracted', name: 'author', contains: 'Einstein' }] };
    const noRoute = await run(alice, { goal: 'AI step without a configured model route', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits({ maxModelCostMicros: 50_000 }), plan });
    record('W13a', 'AI step with no model route fails closed (no paid fallback)', 'not completed (WORKER_FAILED)', noRoute.status !== 'completed', noRoute);
    const refusing: BrowserModelGateway = { generate: async () => { throw Object.assign(new Error('budget'), { code: 'MODEL_BUDGET_EXHAUSTED' }); } };
    const refused = await run(alice, { goal: 'AI step refused by the budget', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits({ maxModelCostMicros: 50_000 }), plan }, mkDeps(refusing));
    record('W13b', 'AI step refused by the model route, no fallback: fails closed', 'not completed', refused.status !== 'completed', refused);
    const withFallback = await run(alice, { goal: 'AI step refused, safe deterministic fallback', startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits({ maxModelCostMicros: 50_000 }),
      plan: { steps: [{ op: 'aiExtract', instruction: 'extract the first author', name: 'author', fields: { author: 'string' }, fallback: { op: 'extractText', selector: '.quote .author' } }], expect: [{ kind: 'extracted', name: 'author', contains: 'Einstein' }] } }, mkDeps(refusing));
    record('W13c', 'AI step refused, Playwright-only fallback where semantically safe', 'completed with a recorded fallback', withFallback.status === 'completed' && (withFallback.metrics?.fallbacks?.length ?? 0) === 1, withFallback);
  },
};

// host start: reap orphans a previous runner left behind (a crashed host process cannot clean up after itself)
const reaped = new ContainerBrowserWorker({ repoRoot, browserImage, proxyImage }).reapOrphans();
console.log(`reaped at start: ${reaped.containers} containers, ${reaped.networks} networks`);
/** Samples memory and CPU of every running browser-job container until stopped; returns peaks per container. */
function sampler() {
  const peaks = new Map<string, { memMiB: number; cpuPct: number }>();
  let on = true;
  const tick = () => {
    if (!on) return;
    const r = spawnSync('docker', ['stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}|{{.CPUPerc}}', ...docker(['ps', '-q', '--filter', 'label=xroga.browser-job=1']).stdout.trim().split('\n').filter(Boolean)], { encoding: 'utf8' });
    for (const line of (r.stdout ?? '').trim().split('\n').filter((l) => l.includes('|'))) {
      const [name, mem, cpu] = line.split('|');
      const m = /([\d.]+)\s*([KMG]i?B)/.exec(mem ?? ''); const mib = m ? Number(m[1]) * ({ KiB: 1 / 1024, KB: 1 / 1024, MiB: 1, MB: 1, GiB: 1024, GB: 1024 } as Record<string, number>)[m[2]!]! : 0;
      const p = peaks.get(name!) ?? { memMiB: 0, cpuPct: 0 };
      peaks.set(name!, { memMiB: Math.max(p.memMiB, mib), cpuPct: Math.max(p.cpuPct, Number.parseFloat(cpu ?? '0') || 0) });
    }
    setTimeout(tick, 400);
  };
  tick();
  return () => { on = false; return [...peaks.entries()].map(([name, v]) => ({ name, ...v })); };
}
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]! : null; };
const W15_PLAN = { steps: [{ op: 'click', selector: 'li.next > a' }, { op: 'waitFor', urlPrefix: `${Q}/page/2`, timeoutMs: 15_000 }, { op: 'extractText', selector: '.quote .text', name: 'q', all: true }, { op: 'screenshot', name: 'w15.png' }],
  expect: [{ kind: 'extracted', name: 'q', minItems: 10 }, { kind: 'artifact', name: 'w15.png' }, { kind: 'finalUrlPrefix', prefix: `${Q}/page/2` }] };
workflows.W15 = async () => {
  const sequential = Number(arg('--w15-runs', '8')); const concurrent = Number(arg('--w15-concurrent', '3'));
  const stop = sampler();
  const runs: any[] = [];
  for (let i = 0; i < sequential; i++) runs.push(await run(i % 2 ? bob : alice, { goal: `load run ${i}`, startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits(), plan: W15_PLAN }));
  const wave = await Promise.all(Array.from({ length: concurrent }, (_, i) => run(i % 2 ? bob : alice, { goal: `concurrent run ${i}`, startUrl: `${Q}/`, allowedOrigins: [Q], limits: limits(), plan: W15_PLAN })));
  const peaks = stop();
  const all = [...runs, ...wave];
  const verified = all.filter((r) => r.status === 'completed' && r.outcomeVerified === true);
  const lat = verified.map((r) => r.elapsedMs as number);
  const inner = verified.map((r) => Number(r.metrics?.elapsedMs ?? 0)).filter(Boolean);
  const metrics = {
    runs: all.length, sequential, concurrent, verifiedOutcomes: verified.length, completionRate: all.length ? verified.length / all.length : 0,
    endToEndMs: { first: runs[0]?.elapsedMs ?? null, p50: pct(lat, 50), p95: lat.length >= 10 ? pct(lat, 95) : `not computed (${lat.length} samples < 10)`, max: Math.max(...lat) },
    inContainerBrowserMs: { p50: pct(inner, 50), max: inner.length ? Math.max(...inner) : null },
    startupFailures: all.filter((r) => r.status !== 'completed' && /could not start|did not start|exited without/.test(String(r.error ?? ''))).length,
    retriedAttempts: all.reduce((n, r) => n + Math.max(0, (r.attempts ?? 1) - 1), 0),
    peakContainerMemMiB: peaks.length ? Math.max(...peaks.map((p) => p.memMiB)) : null, peakContainerCpuPct: peaks.length ? Math.max(...peaks.map((p) => p.cpuPct)) : null, sampledContainers: peaks.length,
    modelCostMicrosPerVerifiedOutcome: 0,
    note: 'Infrastructure cost per verified outcome is computed in the cost report from the host price and these measured durations; model cost is 0 because these runs use no AI steps.',
  };
  record('W15', 'load and reliability measurements (sequential and concurrent)', 'every run verified, nothing left behind', verified.length === all.length, { status: `${verified.length}/${all.length} verified`, metrics });
};

const ids = Object.keys(workflows).filter((k) => !only || only.includes(k));
for (const id of ids) {
  try { await workflows[id]!(); } catch (e) { record(id, 'runner error', 'no runner error', false, { status: 'runner-error', error: (e as Error).message.slice(0, 300) }); }
}
const summary = { evidenceClass: label, reapedAtStart: reaped, sourceSha, browserImage, imageId, at: new Date().toISOString(), passed: receipts.filter((r) => r.pass).length, total: receipts.length, receipts };
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.total} receipts PASS; written to ${outFile}; sha256 ${createHash('sha256').update(JSON.stringify(summary)).digest('hex').slice(0, 16)}`);
process.exitCode = summary.passed === summary.total ? 0 : 1;
void randomUUID;
