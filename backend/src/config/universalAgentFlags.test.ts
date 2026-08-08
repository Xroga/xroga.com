/**
 * Tests for the rollout flags.
 *
 * The invariant that matters is that shadow mode never writes. Everything else here is
 * about a flag failing safe: an unset variable, a typo, or a missing project id must all
 * leave the legacy pipeline in charge rather than half-enabling a new path.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareShadowDecision,
  mayWrite,
  readUniversalAgentFlags,
  routeProject,
} from './universalAgentFlags.js';

describe('flags fail safe', () => {
  it('is off when nothing is configured', () => {
    // A flag that defaults to on is not a rollout.
    const flags = readUniversalAgentFlags({});
    assert.equal(flags.mode, 'off');
    assert.equal(routeProject('p1', flags).useUniversal, false);
  });

  it('treats an unrecognised value as off rather than guessing', () => {
    // A typo in an environment variable must not enable a code path. The failure of a
    // misread flag should be "nothing changed".
    for (const value of ['yes', 'maybe', 'ENABLE', '2', '']) {
      assert.equal(readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: value }).mode, 'off', `"${value}" must be off`);
    }
  });

  it('clamps a percentage rather than trusting it', () => {
    const high = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'enabled', UNIVERSAL_AGENT_PERCENTAGE: '500' });
    const negative = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'enabled', UNIVERSAL_AGENT_PERCENTAGE: '-10' });
    const nonsense = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'enabled', UNIVERSAL_AGENT_PERCENTAGE: 'half' });
    assert.equal(high.percentage, 100);
    assert.equal(negative.percentage, 0);
    assert.equal(nonsense.percentage, 0);
  });

  it('ignores percentage and allowlist entirely while off', () => {
    const flags = readUniversalAgentFlags({
      UNIVERSAL_AGENT_ENABLED: 'off',
      UNIVERSAL_AGENT_PERCENTAGE: '100',
      UNIVERSAL_AGENT_ALLOWLIST: 'p1,p2',
    });
    assert.equal(flags.percentage, 0);
    assert.deepEqual(flags.allowlist, []);
    assert.equal(routeProject('p1', flags).useUniversal, false);
  });
});

describe('shadow mode never writes', () => {
  // §70's one hard invariant, enforced rather than remembered.
  it('routes to the legacy pipeline and forbids writing', () => {
    const flags = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'shadow' });
    const decision = routeProject('p1', flags);
    assert.equal(decision.useUniversal, false);
    assert.equal(decision.shadow, true);
    assert.equal(mayWrite(decision), false);
  });

  it('forbids writing in every mode that is not a live universal run', () => {
    for (const mode of ['off', 'shadow', 'enabled']) {
      for (const percentage of ['0', '50', '100']) {
        const flags = readUniversalAgentFlags({
          UNIVERSAL_AGENT_ENABLED: mode,
          UNIVERSAL_AGENT_PERCENTAGE: percentage,
        });
        const decision = routeProject('project-abc', flags);
        assert.equal(
          mayWrite(decision),
          decision.useUniversal && !decision.shadow,
          `${mode}/${percentage} must only permit writing on a live universal run`,
        );
        if (decision.shadow) assert.equal(mayWrite(decision), false);
      }
    }
  });
});

describe('bucketing is stable', () => {
  it('gives a project the same answer every time', () => {
    // A project must not move between paths on retry: a run that half-executed under one
    // pipeline and resumed under the other is far harder to diagnose than either being
    // wrong on its own.
    const flags = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'enabled', UNIVERSAL_AGENT_PERCENTAGE: '50' });
    const first = routeProject('project-stable', flags);
    for (let attempt = 0; attempt < 25; attempt += 1) {
      assert.equal(routeProject('project-stable', flags).useUniversal, first.useUniversal);
    }
  });

  it('sends everyone universal at 100 and nobody at 0', () => {
    const all = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'enabled', UNIVERSAL_AGENT_PERCENTAGE: '100' });
    const none = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'enabled', UNIVERSAL_AGENT_PERCENTAGE: '0' });
    for (const id of ['a', 'b', 'project-1', 'project-2', 'zzz']) {
      assert.equal(routeProject(id, all).useUniversal, true, `${id} at 100%`);
      assert.equal(routeProject(id, none).useUniversal, false, `${id} at 0%`);
    }
  });

  it('honours the allowlist regardless of percentage', () => {
    // So an operator can watch one project without exposing a slice of everyone else.
    const flags = readUniversalAgentFlags({
      UNIVERSAL_AGENT_ENABLED: 'enabled',
      UNIVERSAL_AGENT_PERCENTAGE: '0',
      UNIVERSAL_AGENT_ALLOWLIST: 'vip-project, other-project',
    });
    assert.equal(routeProject('vip-project', flags).useUniversal, true);
    assert.equal(routeProject('other-project', flags).useUniversal, true);
    assert.equal(routeProject('someone-else', flags).useUniversal, false);
  });

  it('shadows rather than gambling when there is no project id', () => {
    const flags = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'enabled', UNIVERSAL_AGENT_PERCENTAGE: '100' });
    const decision = routeProject(null, flags);
    assert.equal(decision.useUniversal, false);
    assert.equal(decision.shadow, true);
    assert.match(decision.reason, /stable/);
  });
});

describe('shadow comparison surfaces the failure this command fixes', () => {
  it('flags a static decision for a non-web product', () => {
    // The exact case: the legacy vocabulary has four values, so a Rust CLI can only be
    // recorded as the nearest web option.
    const comparison = compareShadowDecision({
      legacyStack: 'static',
      universalLanguages: ['rust'],
      universalSurfaces: ['cli'],
    });
    assert.equal(comparison.agreed, false);
    assert.ok(comparison.differences.some((difference) => /no value for this product/.test(difference)));
    assert.ok(comparison.differences.some((difference) => /static HTML for a rust product/.test(difference)));
  });

  it('agrees when both paths reach a web frontend', () => {
    const comparison = compareShadowDecision({
      legacyStack: 'nextjs',
      universalLanguages: ['typescript'],
      universalSurfaces: ['web_frontend'],
    });
    assert.equal(comparison.agreed, true);
    assert.deepEqual(comparison.differences, []);
  });

  it('records that the universal path would have refused', () => {
    const comparison = compareShadowDecision({
      legacyStack: 'static',
      universalLanguages: [],
      universalSurfaces: [],
    });
    assert.equal(comparison.agreed, false);
    assert.ok(comparison.differences.some((difference) => /would have refused/.test(difference)));
  });
});
