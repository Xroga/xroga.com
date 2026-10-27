/**
 * The browser host service (runs on the Compute Engine browser host, not in the API):
 *
 *   XROGA_BROWSER_COORDINATOR_SECRET=<>=32 bytes> tsx scripts/browser/browser-coordinator.mts [--port 8787] [--host 127.0.0.1] [--max 2]
 *
 * On boot it reaps orphaned job containers and networks (a previous process may have died mid-job), then serves signed jobs from the
 * API to ContainerBrowserWorker. It binds to loopback by default: put a TLS terminator in front, or reach it through a tunnel. It holds
 * no model key, database credential or user token; model requests go back to the API.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCoordinatorServer } from '../../backend/src/workers/browserCoordinator.js';
import { ContainerBrowserWorker } from '../../backend/src/workers/containerBrowserWorker.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1]! : d; };
const secret = process.env.XROGA_BROWSER_COORDINATOR_SECRET ?? '';
const worker = new ContainerBrowserWorker({ repoRoot, browserImage: arg('--browser-image', 'xroga-browser-worker:phase3'), proxyImage: arg('--proxy-image', 'xroga-egress-proxy:phase2-test'), aiChannel: 'chromium' });
const reaped = worker.reapOrphans();
const server = createCoordinatorServer({ secret, worker, maxConcurrent: Number(arg('--max', '2')) });
const host = arg('--host', '127.0.0.1'); const port = Number(arg('--port', '8787'));
server.listen(port, host, () => console.log(JSON.stringify({ coordinator: 'listening', host, port, reapedAtBoot: reaped })));
const stop = () => { server.close(); worker.reapOrphans(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
