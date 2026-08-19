import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Regression coverage for the two races that made `command3-auth.spec.ts` unreliable.
 *
 * The end-to-end spec needs live Supabase and a browser, so it cannot run here. What *can* run
 * here is the thing that actually broke: the **ordering**. Both defects were timing patterns, and
 * a timing pattern can be modelled exactly — a write that completes after a delay, and a reader
 * that either waits for it or does not. The model below is real asynchrony, not a description of
 * one, and it fails if the unreliable ordering is ever mistaken for the deterministic one.
 *
 * The source guards that follow stop the specific mistakes from returning: a durable-persistence
 * wait gated behind an unrelated variable, and an authentication transition asserted with a
 * timeout too short for a network round trip.
 */

const SPEC = readFileSync(
  new URL('../../e2e/command3-auth.spec.ts', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// The race, modelled
// ---------------------------------------------------------------------------

/** A value that only becomes durable after some delay — a debounced PATCH reaching Postgres. */
function eventuallyDurable(delayMs: number): { read: () => string | null } {
  let stored: string | null = null;
  setTimeout(() => { stored = 'techwear'; }, delayMs).unref?.();
  return { read: () => stored };
}

/** Poll until the durable value is present, or give up. The deterministic ordering. */
async function waitForDurable(store: { read: () => string | null }, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = store.read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return store.read();
}

test('reading immediately after a write is unreliable — this is the old behaviour', async () => {
  // The write lands after 60ms; the reader looks at once. This is exactly what the spec did on
  // pull requests: click, then `page.reload()` with no wait, then assert the value survived.
  const store = eventuallyDurable(60);
  const observedImmediately = store.read();

  assert.equal(observedImmediately, null, 'the immediate read saw the value, so the model is not exercising the race');
});

test('waiting for durability first is deterministic — this is the new behaviour', async () => {
  const store = eventuallyDurable(60);
  const observed = await waitForDurable(store, 5_000);

  assert.equal(observed, 'techwear');
});

test('the deterministic ordering holds across many attempts, the racy one does not', async () => {
  // One passing run proves nothing about a race; a race is a distribution. Varying the delay
  // across the reader's window is what separates "reliable" from "lucky".
  let immediateHits = 0;
  const attempts = 25;

  for (let index = 0; index < attempts; index += 1) {
    const delay = 1 + (index % 12);
    const racy = eventuallyDurable(delay);
    if (racy.read() !== null) immediateHits += 1;

    const deterministic = eventuallyDurable(delay);
    assert.equal(await waitForDurable(deterministic, 5_000), 'techwear', `attempt ${index} lost the value`);
  }

  // The unreliable ordering never reliably wins — that is the point. If this ever became a
  // reliable read, the model would no longer represent the defect being guarded against.
  assert.ok(immediateHits < attempts, 'the immediate read succeeded every time; the model no longer shows a race');
});

test('a bounded wait still fails when the value never arrives', async () => {
  // Bounded, not disabled. Waiting longer must not mean waiting forever, and a write that never
  // lands must still fail rather than hang until the suite times out.
  const never = { read: () => null };
  const started = Date.now();
  const observed = await waitForDurable(never, 120);

  assert.equal(observed, null);
  assert.ok(Date.now() - started < 2_000, 'the bounded wait did not return promptly');
});

// ---------------------------------------------------------------------------
// The spec keeps the fixes
// ---------------------------------------------------------------------------

test('durable persistence is confirmed on every run, not only when billing is configured', () => {
  // The original defect: the durable-storage poll sat inside `if (launchBillingApiUrl)`, a
  // *billing* variable that is unset on pull requests. PR runs therefore skipped the only step
  // that established the preference had been saved, and then asserted it survived a reload.
  const durableWait = SPEC.indexOf('companion preferences did not reach durable profile storage');
  const reload = SPEC.indexOf('await page.reload();', durableWait);

  assert.ok(durableWait > -1, 'the durable-persistence wait is gone');
  assert.ok(reload > durableWait, 'the reload no longer follows the durable-persistence wait');

  // The wait must not be conditional on anything.
  const guardedByBilling = /if \(launchBillingApiUrl\) \{[\s\S]{0,600}did not reach durable profile storage/.test(SPEC);
  assert.equal(guardedByBilling, false, 'the durable wait was put back behind the billing variable');
});

test('the persistence check reads real durable storage, with no CI-only shortcut', () => {
  // A local-only or stubbed persistence path would make the test pass without proving the
  // preference was stored, which is worse than the flake it replaced.
  const block = SPEC.slice(
    SPEC.indexOf('const techwear = page.getByRole'),
    SPEC.indexOf('await page.goto(\'/settings\');'),
  );
  assert.match(block, /admin\.from\('profiles'\)\.select\('companion_preferences'\)/);
  assert.equal(/localStorage|sessionStorage|__TEST__|mockPersist/.test(block), false, 'a CI-only persistence path appeared');
});

test('the authentication transition has an explicit bounded timeout', () => {
  // The default 5s could not cover a live Supabase round trip plus a redirect, so the assertion
  // measured CI latency rather than authentication.
  assert.match(SPEC, /const AUTH_TRANSITION_TIMEOUT_MS = [\d_]+/);
  assert.match(
    SPEC,
    /toHaveURL\(\/\\\/\(workspace\|dashboard\)\/, \{ timeout: AUTH_TRANSITION_TIMEOUT_MS \}\)/,
    'the post-login URL assertion lost its explicit timeout',
  );

  // `[\d_]+` rather than `\d+`: the literal is written `30_000`, and a digits-only capture
  // silently reads it as 30 — which would have this guard failing a perfectly good timeout.
  const configured = Number(SPEC.match(/const AUTH_TRANSITION_TIMEOUT_MS = ([\d_]+)/)?.[1]?.replace(/_/g, '') ?? 0);
  assert.ok(configured >= 15_000, `the auth transition timeout is ${configured}ms, too tight for a real login`);
  // Still bounded by the per-test ceiling: a hung login must fail, not stall the suite.
  assert.ok(configured < 180_000, 'the auth transition timeout is no longer meaningfully bounded');
});

test('what the test proves is unchanged', () => {
  // Reliability work must not quietly delete coverage. These are the behaviours the spec exists
  // to prove, and each must still be asserted.
  assert.match(SPEC, /toHaveURL\(\/\\\/\(workspace\|dashboard\)\//, 'the login still must reach an authenticated route');
  assert.match(SPEC, /authenticated: true/, 'the session assertion is gone');
  assert.match(SPEC, /page\.reload\(\)/, 'the reload-reads-persisted-preference step is gone');
  assert.match(SPEC, /crossTenant/i, 'tenant isolation coverage is gone');
  assert.equal(/test\.skip|test\.fixme|\.only\(/.test(SPEC), false, 'an assertion was skipped rather than fixed');
});
