import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';

import router, { connectionStatusTarget, explicitConfirmationIntent } from './phase1BusinessPreflight.js';

test('only explicit pending-action follow-ups bypass semantic planning', () => {
  assert.equal(explicitConfirmationIntent('Confirm it'), 'confirm');
  assert.equal(explicitConfirmationIntent('No, cancel that action'), 'cancel');
});

test('new software and connected-app requests remain semantic-planner inputs', () => {
  const requests = [
    'Make a patient scheduling interface with validation and a runnable Preview.',
    'Create an inventory forecasting service and test its API.',
    'Send the approved status update to the project channel.',
    'Schedule a meeting with the design team tomorrow.',
  ];

  for (const request of requests) {
    assert.equal(explicitConfirmationIntent(request), null);
  }
});

test('ambiguous confirmation messages never select or execute a latest action across conversations', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const prior = keys.map(key => process.env[key]);
  process.env.SUPABASE_URL = 'http://127.0.0.1:49193';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  const original = globalThis.fetch;
  const calls: string[] = [];
  let missingUsage = false;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { (req as AuthRequest).userId = '11111111-1111-4111-8111-111111111111'; next(); });
  app.use(router); app.use((_req, res) => res.status(418).json({ semanticPlanner: true }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin === base) return original(input, init);
    calls.push(`${init?.method ?? 'GET'} ${url.origin}${url.pathname}`);
    assert.equal(url.origin, process.env.SUPABASE_URL, 'No provider/paid model calls');
    assert.equal(init?.method ?? 'GET', 'GET', 'No state changes');
    assert.ok(!url.pathname.includes('business_action_confirmations'), 'No latest-row selection');
    return Response.json(missingUsage ? null : { user_id: '11111111-1111-4111-8111-111111111111', plan_tier: 'free',
      plan_budget_usd: 1.65, quota_period_start: `${new Date().toISOString().slice(0, 7)}-01`,
      input_tokens: 0, output_tokens: 0, spent_usd: 0, rollover_usd: 0, model_usage: {} });
  };
  const plan = (message: string, conversationId: string) => fetch(`${base}/plan`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversationId, confirmationId: 'untrusted-body-id' }),
  });
  try {
    const replies = await Promise.all(['Confirm it', 'No, cancel that action', 'Proceed', 'Execute it'].map((message, i) => plan(message, `thread-${i}`)));
    for (const reply of replies) {
      assert.equal(reply.status, 200);
      const body = await reply.json() as { directResponse: string; dispatch: string };
      assert.equal(body.dispatch, 'chat'); assert.match(body.directResponse, /specific connected-app action/);
      assert.doesNotMatch(body.directResponse, /Done|completed|already cancelled/);
    }
    assert.equal((await plan('Build a scheduling interface', 'ordinary')).status, 418);
    missingUsage = true;
    assert.equal((await plan('Confirm it', 'missing-usage')).status, 503);
    assert.ok(calls.every(call => !call.includes('business_action_confirmations')));
    assert.ok(calls.every(call => call.startsWith(`GET ${process.env.SUPABASE_URL}/rest/v1/`)));
  } finally {
    globalThis.fetch = original;
    keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('connection-status questions bypass tool discovery without treating connection requests as status checks', () => {
  assert.equal(connectionStatusTarget('check gmail app is connected with xroga'), 'gmail');
  assert.equal(connectionStatusTarget('Check whether Gmail is connected to my Xroga account. Report only connected or not connected and the app name. Do not read messages, send mail, create drafts, or change anything.'), 'Gmail');
  assert.equal(connectionStatusTarget('Is my Google Calendar connected?'), 'Google Calendar');
  assert.equal(connectionStatusTarget('Which apps are connected?'), '*');
  assert.equal(connectionStatusTarget('Connect my Gmail account'), null);
  assert.equal(connectionStatusTarget('Send an email from Gmail'), null);
  assert.equal(connectionStatusTarget('Check Gmail is connected and send an email to Jane'), null);
  assert.equal(connectionStatusTarget('Check Gmail is connected. Then send an email to Jane.'), null);
  assert.equal(connectionStatusTarget('Check Gmail is connected. Report only status and send an email to Jane.'), null);
  assert.equal(connectionStatusTarget('Which apps are connected, then create a calendar event'), null);
});
