/** Dedicated trusted host entrypoint. Never mount this in the API or supply it
 * with database, customer or model credentials. The host runs the existing
 * hardened per-job worker and egress proxy, not another task scheduler. */
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCoordinatorServer } from './browserCoordinator.js';
import { ContainerBrowserWorker, type ContainerWorkerOptions } from './containerBrowserWorker.js';
import type { BrowserWorkerPort } from './browserTaskHandler.js';

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  const text = value ?? String(fallback);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > maximum) {
    throw new Error('BROWSER_HOST_INVALID_LIMIT');
  }
  return Number(text);
}

export function browserHostConfiguration(env: NodeJS.ProcessEnv) {
  if (env.XROGA_RUNTIME_ROLE !== 'browser-coordinator') throw new Error('DEDICATED_BROWSER_HOST_REQUIRED');
  // The shared signing secret is the sole credential this host needs. Reject
  // accidental reuse of a privileged API or canonical Job environment.
  for (const [name, value] of Object.entries(env)) {
    if (value && name !== 'XROGA_BROWSER_COORDINATOR_SECRET' &&
        /(?:API_KEY|ACCESS_TOKEN|SERVICE_ROLE_KEY|DATABASE_URL|DB_PASSWORD|SECRET_ACCESS_KEY|CLIENT_SECRET)$/.test(name)) {
      throw new Error('BROWSER_HOST_PRIVILEGED_CREDENTIAL_REFUSED');
    }
  }
  const secret = env.XROGA_BROWSER_COORDINATOR_SECRET ?? '';
  if (Buffer.byteLength(secret) < 32) throw new Error('BROWSER_HOST_SIGNING_SECRET_REQUIRED');
  const browserImage = env.XROGA_BROWSER_IMAGE ?? '';
  const proxyImage = env.XROGA_BROWSER_PROXY_IMAGE ?? '';
  for (const image of [browserImage, proxyImage]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9./:_-]*@sha256:[a-f0-9]{64}$/.test(image)) {
      throw new Error('BROWSER_HOST_IMMUTABLE_IMAGE_REQUIRED');
    }
  }
  const bind = env.XROGA_BROWSER_HOST_BIND ?? '127.0.0.1';
  const privateV4 = /^10\./.test(bind) || /^192\.168\./.test(bind) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(bind);
  if (!(bind === '127.0.0.1' || bind === '::1' || (isIP(bind) === 4 && privateV4))) {
    throw new Error('BROWSER_HOST_PRIVATE_BIND_REQUIRED');
  }
  return {
    secret, browserImage, proxyImage, bind,
    repoRoot: resolve(env.XROGA_BROWSER_REPO_ROOT ?? process.cwd()),
    port: boundedInteger(env.PORT, 8080, 65535),
    maxConcurrent: boundedInteger(env.XROGA_BROWSER_HOST_MAX_CONCURRENT, 1, 2),
  };
}

export function createBrowserCoordinatorHost(
  env: NodeJS.ProcessEnv = process.env,
  createWorker: (options: ContainerWorkerOptions) => BrowserWorkerPort = options => new ContainerBrowserWorker(options),
) {
  const config = browserHostConfiguration(env);
  const worker = createWorker({ repoRoot: config.repoRoot, browserImage: config.browserImage, proxyImage: config.proxyImage, aiChannel: 'chromium' });
  const server = createCoordinatorServer({ secret: config.secret, worker, maxConcurrent: config.maxConcurrent });
  return { server, config, worker };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { server, config, worker } = createBrowserCoordinatorHost();
    // Existing bounded, label/identity-aware reaper leaves running resources
    // untouched. Preserve the historical host's stopped-job recovery behavior.
    if (worker instanceof ContainerBrowserWorker) worker.reapOrphans();
    // Closing connections aborts the existing coordinator jobs. Their worker's
    // finally blocks remove only that job's containers and network. Never exit
    // immediately or globally prune Docker while cleanup is running.
    const stop = () => { server.close(); server.closeAllConnections(); };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
    server.once('error', () => { console.error('BROWSER_COORDINATOR_LISTEN_FAILED'); process.exitCode = 1; });
    server.listen(config.port, config.bind, () => console.log('BROWSER_COORDINATOR_LISTENING'));
  } catch {
    console.error('BROWSER_COORDINATOR_STARTUP_REFUSED');
    process.exitCode = 1;
  }
}
