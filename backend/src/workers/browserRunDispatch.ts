/**
 * How a stored browser run reaches a worker.
 *
 * A browser run used to start as a detached promise inside the request that created it. On Cloud Run with request-based CPU the
 * instance is throttled once the 202 is sent, and a scale-in kills the run. The run is now a durable record (`browserRunStore.ts`) and
 * "start it" is a port, so the platform decides what executes it:
 *
 *   - `InProcessDispatcher`  runs it in the accepting process (local development, tests, and a single always-allocated instance).
 *   - `CloudTasksDispatcher` enqueues an authenticated HTTP task that calls `POST /internal/browser/execute` on the service, so the
 *     execution is a request of its own that Cloud Run keeps CPU allocated for, with retries and a deadline owned by the queue.
 *
 * Both are safe to call twice for one run: the worker's lease admits one executor and a finished run is reported, not rerun.
 * The scheduled recovery (`POST /internal/browser/recover`) re-dispatches runs nobody is executing, so a lost task or a stopped
 * instance never strands a run.
 */

export interface BrowserRunDispatcher {
  /** Hands the run to a worker. Resolves when the hand-off is accepted, not when the run finishes. */
  dispatch(runId: string): Promise<void>;
}

export class InProcessDispatcher implements BrowserRunDispatcher {
  constructor(private readonly execute: (runId: string) => Promise<unknown>, private readonly onError: (runId: string, error: unknown) => void = () => undefined) {}
  async dispatch(runId: string): Promise<void> {
    void this.execute(runId).catch((e) => this.onError(runId, e));
  }
}

export interface CloudTasksConfig {
  project: string;
  location: string;
  queue: string;
  /** the service's `POST /internal/browser/execute` URL */
  targetUrl: string;
  /** the service account Cloud Tasks signs the OIDC token as; the execute endpoint accepts only this one */
  serviceAccountEmail: string;
  /** the OIDC audience; the execute endpoint verifies it */
  audience: string;
  /** seconds the queue waits for the execute request (Cloud Tasks allows up to 1800 for HTTP targets) */
  dispatchDeadlineSeconds?: number;
}

export interface CloudTasksDeps {
  fetch: typeof fetch;
  /** an OAuth access token for the API process's own service account (the metadata server on Cloud Run) */
  accessToken: () => Promise<string>;
  now?: () => number;
}

/** The access token of the service the code runs as, from the Cloud Run / Compute Engine metadata server. */
export async function metadataAccessToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  const r = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
  if (r.redirected || r.status >= 300 && r.status < 400) { await r.body?.cancel().catch(() => undefined); throw new Error('Runtime metadata redirect denied.'); }
  if (!r.ok) throw new Error(`metadata token request failed (${r.status})`);
  const body = await r.json() as { access_token?: string };
  if (!body.access_token) throw new Error('metadata token response had no access token');
  return body.access_token;
}

const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Re-dispatches of one run inside this window share a task name, so the queue deduplicates them. */
const DEDUPE_WINDOW_MS = 10 * 60_000;

export class CloudTasksDispatcher implements BrowserRunDispatcher {
  constructor(private readonly config: CloudTasksConfig, private readonly deps: CloudTasksDeps) {
    for (const [k, v] of Object.entries({ project: config.project, location: config.location, queue: config.queue })) {
      if (!SEGMENT.test(v)) throw new Error(`Cloud Tasks ${k} is not a valid resource id`);
    }
    if (!/^https:\/\//.test(config.targetUrl)) throw new Error('the Cloud Tasks target must be an https URL');
    if (!config.serviceAccountEmail || !config.audience) throw new Error('the Cloud Tasks target needs a service account and an audience');
  }

  async dispatch(runId: string): Promise<void> {
    if (!RUN_ID.test(runId)) throw new Error('invalid run id');
    const c = this.config;
    const bucket = Math.floor((this.deps.now?.() ?? Date.now()) / DEDUPE_WINDOW_MS);
    const parent = `projects/${c.project}/locations/${c.location}/queues/${c.queue}`;
    const token = await this.deps.accessToken();
    const response = await this.deps.fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        task: {
          name: `${parent}/tasks/${runId}-${bucket}`,
          dispatchDeadline: `${c.dispatchDeadlineSeconds ?? 1_800}s`,
          httpRequest: {
            url: c.targetUrl, httpMethod: 'POST', headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({ runId })).toString('base64'),
            oidcToken: { serviceAccountEmail: c.serviceAccountEmail, audience: c.audience },
          },
        },
      }),
    });
    // ALREADY_EXISTS means this run was enqueued moments ago: the hand-off already happened.
    await response.body?.cancel().catch(() => undefined);
    if (response.redirected || response.status >= 300 && response.status < 400) throw new Error('Cloud Tasks redirect denied.');
    if (response.ok || response.status === 409) return;
    throw new Error(`Cloud Tasks refused the dispatch (${response.status})`);
  }
}

/** Reads the dispatcher choice from the environment. Cloud Tasks only when every setting is present; otherwise in-process. */
export function dispatcherFromEnv(env: NodeJS.ProcessEnv, execute: (runId: string) => Promise<unknown>, onError: (runId: string, e: unknown) => void, fetchImpl: typeof fetch = fetch): { dispatcher: BrowserRunDispatcher; mode: 'cloud-tasks' | 'in-process' } {
  if (env.XROGA_BROWSER_DISPATCH === 'cloud-tasks') {
    const { XROGA_BROWSER_TASKS_PROJECT: project, XROGA_BROWSER_TASKS_LOCATION: location, XROGA_BROWSER_TASKS_QUEUE: queue, XROGA_BROWSER_EXECUTE_URL: targetUrl, XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT: serviceAccountEmail, XROGA_BROWSER_EXECUTE_AUDIENCE: audience } = env;
    if (project && location && queue && targetUrl && serviceAccountEmail && audience) {
      return { mode: 'cloud-tasks', dispatcher: new CloudTasksDispatcher({ project, location, queue, targetUrl, serviceAccountEmail, audience }, { fetch: fetchImpl, accessToken: () => metadataAccessToken(fetchImpl) }) };
    }
    // Misconfigured cloud dispatch must be loud, not a silent fall back to the mode that stalls on Cloud Run.
    throw new Error('XROGA_BROWSER_DISPATCH=cloud-tasks needs XROGA_BROWSER_TASKS_PROJECT, _LOCATION, _QUEUE, XROGA_BROWSER_EXECUTE_URL, _SERVICE_ACCOUNT and _AUDIENCE');
  }
  return { mode: 'in-process', dispatcher: new InProcessDispatcher(execute, onError) };
}
