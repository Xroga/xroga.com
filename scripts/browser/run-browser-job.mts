/**
 * Runs ONE real browser job through the production worker (`ContainerBrowserWorker`): fresh hardened container, per-job internal
 * network, production egress proxy. For operators and for Phase 3 evidence; it never touches production data.
 *
 *   tsx scripts/browser/run-browser-job.mts --scenario <file.json> [--out dir] [--build]
 *
 * The scenario file holds { "job": {...limits, origins, startUrl...}, "plan": {...} }; ids are filled in. The job and plan go through the same
 * strict parsers the scheduler uses. Prints one JSON summary (no artifact bytes); artifacts are written to --out with their SHA-256.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseBrowserJob } from '../../backend/src/workers/browserJob.js';
import { evaluatePostconditions, parseBrowserPlan } from '../../backend/src/workers/browserPlan.js';
import { ContainerBrowserWorker, type BrowserModelGateway } from '../../backend/src/workers/containerBrowserWorker.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const scenarioFile = arg('--scenario');
if (!scenarioFile) { console.error('usage: run-browser-job.mts --scenario file.json [--out dir] [--build]'); process.exit(2); }
const outDir = resolve(arg('--out', join(repoRoot, 'out', 'browser-jobs'))!);
const browserImage = arg('--browser-image', 'xroga-browser-worker:phase3')!;
const proxyImage = arg('--proxy-image', 'xroga-egress-proxy:phase2-test')!;

if (process.argv.includes('--build')) {
  const b = spawnSync('docker', ['build', '-q', '-t', browserImage, join(repoRoot, 'deploy/browser-worker')], { encoding: 'utf8', timeout: 900_000 });
  if (b.status !== 0) { console.error(b.stderr.slice(-1500)); process.exit(5); }
}

const scenario = JSON.parse(readFileSync(scenarioFile, 'utf8'));
const runId = `run-${randomUUID().slice(0, 8)}`;
const job = parseBrowserJob({ version: 1, tenantId: scenario.tenantId ?? 'tenant-a', userId: scenario.userId ?? 'user-a', projectId: 'project-a', runId, taskId: 'task-1', attempt: 1, ...scenario.job });
const plan = parseBrowserPlan(scenario.plan, job);

// A model gateway is only attached when an operator explicitly provides one (see browserModelGateway.ts); none here means AI steps fail closed.
// --stub-model proves the Stagehand plumbing without spend: it records each request and answers with an empty result at zero cost.
const stubCalls: Array<{ format: string; messages: number }> = [];
const gateway: BrowserModelGateway | undefined = process.argv.includes('--stub-model') ? {
  async generate(params) {
    const p = params as { responseFormat?: { type: string; schema?: unknown }; messages?: unknown[] };
    stubCalls.push({ format: p.responseFormat?.type ?? 'text', messages: Array.isArray(p.messages) ? p.messages.length : 0 });
    const minimal = (schema: any): unknown => {
      const t = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
      if (schema?.anyOf?.length) return minimal(schema.anyOf[0]);
      if (t === 'array') return []; if (t === 'string') return ''; if (t === 'number' || t === 'integer') return 0; if (t === 'boolean') return false;
      if (t === 'object' || schema?.properties) return Object.fromEntries((schema.required ?? []).map((k: string) => [k, minimal(schema.properties?.[k])]));
      return null;
    };
    const structured = p.responseFormat?.type === 'json_schema' ? minimal((p.responseFormat as { schema?: unknown }).schema) : undefined;
    const result = p.responseFormat?.type === 'json_schema'
      ? { role: 'assistant', content: { type: 'text', text: JSON.stringify(structured) }, outputFormat: 'json_schema', structuredContent: structured, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }
      : { role: 'assistant', content: { type: 'text', text: '' }, outputFormat: 'text', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
    return { result, inputTokens: 0, outputTokens: 0, costMicros: 0 };
  },
} : undefined;
const worker = new ContainerBrowserWorker({ repoRoot, browserImage, proxyImage, gateway, aiChannel: 'chromium', ...(process.argv.includes('--debug') ? { onDiagnostic: (l: string) => console.error(`[diag] ${l}`) } : {}) });
const controller = new AbortController();
const t0 = Date.now();
let summary: Record<string, unknown>;
try {
  const r = await worker.run(job, { signal: controller.signal, lease: { tenantId: job.tenantId, runId: job.runId, taskId: job.taskId, workerId: 'operator', token: 1, expiresAt: Date.now() + 600_000 }, plan });
  mkdirSync(join(outDir, runId), { recursive: true });
  const artifacts = r.artifacts.map((a) => { writeFileSync(join(outDir, runId, a.name), a.bytes); return { name: a.name, mediaType: a.mediaType, bytes: a.bytes.length, sha256: createHash('sha256').update(a.bytes).digest('hex') }; });
  const post = evaluatePostconditions(plan, { finalUrl: r.finalUrl, extracted: r.extracted ?? {}, artifacts: artifacts.map((a) => ({ name: a.name, mediaType: a.mediaType, size: a.bytes })), consequentialActions: Number(r.metrics?.consequentialActions ?? 0) });
  summary = { ok: true, runId, elapsedMs: Date.now() - t0, finalUrl: r.finalUrl, navigations: r.navigations, responseBytes: r.responseBytes, visited: r.visitedUrls.length, extracted: r.extracted, artifacts, postconditions: post, outcomeVerified: post.every((p) => p.passed), metrics: r.metrics, steps: r.steps };
} catch (e) {
  summary = { ok: false, runId, elapsedMs: Date.now() - t0, code: (e as { code?: string }).code ?? 'ERROR', reason: (e as Error).message };
}
const leftovers = spawnSync('docker', ['ps', '-aq', '--filter', 'label=xroga.browser-job=1'], { encoding: 'utf8' }).stdout.trim();
const nets = spawnSync('docker', ['network', 'ls', '-q', '--filter', 'label=xroga.browser-job=1'], { encoding: 'utf8' }).stdout.trim();
if (process.argv.includes('--stub-model')) summary.stubModelCalls = stubCalls;
summary.cleanup = { leftoverContainers: leftovers ? leftovers.split('\n').length : 0, leftoverNetworks: nets ? nets.split('\n').length : 0 };
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.ok ? 0 : 1;
