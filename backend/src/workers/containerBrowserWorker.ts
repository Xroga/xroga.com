/**
 * The real `BrowserWorkerPort` (INFRA-007): runs one job in a fresh hardened browser container on this Docker host.
 *
 * Per job, and torn down on every exit path:
 *   1. an `--internal` Docker network that only this job uses (no route to the internet, the host, metadata or another job);
 *   2. the production egress proxy sidecar (`proxySidecar.ts` in `Dockerfile.proxy`), scoped to THIS job's origins, the only peer on it;
 *   3. the browser container, run with the reviewed spec (`containerSpec.ts`: non-root, read-only root, seccomp, no capabilities,
 *      CPU/memory/PID limits) and `runJob.mjs` as its program. The job, plan and host-validated launch options go in on stdin.
 *
 * Model use: the container holds no model key and cannot reach a model provider (its proxy only admits the job's origins). Each
 * Stagehand model request comes out on stdout; this class reserves it against the job's budget, asks the injected gateway (Xroga's
 * own model route), and answers. When the budget is spent, the cost cannot be measured, or no gateway is configured, the request is
 * refused and the AI step fails closed. Nothing here falls back to a hosted browser or another paid path.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrowserJob } from './browserJob.js';
import type { BrowserPlan, ExtractedValue } from './browserPlan.js';
import { buildChromiumLaunch } from './chromiumLaunch.js';
import { assertContainerSpecSafe, dockerRunArgs, type ContainerSpec } from './containerSpec.js';
import type { Lease } from './leaseStore.js';
import { BrowserTaskError, type BrowserTaskFailureCode, type BrowserWorkerPort, type BrowserWorkerResult } from './browserTaskHandler.js';
import { BrowserModelLifetime } from './browserModelLifetime.js';
import type { BrowserModelAuthority } from './browserModelDispatch.js';

export interface ModelUsage { calls: number; inputTokens: number; outputTokens: number; costMicros: number; refused: number }

/** Xroga's own model route for Stagehand. Must report the measured cost of every call; an unmeasured call is treated as a failure. */
export interface BrowserModelGateway {
  generate(params: unknown, ctx: { job: BrowserJob; remainingMicros: number; signal: AbortSignal; authority?: BrowserModelAuthority }): Promise<{ result: unknown; inputTokens: number; outputTokens: number; costMicros: number }>;
}

export interface ContainerWorkerOptions {
  repoRoot: string;
  /** browser image (built from deploy/browser-worker/Dockerfile) and proxy image (Dockerfile.proxy) */
  browserImage: string;
  proxyImage: string;
  gateway?: BrowserModelGateway;
  /** runs docker asynchronously (never blocks the event loop of the host serving other jobs); injectable for tests */
  docker?: (args: string[]) => Promise<DockerResult>;
  spawnDocker?: (args: string[]) => ChildProcess;
  /** for AI jobs only: the full Chromium channel (extensions need it); deterministic jobs keep the default headless shell */
  aiChannel?: string;
  /** operator diagnostics (worker error reasons, container stderr). Never attached in production: it can carry page-derived text. */
  onDiagnostic?: (line: string) => void;
}

const PROXY_PORT = 3128;
const PROXY_HOST = 'egress-proxy';
export const WORKER_ERRORS: ReadonlySet<BrowserTaskFailureCode> = new Set<BrowserTaskFailureCode>(['RESULT_OUT_OF_SCOPE', 'RESULT_OVER_LIMIT', 'ARTIFACT_REJECTED', 'JOB_TIMEOUT', 'CANCELLED']);

export interface DockerResult { status: number | null; stdout: string; stderr: string }
const defaultDocker = (args: string[]): Promise<DockerResult> => new Promise((resolveRun) => {
  const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  const timer = setTimeout(() => child.kill('SIGKILL'), 120_000); timer.unref();
  child.stdout.on('data', (d) => { if (stdout.length < 8 * 1024 * 1024) stdout += d; });
  child.stderr.on('data', (d) => { if (stderr.length < 1024 * 1024) stderr += d; });
  child.on('error', () => { clearTimeout(timer); resolveRun({ status: null, stdout, stderr }); });
  child.on('close', (status) => { clearTimeout(timer); resolveRun({ status, stdout, stderr }); });
});
/** Synchronous docker, for host start only (orphan reaping before anything is served). */
const dockerSync = (args: string[]): DockerResult => { const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 }); return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }; };

