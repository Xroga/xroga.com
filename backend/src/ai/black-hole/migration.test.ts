import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertNoPublicIdentityLeak, findPublicIdentityLeaks } from './publicIdentity.js';
import { readCutoverPlan } from './cutover.js';
import { decideConversion } from './converterPolicy.js';
import { assessBlackHoleComplexity } from './complexity.js';
import { analyzeTask } from './taskClass.js';
import { dashboardModelPools, POOL_PUBLIC_ID_BY_ROLE } from '../models.js';
import { publicIntelligenceHealth } from '../modelCapabilityRegistry.js';

/**
 * §27 migration and §30/§31 public surfaces.
 *
 * These assert over the *actual* published shapes rather than over a copy, so they fail if a
 * future change reintroduces a leak into the real payload — which is the only version of this
 * test worth having.
 */

// ---------------------------------------------------------------------------
// §30/§31 — the three surfaces the audit found
// ---------------------------------------------------------------------------

test('the usage dashboard pools publish no model id and no persona', () => {
  const pools = dashboardModelPools(16.5);
  // `role` is internal and is not published; the public projection is what quota.ts emits.
  const published = pools.map((pool) => ({
    id: pool.publicId,
    label: pool.label,
    tagline: pool.tagline,
    totalLimit: pool.totalLimit,
    budgetUsd: pool.budgetUsd,
  }));
  assertNoPublicIdentityLeak(published, 'usage dashboard byModel');
});

test('the dashboard tiers stay distinguishable', () => {
  // Satisfying §31 by publishing "Black Hole ∞" four times would destroy the feature: the
  // reason a user opens this screen is to see which kind of work consumed their budget.
  const pools = dashboardModelPools(16.5);
  const labels = pools.map((pool) => pool.label);
  assert.equal(new Set(labels).size, labels.length, 'tier labels must be distinct');
  const ids = pools.map((pool) => pool.publicId);
  assert.equal(new Set(ids).size, ids.length, 'tier ids must be distinct');
});

test('every internal pool role has a public translation', () => {
  // A missing entry would silently publish the raw role as a fallback.
  for (const pool of dashboardModelPools(16.5)) {
    assert.equal(
      POOL_PUBLIC_ID_BY_ROLE[pool.role],
      pool.publicId,
      `${pool.role} has no public id mapping`,
    );
  }
});

test('the public capabilities route publishes service health, not fleet composition', () => {
  const health = publicIntelligenceHealth();
  assert.ok(['operational', 'degraded', 'unavailable'].includes(health.status));
  assertNoPublicIdentityLeak(health, 'public capabilities intelligence');
  // A per-model list would tell a caller how many models the platform runs.
  assert.deepEqual(Object.keys(health), ['status']);
});

// ---------------------------------------------------------------------------
// §27 — the converter migration, at each §39 stage
// ---------------------------------------------------------------------------

const conversionFor = (prompt: string) => {
  const analysis = analyzeTask({ prompt, projectId: 'p-1', repositoryMutationRequested: true });
  return decideConversion({
    prompt,
    analysis,
    complexity: assessBlackHoleComplexity({ prompt, analysis }),
  });
};

/** Mirrors the branch pipeline.ts takes, so the test tracks the real decision. */
const skipsConverter = (prompt: string, env: NodeJS.ProcessEnv) =>
  readCutoverPlan(env).runsBlackHole && !conversionFor(prompt).convert;

test('with the flag unset, the converter still runs on every build', () => {
  // The migration ships dark. An unset variable must leave production doing what it does.
  const env = {} as NodeJS.ProcessEnv;
  for (const prompt of [
    'add a dark mode toggle to the settings page',
    'build me an app',
    'fix the null check in src/auth/session.ts',
  ]) {
    assert.equal(skipsConverter(prompt, env), false, `converter skipped while dark: ${prompt}`);
  }
});

test('once enabled, a clear request skips the converter call', () => {
  const env = { BLACK_HOLE_CUTOVER_STAGE: 'shadow' } as unknown as NodeJS.ProcessEnv;
  assert.equal(skipsConverter('add a dark mode toggle to the settings page', env), true);
  assert.equal(skipsConverter('fix the null check in src/auth/session.ts', env), true);
});

test('once enabled, an ambiguous request still gets its planning call', () => {
  const env = { BLACK_HOLE_CUTOVER_STAGE: 'shadow' } as unknown as NodeJS.ProcessEnv;
  assert.equal(skipsConverter('build me an app', env), false);
  assert.equal(skipsConverter('build something like a booking system', env), false);
});

test('a skipped conversion always yields a usable instruction', () => {
  // The pipeline uses `normalizedInstruction` directly when it skips; an empty one would send
  // the builder an empty brief, which is worse than the extra call.
  for (const prompt of [
    'add a dark mode toggle to the settings page',
    'rename the getUser function to loadUser across the api module',
  ]) {
    const decision = conversionFor(prompt);
    assert.equal(decision.convert, false);
    assert.ok(decision.normalizedInstruction.trim().length > 0, prompt);
  }
});

test('the rollback stage restores the original behaviour exactly', () => {
  // Rolling back must return the converter to unconditional, not to a half-migrated state.
  const env = { BLACK_HOLE_CUTOVER_STAGE: 'legacy_only' } as unknown as NodeJS.ProcessEnv;
  assert.equal(readCutoverPlan(env).runsBlackHole, false);
  assert.equal(skipsConverter('add a dark mode toggle to the settings page', env), false);
});

test('no conversion decision leaks provider identity into its reason', () => {
  // The reason string is a candidate for surfacing to users as build progress.
  for (const prompt of ['add a button', 'build me an app', 'migrate the entire codebase']) {
    assert.deepEqual(findPublicIdentityLeaks(conversionFor(prompt).reason), [], prompt);
  }
});
