import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliverTeamInvitation, inviteEmailConfiguration } from './teamInviteEmail.js';

const env = {
  BREVO_API_KEY: 'synthetic-test-key',
  BREVO_SENDER_EMAIL: 'verified@example.org',
  XROGA_TEAMS_INVITE_WEB_ORIGIN: 'https://teams-preview-xrogas-projects.vercel.app',
};

test('builds a preview-only invitation using Brevo v3 without secret or bearer link in the message', async () => {
  const config = inviteEmailConfiguration(env);
  assert.ok(config);
  let attempts = 0;
  const state = await deliverTeamInvitation(config, 'recipient@example.org', 'Team\nDemo', async (url, params) => {
    attempts += 1;
    assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(params?.method, 'POST');
    assert.equal(params?.redirect, 'error');
    assert.ok(params?.signal);
    assert.equal(new Headers(params?.headers).get('api-key'), env.BREVO_API_KEY);
    const body = JSON.parse(String(params?.body));
    assert.deepEqual(body.to, [{ email: 'recipient@example.org' }]);
    assert.equal(body.sender.email, env.BREVO_SENDER_EMAIL);
    assert.match(body.textContent, /Team Demo/);
    assert.match(body.textContent, /\/workspace\?teamInvites=1/);
    assert.doesNotMatch(String(params?.body), /synthetic-test-key|https:\/\/xroga\.com/);
    return new Response('provider-private-data', { status: 201 });
  });
  assert.equal(attempts, 1);
  assert.equal(state, 'accepted');
});

test('fails closed without a sender or for an untrusted, production or non-origin link', () => {
  assert.equal(inviteEmailConfiguration({ ...env, BREVO_SENDER_EMAIL: '' }), null);
  for (const origin of ['https://xroga.com', 'https://xrogas-projects.vercel.app.attacker.example', env.XROGA_TEAMS_INVITE_WEB_ORIGIN + '/other']) {
    assert.equal(inviteEmailConfiguration({ ...env, XROGA_TEAMS_INVITE_WEB_ORIGIN: origin }), null);
  }
});

test('ambiguous provider outcomes never trigger retries and definite refusal is separate', async () => {
  const config = inviteEmailConfiguration(env)!;
  for (const [status, expected] of [[429, 'rejected'], [503, 'unknown'], [307, 'unknown']] as const) {
    let attempts = 0;
    const state = await deliverTeamInvitation(config, 'recipient@example.org', 'Team', async () => {
      attempts += 1;
      return new Response(null, { status });
    });
    assert.equal(state, expected);
    assert.equal(attempts, 1);
  }
  let attempts = 0;
  const state = await deliverTeamInvitation(config, 'recipient@example.org', 'Team', async () => {
    attempts += 1;
    throw new Error('synthetic transport error');
  });
  assert.equal(state, 'unknown');
  assert.equal(attempts, 1);
});
