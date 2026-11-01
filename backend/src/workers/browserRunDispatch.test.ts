import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CloudTasksDispatcher, InProcessDispatcher, dispatcherFromEnv } from './browserRunDispatch.js';

const RUN = '11111111-2222-4333-8444-555555555555';
const config = { project: 'xroga-prod', location: 'us-central1', queue: 'browser-runs', targetUrl: 'https://api.example/internal/browser/execute', serviceAccountEmail: 'tasks@xroga-prod.iam.gserviceaccount.com', audience: 'https://api.example/internal/browser/execute' };

describe('browser run dispatch', () => {
  it('Cloud Tasks: enqueues an authenticated HTTP task naming the run, signed as the execute service account', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const d = new CloudTasksDispatcher(config, { now: () => 6_000_000, accessToken: async () => 'tok', fetch: (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch });
    await d.dispatch(RUN);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]!.url, 'https://cloudtasks.googleapis.com/v2/projects/xroga-prod/locations/us-central1/queues/browser-runs/tasks');
    assert.equal((seen[0]!.init.headers as Record<string, string>).authorization, 'Bearer tok');
    const task = JSON.parse(String(seen[0]!.init.body)).task;
    assert.equal(task.name, `projects/xroga-prod/locations/us-central1/queues/browser-runs/tasks/${RUN}-10`, 'named by run and window, so a re-dispatch inside the window is deduplicated');
    assert.equal(task.httpRequest.url, config.targetUrl);
    assert.deepEqual(task.httpRequest.oidcToken, { serviceAccountEmail: config.serviceAccountEmail, audience: config.audience });
    assert.deepEqual(JSON.parse(Buffer.from(task.httpRequest.body, 'base64').toString()), { runId: RUN }, 'the body carries the run id and nothing else');
    assert.equal(task.dispatchDeadline, '1800s');
  });

  it('Cloud Tasks: an already-enqueued run is a success, a refusal is an error the caller can see', async () => {
    const respond = (status: number) => new CloudTasksDispatcher(config, { accessToken: async () => 't', fetch: (async () => new Response('{}', { status })) as unknown as typeof fetch });
    await respond(409).dispatch(RUN);
    await assert.rejects(respond(403).dispatch(RUN), /refused the dispatch \(403\)/);
    await assert.rejects(respond(200).dispatch('not-a-run-id'), /invalid run id/);
  });

  it('Cloud Tasks: refuses a malformed queue, a non-https target and a missing identity before any call', () => {
    const deps = { accessToken: async () => 't', fetch: fetch };
    assert.throws(() => new CloudTasksDispatcher({ ...config, queue: '../x' }, deps), /not a valid resource id/);
    assert.throws(() => new CloudTasksDispatcher({ ...config, targetUrl: 'http://api.example/x' }, deps), /https/);
    assert.throws(() => new CloudTasksDispatcher({ ...config, audience: '' }, deps), /service account and an audience/);
  });

  it('in-process: starts the run without waiting for it and reports a failure to the handler instead of throwing', async () => {
    const errors: string[] = [];
    let release: () => void = () => undefined;
    const started: string[] = [];
    const d = new InProcessDispatcher((id) => { started.push(id); return new Promise<void>((r) => { release = r; }); }, (id) => errors.push(id));
    await d.dispatch(RUN);
    assert.deepEqual(started, [RUN]);
    release();
    const failing = new InProcessDispatcher(async () => { throw new Error('boom'); }, (id) => errors.push(id));
    await failing.dispatch(RUN);
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(errors, [RUN]);
  });

  it('the environment picks in-process by default and refuses a half-configured cloud setting instead of silently falling back', () => {
    assert.equal(dispatcherFromEnv({}, async () => undefined, () => undefined).mode, 'in-process');
    assert.throws(() => dispatcherFromEnv({ XROGA_BROWSER_DISPATCH: 'cloud-tasks' }, async () => undefined, () => undefined), /needs XROGA_BROWSER_TASKS_PROJECT/);
    const full = { XROGA_BROWSER_DISPATCH: 'cloud-tasks', XROGA_BROWSER_TASKS_PROJECT: 'p', XROGA_BROWSER_TASKS_LOCATION: 'us-central1', XROGA_BROWSER_TASKS_QUEUE: 'q', XROGA_BROWSER_EXECUTE_URL: 'https://api.example/internal/browser/execute', XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT: 's@p.iam.gserviceaccount.com', XROGA_BROWSER_EXECUTE_AUDIENCE: 'https://api.example/internal/browser/execute' };
    assert.equal(dispatcherFromEnv(full, async () => undefined, () => undefined).mode, 'cloud-tasks');
  });

  it('uses the configured bounded delivery deadline and refuses invalid limits before acquiring credentials', async () => {
    let body = '';
    let credentials = 0;
    const deps = { accessToken: async () => { credentials++; return 'synthetic'; }, fetch: (async (_url, init) => {
      body = String(init?.body); return new Response('{}');
    }) as typeof fetch };
    await new CloudTasksDispatcher({ ...config, dispatchDeadlineSeconds: 900 }, deps).dispatch(RUN);
    assert.equal(JSON.parse(body).task.dispatchDeadline, '900s');
    for (const dispatchDeadlineSeconds of [0, 14, 1801, NaN, Infinity, 900.5]) {
      assert.throws(() => new CloudTasksDispatcher({ ...config, dispatchDeadlineSeconds }, deps), /deadline/);
    }
    assert.equal(credentials, 1);
    const env = { XROGA_BROWSER_DISPATCH: 'cloud-tasks', XROGA_BROWSER_TASKS_PROJECT: 'p', XROGA_BROWSER_TASKS_LOCATION: 'us-east4',
      XROGA_BROWSER_TASKS_QUEUE: 'q', XROGA_BROWSER_EXECUTE_URL: config.targetUrl,
      XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT: config.serviceAccountEmail, XROGA_BROWSER_EXECUTE_AUDIENCE: config.audience,
      XROGA_BROWSER_DISPATCH_DEADLINE_SECONDS: '900' };
    const network = (async (url, init) => {
      if (String(url).includes('metadata.google.internal')) return Response.json({ access_token: 'synthetic' });
      body = String(init?.body); return Response.json({});
    }) as typeof fetch;
    await dispatcherFromEnv(env, async () => undefined, () => undefined, network).dispatcher.dispatch(RUN);
    assert.equal(JSON.parse(body).task.dispatchDeadline, '900s');
    for (const value of ['', '0', '1801', '900.5', 'garbage']) {
      assert.throws(() => dispatcherFromEnv({ ...env, XROGA_BROWSER_DISPATCH_DEADLINE_SECONDS: value }, async () => undefined, () => undefined, network), /deadline/);
    }
  });
});

it('Cloud Tasks never follows a redirect carrying the runtime service token',async()=>{
 let redirect:RequestInit['redirect'];
 const d=new CloudTasksDispatcher({project:'p',location:'us-central1',queue:'q',targetUrl:'https://api.example/internal/browser/execute',serviceAccountEmail:'s@p.iam.gserviceaccount.com',audience:'https://api.example/internal/browser/execute'},{accessToken:async()=>'synthetic-runtime-credential',fetch:async(_url,init)=>{redirect=init?.redirect;return Response.redirect('https://attacker.example',307);}});
 await assert.rejects(d.dispatch(RUN));assert.equal(redirect,'manual');
});
