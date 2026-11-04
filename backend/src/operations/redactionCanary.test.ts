import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactOperationsValue } from './operationsEngine.js';

/**
 * Canary secrets through the redaction every run event, trace and evidence row passes through (appendRunEvent calls it before anything is stored).
 * Each canary is a distinctive string; if any survives, a real credential of that shape would have been written to a log, an event or a trace.
 */
const CANARIES = {
  basicAuth: 'Authorization: Basic Q0FOQVJZX0JBU0lDX0NSRURT',
  bearer: 'Authorization: Bearer CANARY_BEARER_TOKEN_9f3a',
  cookies: 'Cookie: sid=CANARY_SESSION_1; csrf=CANARY_CSRF_2; theme=dark',
  setCookie: 'Set-Cookie: session=CANARY_SETCOOKIE_3; Path=/; HttpOnly',
  jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJDQU5BUllfSldUIn0.CANARY_JWT_SIGNATURE_abc123',
  awsKey: 'AKIACANARYAWSKEY1234',
  googleKey: 'AIzaSyCANARY_GOOGLE_API_KEY_0123456789ab',
  pem: '-----BEGIN PRIVATE KEY-----\nCANARY_PEM_BODY_LINE\n-----END PRIVATE KEY-----',
  dbUrl: 'postgres://app:CANARY_DB_PASSWORD@db.internal:5432/xroga',
  skKey: 'sk-or-v1-CANARY_OPENROUTER_0123456789',
  ghToken: 'ghp_CANARY_GITHUB_TOKEN_0123456789',
  envStyle: 'SUPABASE_SERVICE_ROLE_KEY=CANARY_SERVICE_ROLE_VALUE',
};
const MARKERS = ['Q0FOQVJZX0JBU0lDX0NSRURT', 'CANARY_BEARER_TOKEN', 'CANARY_SESSION_1', 'CANARY_CSRF_2', 'CANARY_SETCOOKIE_3', 'CANARY_JWT_SIGNATURE', 'AKIACANARYAWSKEY1234',
  'CANARY_GOOGLE_API_KEY', 'CANARY_PEM_BODY_LINE', 'CANARY_DB_PASSWORD', 'CANARY_OPENROUTER', 'CANARY_GITHUB_TOKEN', 'CANARY_SERVICE_ROLE_VALUE'];

const surviving = (text: string) => MARKERS.filter((m) => text.includes(m));

for (const profile of ['audit', 'tool_output'] as const) {
  test(`${profile}: no canary secret shape survives redaction of a free-text log line`, () => {
    const out = JSON.stringify(redactOperationsValue({ message: Object.values(CANARIES).join('\n') }, profile));
    assert.deepEqual(surviving(out), [], `these canaries leaked: ${surviving(out).join(', ')}`);
  });

  test(`${profile}: canaries survive neither nested objects nor arrays`, () => {
    const out = JSON.stringify(redactOperationsValue({ a: { b: [{ line: CANARIES.basicAuth }, CANARIES.cookies, { deep: { text: CANARIES.jwt } }] }, list: [CANARIES.pem, CANARIES.googleKey, CANARIES.awsKey] }, profile));
    assert.deepEqual(surviving(out), []);
  });
}

test('positive control: ordinary, non-secret diagnostic text is left readable', () => {
  const text = 'Build failed at step install: exit code 1 after 12.4s in /workspace/src (3 files changed)';
  assert.equal(redactOperationsValue(text), text);
  assert.deepEqual(redactOperationsValue({ stage: 'test', passed: 12, failed: 1 }), { stage: 'test', passed: 12, failed: 1 });
});