export class ContainerBrowserWorker implements BrowserWorkerPort {
  private readonly spec: ContainerSpec;
  private readonly docker: NonNullable<ContainerWorkerOptions['docker']>;
  private readonly spawnDocker: NonNullable<ContainerWorkerOptions['spawnDocker']>;
  /** usage of the last run, for the handler's accounting (also returned inside the result) */
  lastUsage: ModelUsage = { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, refused: 0 };

  constructor(private readonly opts: ContainerWorkerOptions) {
    this.spec = { ...JSON.parse(readFileSync(resolve(opts.repoRoot, 'deploy/browser-worker/container-spec.json'), 'utf8')), image: opts.browserImage };
    assertContainerSpecSafe(this.spec, { repoRoot: opts.repoRoot });
    this.docker = opts.docker ?? defaultDocker;
    this.spawnDocker = opts.spawnDocker ?? ((args) => spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] }));
  }

  async run(job: BrowserJob, ctx: { signal: AbortSignal; lease: Lease; plan?: BrowserPlan }): Promise<BrowserWorkerResult> {
    return this.runWithGateway(job, ctx, this.opts.gateway);
  }

  /** As `run`, with the model route given per job (the coordinator relays model requests back to the API's own gateway). */
  async runWithGateway(job: BrowserJob, ctx: { signal: AbortSignal; lease: Lease; plan?: BrowserPlan }, gateway: BrowserModelGateway | undefined): Promise<BrowserWorkerResult> {
    const assertActive=()=>{if(ctx.signal.aborted)throw new BrowserTaskError('CANCELLED','the job was stopped');};
    assertActive();
    const runDocker=(args:string[])=>{assertActive();return this.docker(args);};
    const plan: BrowserPlan = ctx.plan ?? { steps: [{ op: 'screenshot', name: 'page.png' }], expect: [] };
    const ai = plan.steps.some((s) => s.op.startsWith('ai'));
    if (ai && job.limits.maxModelCostMicros <= 0) throw new BrowserTaskError('WORKER_FAILED', 'AI steps need a model budget');
    if (ai && !gateway) throw new BrowserTaskError('WORKER_FAILED', 'no model route is configured for AI steps');

    const tag = createHash('sha256').update(JSON.stringify([job.tenantId, job.runId, job.taskId, job.attempt, ctx.lease.token])).digest('hex').slice(0, 16);
    const net = `xroga-bj-${tag}`; const proxyName = `xroga-bj-proxy-${tag}`; const browserName = `xroga-bj-browser-${tag}`;
    const username = `job${tag.slice(0, 8)}`; const password = randomBytes(24).toString('base64url');
    const usage: ModelUsage = { calls: 0, inputTokens: 0, outputTokens: 0, costMicros: 0, refused: 0 };
    this.lastUsage = usage;
    const cleanup = async () => {
      if (this.opts.onDiagnostic) for (const l of (await this.docker(['logs', proxyName])).stdout.split('\n').filter((x) => x.includes('decision')).slice(-20)) this.opts.onDiagnostic(`proxy: ${l.slice(0, 300)}`);
      await Promise.all([this.docker(['rm', '-f', browserName]), this.docker(['rm', '-f', proxyName])]);
      await this.docker(['network', 'rm', net]);
    };

    try {
      if ((await runDocker(['network', 'create', '--internal', '--label', 'xroga.browser-job=1', net])).status !== 0) throw new BrowserTaskError('WORKER_FAILED', 'could not create the job network');
      const proxy = await runDocker(['run', '-d', '--name', proxyName, '--label', 'xroga.browser-job=1', '--network', 'bridge', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
        '--memory', '256m', '--pids-limit', '128',
        '-e', `XROGA_PROXY_JOB=${JSON.stringify(job)}`, '-e', `XROGA_PROXY_USERNAME=${username}`, '-e', `XROGA_PROXY_PASSWORD=${password}`, '-e', `XROGA_PROXY_PORT=${PROXY_PORT}`, this.opts.proxyImage]);
      if (proxy.status !== 0) throw new BrowserTaskError('WORKER_FAILED', 'could not start the egress proxy');
      if ((await runDocker(['network', 'connect', '--alias', PROXY_HOST, net, proxyName])).status !== 0) throw new BrowserTaskError('WORKER_FAILED', 'could not attach the egress proxy');
      if (!(await this.waitFor(async () => (await runDocker(['logs', proxyName])).stdout.includes('"listening"'), ctx.signal))) {assertActive();throw new BrowserTaskError('WORKER_FAILED', 'the egress proxy did not start');}
      // Joining the internal network switches the proxy to Docker's embedded resolver; the first lookups right after can fail transiently.
      // Wait until the proxy itself resolves the start host, instead of letting the job's first navigation race it.
      const host = new URL(job.startUrl).hostname;
      const probe = `require('dns').promises.lookup(${JSON.stringify(host)}).then(()=>process.exit(0),()=>process.exit(1))`;
      if (!(await this.waitFor(async () => (await runDocker(['exec', proxyName, 'node', '-e', probe])).status === 0, ctx.signal))) {assertActive();throw new BrowserTaskError('WORKER_FAILED', 'the egress proxy cannot resolve the start host');}

      const launch = buildChromiumLaunch(job, { profileRoot: '/run/xroga/profiles', proxy: { host: PROXY_HOST, port: PROXY_PORT, username, password }, baseEnv: { HOME: '/tmp', PATH: '/usr/local/bin:/usr/bin:/bin' } }, ai ? { aiDevtools: true } : undefined);
      const flags = dockerRunArgs(this.spec, { repoRoot: this.opts.repoRoot, name: browserName });
      flags[flags.indexOf('--network') + 1] = net;
      assertActive();
      const child = this.spawnDocker(['run', '-i', '--label', 'xroga.browser-job=1', ...flags, ...(this.opts.onDiagnostic ? ['--env', 'XROGA_WORKER_DEBUG=1'] : []), '--entrypoint', 'node', '--workdir', '/opt/xroga-browser-worker', this.spec.image, '/opt/xroga-browser-worker/runJob.mjs']);
      return await this.converse(child, job, plan, { ...launch, ...(ai && this.opts.aiChannel ? { channel: this.opts.aiChannel } : {}) }, usage, ctx.signal, gateway);
    } finally {
      await cleanup();
    }
  }

  /**
   * Removes every browser-job container and network on this host. Call ONLY at host start (coordinator boot): one host process owns all
   * jobs on its Docker host, so anything labelled then is an orphan of a process that died before its own cleanup ran.
   */
  reapOrphans(): { containers: number; networks: number } {
    const ids = (args: string[]) => dockerSync(args).stdout.trim().split('\n').filter(Boolean);
    const containers = ids(['ps', '-aq', '--filter', 'label=xroga.browser-job=1']);
    for (const id of containers) dockerSync(['rm', '-f', id]);
    const networks = ids(['network', 'ls', '-q', '--filter', 'label=xroga.browser-job=1']);
    for (const id of networks) dockerSync(['network', 'rm', id]);
    return { containers: containers.length, networks: networks.length };
  }

  private async waitFor(cond: () => Promise<boolean>, signal: AbortSignal): Promise<boolean> {
    for (let i = 0; i < 60 && !signal.aborted; i++) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 250)); }
    return false;
  }

  private converse(child: ChildProcess, job: BrowserJob, plan: BrowserPlan, launch: object, usage: ModelUsage, signal: AbortSignal, gateway: BrowserModelGateway | undefined): Promise<BrowserWorkerResult> {
    return new Promise((resolveRun, rejectRun) => {
      let settled = false;
      const models = new BrowserModelLifetime(job,gateway,signal,usage);
      const finish = (fn: () => void) => { if (!settled) { settled = true; models.close(); signal.removeEventListener('abort', onAbort); fn(); } };
      // a container that exits (crash, kill, timeout) closes its stdin; a late write must not become an unhandled stream error
      child.stdin?.on('error', () => undefined);
      const send = (m: object) => { if (child.stdin?.writable && !child.stdin.destroyed) child.stdin.write(`${JSON.stringify(m)}\n`, () => undefined); };
      const onAbort = () => { send({ type: 'cancel' }); setTimeout(() => child.kill('SIGKILL'), 3_000).unref(); finish(() => rejectRun(new BrowserTaskError('CANCELLED', 'the job was stopped'))); };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });

      if (this.opts.onDiagnostic) createInterface({ input: child.stderr! }).on('line', (l) => this.opts.onDiagnostic!(`stderr: ${l.slice(0, 500)}`));
      // Bound bytes before readline buffers or JSON parses untrusted worker
      // output. Artifact bytes retain the job's existing ceiling plus base64
      // expansion. Control records and total stream traffic are bounded too.
      const maxRecordBytes=Math.ceil(job.limits.maxArtifactBytes*4/3)+2*1024*1024;
      let wireBytes=0,recordBytes=0;
      child.stdout!.on('data',(chunk:Buffer)=>{
        if(settled)return;
        wireBytes+=chunk.byteLength;
        const deny=()=>{finish(()=>rejectRun(new BrowserTaskError('RESULT_OVER_LIMIT','the browser worker record or stream exceeded its limit')));child.stdout!.destroy();child.kill('SIGKILL');};
        if(wireBytes>maxRecordBytes+16*1024*1024){deny();return;}
        let start=0;
        for(;;){const end=chunk.indexOf(10,start);recordBytes+=(end<0?chunk.length:end)-start;
          if(recordBytes>maxRecordBytes){deny();return;}
          if(end<0)break;recordBytes=0;start=end+1;
        }
      });
      const rl = createInterface({ input: child.stdout! });
      rl.on('line', (raw) => {
        if(settled)return;
        let m: Record<string, any>;
        try { m = JSON.parse(raw);if(!m||typeof m!=='object'||Array.isArray(m))throw new Error(); }
        catch {finish(()=>rejectRun(new BrowserTaskError('WORKER_FAILED','the browser worker record was invalid',false)));return;}
        if (m.type === 'llm') {
          try{
            models.request(m.id,m.params).then(r=>{
              if(!settled)send({type:'llm-reply',id:m.id,ok:true,result:r.result});
            },()=>{if(!settled)send({type:'llm-reply',id:m.id,ok:false,code:'MODEL_FAILED',reason:'the model route refused the request'});});
          }catch(error){finish(()=>rejectRun(error));}
        } else if (m.type === 'result') {
          try{models.assertComplete();}catch(error){finish(()=>rejectRun(error));return;}
          const r = m.result;
          finish(() => resolveRun({
            finalUrl: String(r.finalUrl), visitedUrls: Array.isArray(r.visitedUrls) ? r.visitedUrls.map(String) : [], navigations: Number(r.navigations), responseBytes: Number(r.responseBytes),
            summary: String(r.summary ?? ''), artifacts: (Array.isArray(r.artifacts) ? r.artifacts : []).map((a: any) => ({ name: String(a.name), mediaType: String(a.mediaType), bytes: new Uint8Array(Buffer.from(String(a.bytes), 'base64')) })),
            extracted: (r.extracted && typeof r.extracted === 'object' ? r.extracted : {}) as Record<string, ExtractedValue>,
            metrics: { ...(r.metrics ?? {}), modelUsage: { ...usage } }, steps: Array.isArray(r.steps) ? r.steps : [],
          }));
          send({ type: 'done' });
        } else if (m.type === 'error') {
          this.opts.onDiagnostic?.(`worker error ${m.code}: ${m.reason}`);
          const code = WORKER_ERRORS.has(m.code) ? (m.code as BrowserTaskFailureCode) : 'WORKER_FAILED';
          finish(() => rejectRun(new BrowserTaskError(code, 'the isolated browser worker reported a bounded failure')));
        }
      });
      child.on('exit', () => finish(() => rejectRun(new BrowserTaskError('WORKER_FAILED', 'the browser container exited without a result'))));
      child.on('error', () => finish(() => rejectRun(new BrowserTaskError('WORKER_FAILED', 'the browser container could not start'))));
      send({ type: 'start', job, plan, launch });
    });
  }
}
