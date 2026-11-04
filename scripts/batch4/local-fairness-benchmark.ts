/**
 * Local fairness and latency benchmark for Golden J. LOCAL ONLY.
 *
 * Part 1 runs the real `GoogleDeliveryStore.pendingDeliveryIds` selection code over an in-memory table and models the dispatcher's launch gate (a
 * fixed number of concurrent launches per tick). It compares oldest-first selection (the previous behaviour) with the tenant-interleaved selection.
 * It is a model of dispatch ticks, not a deployed queue, and the tick is not wall-clock time.
 *
 * Part 2 measures the response time of a local HTTP endpoint (the stand-in for an interactive chat request) while 0, then N, real CPU-bound worker
 * processes run on the same machine. The numbers describe this machine only. They are not a production SLO and not a Cloud Run measurement.
 *
 * Usage: node node_modules/tsx/dist/cli.mjs scripts/batch4/local-fairness-benchmark.ts [outputPath]
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleDeliveryStore } from '../../backend/src/workers/googleDeliveryStore.js';
import { selectFairly } from '../../backend/src/workers/fairSelection.js';
import { fakeTable, type Row } from '../../backend/src/workers/__tests__/postgrestFilter.js';
import type { GoogleDispatchConfiguration } from '../../backend/src/workers/googleDispatch.js';

const sourceSha = 'a'.repeat(40);
const project = 'project-c40d4821-e647-4fa2-92d';
const config: GoogleDispatchConfiguration = { project, region: 'us-east4', queue: 'xroga-canonical-queue', job: 'xroga-canonical-worker',
  dispatcherUrl: 'https://xroga-dispatcher-fixture.us-east4.run.app/internal/canonical-dispatch', dispatchAccount: `xroga-dispatcher@${project}.iam.gserviceaccount.com`,
  runtimeAccount: `xroga-api-runtime@${project}.iam.gserviceaccount.com`, image: `us-east4-docker.pkg.dev/${project}/cloud-run-source-deploy/xroga-api-migration@sha256:${'a'.repeat(64)}`,
  sourceSha, kmsKeyName: `projects/${project}/locations/us-central1/keyRings/synthetic/cryptoKeys/custody` };
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const LAUNCH_CAPACITY_PER_TICK = 2; // mirrors the database launch gate (two active runs)

/** Ticks until each tenant's first delivery launches, given a policy that decides which rows are offered. */
async function simulate(policy: 'oldest-first' | 'tenant-interleaved', heavyCount: number, lightTenants: number) {
  const base = Date.parse('2026-10-29T00:00:00.000Z');
  const rows: Row[] = [];
  let n = 1;
  for (let i = 0; i < heavyCount; i++) rows.push({ id: uid(n++), user_id: uid(9001), state: 'pending', source_sha: sourceSha, launch_attempts: 0, launch_lease_until: null, created_at: new Date(base + i * 1000).toISOString() });
  // light tenants submit one request each, AFTER the heavy backlog was queued
  for (let t = 0; t < lightTenants; t++) rows.push({ id: uid(n++), user_id: uid(9100 + t), state: 'pending', source_sha: sourceSha, launch_attempts: 0, launch_lease_until: null, created_at: new Date(base + (heavyCount + t) * 1000).toISOString() });
  const owner = new Map(rows.map((r) => [String(r.id), String(r.user_id)]));
  const launchedAt = new Map<string, number>();
  const service = () => ({ from: () => fakeTable(rows) }) as unknown as SupabaseClient;
  const store = new GoogleDeliveryStore(config, {} as never, async () => {}, service);
  const realNow = Date.now; Date.now = () => base + 60_000;
  try {
    for (let tick = 1; tick <= 200 && rows.some((r) => r.state === 'pending'); tick++) {
      let offered = await store.pendingDeliveryIds();
      if (policy === 'oldest-first') {
        // the previous behaviour: the oldest ten eligible rows, whoever owns them
        const eligible = rows.filter((r) => r.state === 'pending').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        offered = eligible.slice(0, 10).map((r) => String(r.id));
      }
      for (const id of offered.slice(0, LAUNCH_CAPACITY_PER_TICK)) {
        const row = rows.find((r) => r.id === id)!; row.state = 'running';
        const tenant = owner.get(id)!; if (!launchedAt.has(tenant)) launchedAt.set(tenant, tick);
      }
    }
  } finally { Date.now = realNow; }
  const lightTicks = [...launchedAt.entries()].filter(([t]) => t !== uid(9001)).map(([, tick]) => tick).sort((a, b) => a - b);
  return { policy, heavyBacklog: heavyCount, lightTenants, lightFirstLaunchTicks: lightTicks, lightWorstTick: lightTicks.at(-1) ?? null, heavyFirstLaunchTick: launchedAt.get(uid(9001)) ?? null };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]! : NaN;
}

async function measureLatency(workers: number, requests = 150) {
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const burn = 'const end=Date.now()+25000;let x=0;while(Date.now()<end){x+=Math.sqrt(x+1)}';
  const children = Array.from({ length: workers }, () => spawn(process.execPath, ['-e', burn], { stdio: 'ignore' }));
  await new Promise((resolve) => setTimeout(resolve, 600)); // let the workers saturate their cores
  const samples: number[] = [];
  for (let i = 0; i < requests; i++) {
    const start = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}/chat-stand-in`); await response.text();
    samples.push(performance.now() - start);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  children.forEach((c) => c.kill('SIGKILL'));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return { busyWorkerProcesses: workers, requests, p50Ms: +percentile(samples, 50).toFixed(2), p95Ms: +percentile(samples, 95).toFixed(2), maxMs: +Math.max(...samples).toFixed(2) };
}

async function main() {
  const out = process.argv[2];
  const fairness = [];
  for (const [heavy, light] of [[20, 1], [20, 5], [60, 5]] as const) {
    fairness.push(await simulate('oldest-first', heavy, light), await simulate('tenant-interleaved', heavy, light));
  }
  const cores = cpus().length;
  const latency = [await measureLatency(0), await measureLatency(Math.max(1, cores - 1)), await measureLatency(cores * 2)];
  const report = {
    kind: 'LOCAL_BENCHMARK_NOT_PRODUCTION_PERFORMANCE', generatedAt: new Date().toISOString(), machine: { logicalCores: cores, platform: process.platform, node: process.version },
    launchCapacityPerTick: LAUNCH_CAPACITY_PER_TICK, selectionHelper: typeof selectFairly,
    fairness, latency,
    limitations: ['Fairness is a model of dispatch ticks using the real selection code, not a deployed queue or wall-clock time.', 'Latency uses a local HTTP endpoint beside CPU-bound child processes on one machine; it does not measure Cloud Run, the API, the database or the network.', 'No SLO is derived from these numbers.'],
  };
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
}
void main();
