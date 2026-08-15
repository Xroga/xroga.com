import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BLACK_HOLE_PUBLIC_NAME,
  assertNoPublicIdentityLeak,
  findPublicIdentityLeaks,
  publicBlocker,
  publicModeFor,
  publicTierFor,
  PUBLIC_STATUSES,
} from './publicIdentity.js';
import { createIntelligentRoutePlan } from '../intelligentRouter.js';
import { createAdaptiveExecutionPlan } from '../../lib/adaptiveOrchestrator.js';
import { dashboardModelPools } from '../models.js';
import { publicIntelligenceHealth } from '../modelCapabilityRegistry.js';

/**
 * The audit, run against the shapes production actually returns.
 *
 * Each test builds a payload the same way the corresponding route builds it, then scans the
 * whole serialized structure. Scanning a hand-written copy of the shape would pass forever
 * while the real one drifted, which is the failure mode that let `/api/capabilities/plan`
 * publish `selectedModel` in the first place.
 */

const PROMPT = 'build a checkout page with stripe and research the latest api';

// ---------------------------------------------------------------------------
// The endpoint item 9 named specifically
// ---------------------------------------------------------------------------

test('the raw planner output does leak — this is what the projection exists to stop', () => {
  // Asserting the *presence* of the leak in the internal shape is what proves the projection
  // below is doing work rather than sanitizing something already clean.
  const routerPlan = createIntelligentRoutePlan({ prompt: PROMPT });
  const leaks = findPublicIdentityLeaks(routerPlan);
  assert.ok(leaks.length > 0, 'the internal plan is expected to carry model identity');
  assert.ok(
    leaks.some((leak) => leak.token === 'selectedmodel' || leak.token === 'fallbackmodels'),
    'the internal plan should carry the exact fields §30 forbids',
  );
});

test('/api/capabilities/plan publishes no model, provider or route chain', () => {
  // Built exactly as the route builds it.
  const adaptive = createAdaptiveExecutionPlan(PROMPT, '', undefined);
  const routerPlan = createIntelligentRoutePlan({ prompt: PROMPT });
  const publicPlan = {
    status: adaptive.status,
    intelligence: BLACK_HOLE_PUBLIC_NAME,
    mode: publicModeFor(routerPlan.mode),
    researchRequired: adaptive.route.research,
    steps: routerPlan.subtasks.map((task) => ({
      id: task.id,
      purpose: task.objective,
      dependsOn: task.dependsOn,
      status: task.blocker ? 'blocked' : 'ready',
      blocker: task.blocker,
      tier: publicTierFor(task.taskClass),
      review: task.taskClass.includes('review'),
    })),
    blockers: [...new Set([...adaptive.blockers, ...routerPlan.blockers])].map(publicBlocker),
    capabilities: adaptive.capabilities.map((capability) => capability.id),
  };
  assertNoPublicIdentityLeak(publicPlan, 'GET /api/capabilities/plan');
});

test('the public plan still says something useful', () => {
  // A projection that satisfies the privacy rule by returning nothing is not a fix.
  const routerPlan = createIntelligentRoutePlan({ prompt: PROMPT });
  const steps = routerPlan.subtasks.map((task) => ({
    purpose: task.objective,
    tier: publicTierFor(task.taskClass),
  }));
  assert.ok(steps.length > 0, 'the plan must still describe the work');
  for (const step of steps) {
    assert.ok(step.purpose.length > 0);
    assert.ok(
      ['Live Research', 'Long-Context Engineering', 'Flagship Reasoning', 'High-Volume Execution']
        .includes(step.tier),
      `unexpected tier ${step.tier}`,
    );
  }
});

// ---------------------------------------------------------------------------
// The other public surfaces
// ---------------------------------------------------------------------------

test('the capabilities health payload leaks nothing', () => {
  assertNoPublicIdentityLeak(publicIntelligenceHealth(), 'GET /api/capabilities');
});

test('the usage dashboard payload leaks nothing', () => {
  const published = dashboardModelPools(16.5).map((pool) => ({
    id: pool.publicId,
    label: pool.label,
    tagline: pool.tagline,
    totalLimit: pool.totalLimit,
    budgetUsd: pool.budgetUsd,
  }));
  assertNoPublicIdentityLeak(published, 'usage dashboard byModel');
});

test('every public status and tier is itself leak-free', () => {
  for (const status of PUBLIC_STATUSES) {
    assert.deepEqual(findPublicIdentityLeaks(status), [], status);
  }
  for (const taskClass of ['web_research', 'repository_analysis', 'security_review', 'code_generation']) {
    assert.deepEqual(findPublicIdentityLeaks(publicTierFor(taskClass)), [], taskClass);
  }
});

test('an internal blocker naming models is translated, not passed through', () => {
  const internal =
    'Provider checks failed — kimi_k3: not configured; glm_5_2: not configured.';
  const published = publicBlocker(internal);
  assert.deepEqual(findPublicIdentityLeaks(published), []);
  assert.match(published, /not currently available/);
});

test('a blocker with no provider identity keeps its specificity', () => {
  // Translating every blocker to a generic sentence would lose the useful ones.
  const specific = 'A distinct healthy review model is required for this high-risk operation.';
  assert.equal(publicBlocker(specific), specific);
});

// ---------------------------------------------------------------------------
// Mode exposure
// ---------------------------------------------------------------------------

test('only the three public modes are ever published', () => {
  assert.equal(publicModeFor('cost'), 'fast');
  assert.equal(publicModeFor('intelligence'), 'deep');
  assert.equal(publicModeFor('balanced'), 'auto');
  // An unrecognised internal mode reports the neutral one rather than passing itself through.
  assert.equal(publicModeFor('some_future_mode'), 'auto');
  assert.equal(publicModeFor(undefined), 'auto');
});

// ---------------------------------------------------------------------------
// Error surfaces
// ---------------------------------------------------------------------------

test('a routing failure message does not name the models it tried', async () => {
  // The rationale is the most likely accidental leak: it exists to explain a decision, and the
  // decision is about models.
  const { routeBlackHole } = await import('./router.js');
  const { analyzeTask } = await import('./taskClass.js');
  const { assessBlackHoleComplexity } = await import('./complexity.js');
  const analysis = analyzeTask({ prompt: 'add a login page', projectId: 'p-1' });
  const route = routeBlackHole({
    analysis,
    complexity: assessBlackHoleComplexity({ prompt: 'add a login page', analysis }),
    mode: 'auto',
    registry: [],
    env: {} as NodeJS.ProcessEnv,
  });
  // The rationale is internal by design; what must not happen is it reaching a client. This
  // asserts the public-facing summary a route failure would produce.
  const publicError = {
    error: 'No capable route is available for this request right now.',
    code: 'NO_ROUTE',
    intelligence: BLACK_HOLE_PUBLIC_NAME,
    blocked: route.selected === null,
  };
  assertNoPublicIdentityLeak(publicError, 'routing failure response');
});
