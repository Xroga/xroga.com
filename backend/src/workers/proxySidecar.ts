/**
 * The egress proxy as a separate process, for the container network model in `deploy/browser-worker/container-spec.json`.
 *
 * The browser container sits on an `--internal` network with no route out. This process is its one peer and the only thing on that network that
 * can reach the internet, so it is the production `startEgressProxy` (job scope, canonical egress policy, pinned DNS, budgets) and nothing else:
 * no second policy implementation. The trusted worker starts it per job and gives it the same `BrowserJob` it gave the browser, plus the proxy
 * credentials that go into the browser's launch options.
 *
 *   XROGA_PROXY_JOB       the BrowserJob as JSON (validated by the same strict parser the worker uses)
 *   XROGA_PROXY_USERNAME  proxy credentials (the password must be at least 24 characters)
 *   XROGA_PROXY_PASSWORD
 *   XROGA_PROXY_PORT      optional, default 3128
 *
 * It listens on every interface of ITS container, which is correct only because that container is attached to the internal network and to
 * the outside, never published to the host. Each decision is written to stdout as a JSON line (host and verdict only).
 */
import dns from 'node:dns/promises';
import { pathToFileURL } from 'node:url';
import type { PublicResolver } from '../security/boundedPublicGet.js';
import { parseBrowserJob, type BrowserJob } from './browserJob.js';
import { startEgressProxy } from './egressProxy.js';

export interface SidecarConfig {
  job: BrowserJob;
  credentials: { username: string; password: string };
  port: number;
}

export class SidecarConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'SidecarConfigError'; }
}

/** Throws SidecarConfigError with a fixed message. Never echoes a value: the job or the credentials could be in it. */
export function loadSidecarConfig(env: NodeJS.ProcessEnv): SidecarConfig {
  let job: BrowserJob;
  try { job = parseBrowserJob(JSON.parse(env.XROGA_PROXY_JOB ?? '')); } catch { throw new SidecarConfigError('XROGA_PROXY_JOB is missing or is not a valid browser job'); }
  const username = env.XROGA_PROXY_USERNAME ?? '';
  const password = env.XROGA_PROXY_PASSWORD ?? '';
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username) || password.length < 24) throw new SidecarConfigError('proxy credentials are missing or too weak');
  const raw = env.XROGA_PROXY_PORT ?? '3128';
  const port = Number(raw);
  if (!/^\d{1,5}$/.test(raw) || port < 1 || port > 65535) throw new SidecarConfigError('XROGA_PROXY_PORT is not a valid port');
  return { job, credentials: { username, password }, port };
}

const systemResolver: PublicResolver = async (host) => dns.lookup(host, { all: true, verbatim: true });

export async function runSidecar(env: NodeJS.ProcessEnv = process.env, out: (line: string) => void = (l) => process.stdout.write(`${l}\n`)): Promise<{ close(): Promise<void> }> {
  const config = loadSidecarConfig(env);
  const proxy = await startEgressProxy({
    job: config.job, resolve: systemResolver, credentials: config.credentials, bindHost: '0.0.0.0', port: config.port,
    onDecision: (decision) => out(JSON.stringify({ decision })),
  });
  out(JSON.stringify({ listening: proxy.port }));
  return proxy;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSidecar().then((proxy) => {
    const stop = () => { void proxy.close().then(() => process.exit(0)); setTimeout(() => process.exit(0), 3_000).unref(); };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  }, (error: unknown) => {
    process.stderr.write(`${error instanceof SidecarConfigError ? error.message : 'egress proxy failed to start'}\n`);
    process.exit(2);
  });
}
