/**
 * Tests for generated-product security controls.
 *
 * Two properties carry the weight. Relevance — a CSRF requirement on a Rust CLI is noise,
 * and a checklist nobody reads is worse than a short one somebody does. And negativity —
 * every control an attacker would target must carry a test that fails against a correct
 * implementation, because a positive test proves the feature works, not that the control
 * does.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { planArchitecture } from './architecturePlan.js';
import { synthesizeUniversalProductSpec } from './universalProductSpec.js';
import {
  asProductRequirements,
  compileSecurityTests,
  deriveSecurityControls,
  describeControls,
  securityRoutingRequirement,
} from './securityControls.js';

const controlsFor = (prompt: string) => {
  const spec = synthesizeUniversalProductSpec({ prompt });
  return deriveSecurityControls({ spec, plan: planArchitecture({ spec }) });
};
const ids = (prompt: string) => controlsFor(prompt).map((control) => control.id);

describe('only relevant controls are generated', () => {
  it('gives a Rust CLI process and path controls, not web ones', () => {
    // §43 forbids dumping every control into every product. Noise is how real findings get
    // ignored.
    const found = ids('Build a Rust CLI that converts CSV files to JSON');
    assert.ok(found.includes('sec:process-execution'));
    assert.ok(found.includes('sec:path-traversal'));
    assert.ok(!found.includes('sec:csrf'), 'a CLI has no browser session to forge');
    assert.ok(!found.includes('sec:output-encoding'), 'a CLI renders no HTML');
    assert.ok(!found.includes('sec:sql-injection'), 'this CLI has no database');
  });

  it('gives an authenticated API authorization and rate limiting', () => {
    const found = ids('Build a Python FastAPI task API with user accounts, login and a database');
    assert.ok(found.includes('sec:authorization'));
    assert.ok(found.includes('sec:input-validation'));
    assert.ok(found.includes('sec:sql-injection'));
    assert.ok(found.includes('sec:rate-limiting'));
  });

  it('adds session and CSRF controls only when a browser holds the session', () => {
    const withUi = ids('Build a web dashboard with user login and accounts');
    const apiOnly = ids('Build an API with user login and accounts, no frontend');

    assert.ok(withUi.includes('sec:csrf'));
    assert.ok(withUi.includes('sec:session-cookies'));
    assert.ok(!apiOnly.includes('sec:csrf'), 'no browser session, no CSRF surface');
  });

  it('adds tenant isolation only for a multi-tenant product', () => {
    assert.ok(ids('Build a multi-tenant API where each organisation has its own data and a database').includes('sec:tenant-isolation'));
    assert.ok(!ids('Build a single-user note-taking CLI').includes('sec:tenant-isolation'));
  });

  it('adds upload and webhook controls only when those exist', () => {
    assert.ok(ids('Build an API that accepts image uploads and stores them').includes('sec:upload-validation'));
    assert.ok(ids('Build an API that receives Stripe webhooks').includes('sec:webhook-signature'));
    assert.ok(!ids('Build a Rust CLI for converting files').includes('sec:webhook-signature'));
  });

  it('adds the AI boundary only when a model is involved', () => {
    assert.ok(ids('Build an API that uses an LLM to summarise documents').includes('sec:ai-boundary'));
    assert.ok(!ids('Build a Go service with a background worker').includes('sec:ai-boundary'));
  });

  it('adds chain safety for on-chain products', () => {
    const found = ids('Build a Solidity smart contract with a web client');
    assert.ok(found.includes('sec:chain-safety'));
  });

  it('always requires no hardcoded secrets, because every product has configuration', () => {
    for (const prompt of [
      'Build a Rust CLI for converting files',
      'Build a Terraform infrastructure module',
      'Build a Python package with no server',
    ]) {
      assert.ok(deriveSecurityControls({
        spec: synthesizeUniversalProductSpec({ prompt }),
        plan: planArchitecture({ spec: synthesizeUniversalProductSpec({ prompt }) }),
      }).some((control) => control.id === 'sec:no-hardcoded-secrets'), prompt);
    }
  });

  it('keeps the list short enough to be read', () => {
    // A checklist of forty items is a checklist nobody reads.
    const found = controlsFor('Build a Rust CLI that converts CSV files to JSON');
    assert.ok(found.length <= 6, `a CLI produced ${found.length} controls`);
  });
});

describe('every control names why it applies and how to check it', () => {
  it('records the trigger rather than leaving it implicit', () => {
    for (const control of controlsFor('Build a web dashboard with login and a database')) {
      assert.ok(control.appliesBecause.length > 0, `${control.id} has no reason`);
      assert.ok(control.verification.length > 0, `${control.id} has no verification`);
    }
  });

  it('orders critical controls first', () => {
    const severities = controlsFor('Build a multi-tenant API with login, uploads and a database')
      .map((control) => control.severity);
    const firstNonCritical = severities.indexOf('high');
    if (firstNonCritical !== -1) {
      assert.ok(!severities.slice(firstNonCritical).includes('critical'), 'critical controls must come first');
    }
  });
});

describe('negative tests are what prove a control exists', () => {
  it('gives every attacker-facing control a test that must fail', () => {
    // A positive test proves the feature works. Only a negative test proves the control
    // does — "authorized users can read their data" passes when everyone can.
    const controls = controlsFor('Build a multi-tenant API with login, uploads, webhooks and a database');
    const critical = controls.filter((control) => control.severity === 'critical');

    assert.ok(critical.length > 0);
    for (const control of critical) {
      assert.ok(control.negativeTest, `${control.id} is critical and has no negative test`);
    }
  });

  it('marks negative tests as scenarios that must not succeed', () => {
    const tests = compileSecurityTests(controlsFor('Build an API with login and a database'));
    const negative = tests.filter((test) => test.kind === 'negative');

    assert.ok(negative.length > 0);
    assert.ok(negative.every((test) => test.mustFailAgainstCorrectImplementation));
    assert.ok(tests.filter((test) => test.kind === 'positive').every((test) => !test.mustFailAgainstCorrectImplementation));
  });

  it('states the authorization negative test in the form that catches the real bug', () => {
    // Authentication without per-resource authorization is the most common serious flaw in
    // generated code, and the happy path never reveals it.
    const control = controlsFor('Build an API with user accounts and a database')
      .find((entry) => entry.id === 'sec:authorization')!;
    assert.match(control.negativeTest!, /another user's resource/);
    assert.match(control.negativeTest!, /403 or 404/);
  });

  it('states the SQL injection test as a literal-storage assertion', () => {
    const control = controlsFor('Build an API that stores tasks in a database')
      .find((entry) => entry.id === 'sec:sql-injection')!;
    assert.match(control.negativeTest!, /DROP TABLE/);
    assert.match(control.negativeTest!, /literal text/);
  });
});

describe('controls become requirements and routing constraints', () => {
  it('converts controls into spec requirements', () => {
    const requirements = asProductRequirements(controlsFor('Build an API with login and a database'));
    assert.ok(requirements.length > 0);
    assert.ok(requirements.every((requirement) => requirement.statement.length > 0 && requirement.id.startsWith('sec:')));
  });

  it('requires a measured reviewer when specialist controls apply', () => {
    const requirement = securityRoutingRequirement(controlsFor('Build a multi-tenant API with login and a database'));
    assert.equal(requirement.requiresMeasuredReviewer, true);
    assert.ok(requirement.criticalCount > 0);
    assert.match(requirement.reason, /refused rather than routed to an unevaluated one/);
  });

  it('does not demand specialist review where nothing warrants it', () => {
    const controls = controlsFor('Build a Python package with no server')
      .filter((control) => control.requiresSecurityReview);
    if (!controls.length) {
      assert.equal(securityRoutingRequirement(controlsFor('Build a Python package with no server')).requiresMeasuredReviewer, false);
    }
  });

  it('describes controls readably, including what must be refused', () => {
    const description = describeControls(controlsFor('Build an API with login and a database'));
    assert.match(description, /security control\(s\) apply/);
    assert.match(description, /because:/);
    assert.match(description, /must refuse:/);
  });

  it('says so plainly when nothing applies', () => {
    assert.match(describeControls([]), /No security controls apply/);
  });
});
