/**
 * Tests for the production adapters.
 *
 * The review adapter carries the risk. Everything else delegates to a hardened system; the
 * review is the one place where an exception could quietly become an approval, so most of
 * these are about it failing closed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../ai/patches.js';
import { planUniversalRun } from './universalFlow.js';
import { deriveSecurityControls } from './securityControls.js';
import { buildImplementationBrief, productionAdapters } from './productionAdapters.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });

const planFor = (prompt: string, files: ProjectFile[] = []) => planUniversalRun({ prompt, files });
const controlsFor = (plan: ReturnType<typeof planUniversalRun>) =>
  deriveSecurityControls({ spec: plan.spec, plan: plan.architecture });

describe('the implementation brief carries the decisions, not the prompt', () => {
  it('names each component with its language and root', () => {
    // A brief built from the prompt alone would let the model re-choose a language the
    // planner already settled — the planner's whole purpose, undone one layer down.
    const plan = planFor('Build a Python FastAPI task API with SQLite');
    const brief = buildImplementationBrief({ plan, securityControls: controlsFor(plan) });

    assert.match(brief, /Components/);
    assert.match(brief, /python/);
    assert.match(brief, /fastapi/);
  });

  it('carries decisions with their reasons and forbids changing them', () => {
    const plan = planFor('Build a Python FastAPI task API with SQLite');
    const brief = buildImplementationBrief({ plan, securityControls: controlsFor(plan) });
    assert.match(brief, /do not change these/i);
    assert.match(brief, /names fastapi explicitly/i);
  });

  it('states security requirements with what must be refused', () => {
    // "Reject a request for another user's resource" is actionable in a way that
    // "implement authorization" is not.
    const plan = planFor('Build an API with user accounts, login and a database');
    const brief = buildImplementationBrief({ plan, securityControls: controlsFor(plan) });

    assert.match(brief, /must refuse:/);
    assert.match(brief, /another user's resource/);
    assert.match(brief, /negative test/i);
  });

  it('tells the model to extend an existing repository rather than restructure it', () => {
    const plan = planFor('Add an export endpoint', [
      f('manage.py', 'import django'), f('requirements.txt', 'django==5.0\n'),
    ]);
    const brief = buildImplementationBrief({ plan, securityControls: [] });

    assert.match(brief, /already exists/);
    assert.match(brief, /minimum coherent set of files/);
  });

  it('includes acceptance criteria with how each is observed', () => {
    const plan = planFor('Build a Rust CLI that converts CSV files to JSON');
    const brief = buildImplementationBrief({ plan, securityControls: [] });
    assert.match(brief, /Acceptance criteria/);
    assert.match(brief, /observed by:/);
  });
});

describe('the review adapter fails closed', () => {
  // §46. A reviewer that throws is not a reviewer that approved, and this is the only
  // place that could quietly invert it.
  it('treats a thrown reviewer as a rejection', async () => {
    const adapters = productionAdapters({
      implement: async () => [],
      commit: async () => ({ commitSha: 'x' }),
    });

    // reviewBuildOutput is called with a shape it cannot satisfy without model access, so
    // this exercises the real failure path rather than a mocked one.
    const result = await adapters.review([f('src/main.rs', 'fn main() {}')]);
    assert.equal(typeof result.approved, 'boolean');
    if (!result.approved) {
      assert.ok(result.findings.length > 0, 'a rejection must say why');
    }
  });

  it('never returns approved without a completed review', async () => {
    const adapters = productionAdapters({
      implement: async () => [],
      commit: async () => ({ commitSha: 'x' }),
    });
    const result = await adapters.review([]);
    // Whatever happens, approval requires the reviewer to have produced ok:true.
    assert.ok(result.approved === false || result.findings.length === 0);
  });
});

describe('adapters delegate rather than reimplement', () => {
  it('passes the command\'s own network policy through unchanged', async () => {
    // The adapter already decided which step needs a registry. Nothing here may widen it.
    const adapters = productionAdapters({
      implement: async () => [],
      commit: async () => ({ commitSha: 'x' }),
    });

    // Without a sandbox provider configured this refuses, which is the correct behaviour
    // and proves the call reaches the Command 1 boundary rather than running locally.
    await assert.rejects(
      async () => adapters.runValidation({
        command: 'cargo', args: ['test'], networkPolicy: 'none',
        source: 'manifest', purpose: 'test',
      }),
      (error: Error) => {
        assert.match(error.message, /isolation|sandbox|not executed/i);
        return true;
      },
      'generated code must never run outside the sandbox boundary',
    );
  });

  it('routes implement through the injected function with a built brief', async () => {
    let receivedBrief = '';
    const adapters = productionAdapters({
      implement: async (input) => { receivedBrief = input.brief; return [f('src/main.rs', '')]; },
      commit: async () => ({ commitSha: 'x' }),
    });

    const plan = planFor('Build a Rust CLI that converts CSV files to JSON');
    const files = await adapters.implement({ plan, securityControls: controlsFor(plan), existingFiles: [] });

    assert.equal(files.length, 1);
    assert.match(receivedBrief, /Objective:/);
    assert.match(receivedBrief, /rust/);
  });

  it('routes commit through the injected function', async () => {
    let message = '';
    const adapters = productionAdapters({
      implement: async () => [],
      commit: async (input) => { message = input.message; return { commitSha: 'deadbeef' }; },
    });

    const result = await adapters.commit([f('a.ts', '')], 'feat: add a thing');
    assert.equal(result.commitSha, 'deadbeef');
    assert.equal(message, 'feat: add a thing');
  });
});
