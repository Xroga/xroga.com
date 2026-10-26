/**
 * Entry point of the isolated browser QA host. It is a SEPARATE deployment from the customer-facing API: it holds no database
 * credential, no user token and no provider key, only the shared request-signing secret, and it drives Chromium against generated
 * applications at addresses it is explicitly configured to test.
 *
 *   XROGA_QA_HOST_SECRET            shared signing secret, at least 32 bytes (the API's XROGA_BUILDER_QA_HOST_SECRET)
 *   XROGA_QA_HOST_ALLOWED_SUFFIXES  comma separated https host suffixes it may test, e.g. ".preview.example.com"; empty allows nothing
 *   XROGA_QA_HOST_MAX_CONCURRENT    simultaneous browser runs (default 2); more are answered 503 and recorded as not run
 *   PORT                            listen port (default 8080)
 *
 * Running it needs a container or VM with Chromium and no route to anything private; that deployment belongs to the Google runtime
 * (PR #856) and is not created by this code.
 */
import express from 'express';

import { openPlaywrightQaDriver } from './playwrightQaDriver.js';
import { allowedPreviewHosts, createQaHostRouter, type QaHostDeps } from './remoteQa.js';
import { runQa } from './runner.js';

export function createQaHostApp(env: NodeJS.ProcessEnv = process.env, open: typeof openPlaywrightQaDriver = openPlaywrightQaDriver) {
  const secret = env.XROGA_QA_HOST_SECRET ?? '';
  const limit = Math.max(1, Number(env.XROGA_QA_HOST_MAX_CONCURRENT ?? 2) || 2);
  let active = 0;
  const execute: QaHostDeps['execute'] = async ({ baseUrl, plan, environment, only, previouslyPassed }) => {
    if (active >= limit) throw new Error('busy');
    active += 1;
    try {
      const driver = await open({ baseUrl });
      return await runQa({ plan, driver, environment, only, previouslyPassed, baseHost: new URL(baseUrl).host });
    } finally {
      active -= 1;
    }
  };
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use(createQaHostRouter({ secret, allowBaseUrl: allowedPreviewHosts((env.XROGA_QA_HOST_ALLOWED_SUFFIXES ?? '').split(',')), execute }));
  return app;
}

if (process.argv[1] && /qaHostMain\.(ts|js)$/.test(process.argv[1])) {
  createQaHostApp().listen(Number(process.env.PORT ?? 8080), () => console.log('[qa-host] listening'));
}
