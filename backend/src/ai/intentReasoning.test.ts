/**
 * Tests for outcome-first intent reasoning and the claim-gated evidence record.
 *
 * The two properties worth defending: a request phrased without any of the usual verbs
 * still produces the right architecture, and a claim the evidence does not support is
 * withheld rather than emitted.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFinalEvidenceRecord,
  claimIsSupported,
  decideArchitecture,
  mayBeCalledSuccess,
  readIntent,
  type RecordEvidence,
} from './intentReasoning.js';

const evidence = (kind: string, ok = true, detail = kind): RecordEvidence => ({ kind, ok, detail });

const GENERATED = evidence('files_written');
const TESTED = evidence('test_run');
const COMMITTED = evidence('commit');
const DEPLOYED = evidence('deployment');
const LIVE = evidence('production_check');

describe('reading the outcome rather than the verb', () => {
  it('understands a request that names no action at all', () => {
    // Contains no "build", "create", or "make" — keyword classification saw nothing here.
    const reading = readIntent('I need somewhere my customers can pay me for consulting hours');
    assert.equal(reading.outcome, 'software_running_somewhere');
    assert.ok(reading.capabilities.includes('payments'));
    assert.equal(reading.audience, 'the_public');
  });

  it('infers the invisible half of a feature the user only half-described', () => {
    const reading = readIntent('customers should be able to pay for a booking');
    // The user said nothing about accounts or a database. Both are required anyway.
    assert.ok(reading.capabilities.includes('user_accounts'), 'payments needs to know who paid');
    assert.ok(reading.capabilities.includes('persistent_storage'), 'payments needs to be remembered');
    assert.ok(reading.reasoning.some((r) => /implied by what was asked for/i.test(r)));
  });

  it('separates two requests that share a verb but not a product', () => {
    const blog = readIntent('build me a blog where I can post articles');
    const shop = readIntent('build me a shop where people can buy my prints and pay by card');

    assert.notDeepEqual(blog.capabilities, shop.capabilities, 'same verb must not mean same product');
    assert.ok(shop.capabilities.includes('payments'));
    assert.ok(!blog.capabilities.includes('payments'));
  });

  it('tells a repair apart from a new build', () => {
    const reading = readIntent('the signup page stopped working after yesterday');
    assert.equal(reading.outcome, 'something_broken_working_again');
  });

  it('tells a change to existing software apart from a new build', () => {
    const reading = readIntent('add a dark mode toggle to my app');
    assert.equal(reading.outcome, 'existing_software_changed');
  });

  it('recognises recurring work without the word "cron"', () => {
    const reading = readIntent('every morning send me a summary of new orders');
    assert.equal(reading.outcome, 'work_happening_without_them');
    assert.ok(reading.capabilities.includes('scheduled_work'));
  });

  it('honours a stack the user actually named', () => {
    const reading = readIntent('build a dashboard in SvelteKit with Supabase');
    assert.ok(reading.requestedStack.includes('svelte'));
    assert.ok(reading.requestedStack.includes('supabase'));
  });

  it('says it is underspecified rather than guessing a product', () => {
    const reading = readIntent('hey');
    assert.equal(reading.underspecified, true);
    assert.ok(reading.reasoning.some((r) => /rather than guessing/i.test(r)));
  });

  it('handles an empty request without inventing an outcome', () => {
    const reading = readIntent('   ');
    assert.equal(reading.underspecified, true);
    assert.deepEqual(reading.capabilities, []);
  });

  it('distinguishes a private tool from a public product', () => {
    assert.equal(readIntent('a little tracker just for me').audience, 'just_them');
    assert.equal(readIntent('somewhere our team can log expenses').audience, 'their_team');
    assert.equal(readIntent('a site where anyone can browse listings').audience, 'the_public');
  });
});

describe('architecture follows the capabilities, not a catalogue', () => {
  it('requires a backend when the capabilities require one', () => {
    const decision = decideArchitecture(readIntent('let customers pay for a subscription'));
    assert.equal(decision.needsBackend, true);
    assert.equal(decision.needsDatabase, true);
    assert.equal(decision.needsAuth, true);
  });

  it('does not add a backend to something that does not need one', () => {
    const decision = decideArchitecture(readIntent('a one page site describing my band, no framework'));
    assert.equal(decision.needsBackend, false);
    assert.equal(decision.needsDatabase, false);
  });

  it('picks the scaffold last and calls it a hint', () => {
    const decision = decideArchitecture(readIntent('build a marketplace where sellers list items and buyers pay'));
    assert.ok(decision.scaffoldHint, 'a starting point is fine');
    // The capabilities must not have come from the scaffold — the scaffold came last.
    assert.equal(decision.needsAuth, true);
    assert.ok(
      decision.reasoning.some((r) => /accelerator|asked for it/i.test(r)),
      'the scaffold must be described as a starting point',
    );
  });

  it('gives two different products two different architectures', () => {
    const marketplace = decideArchitecture(readIntent('a marketplace where people buy and sell used bikes'));
    const brochure = decideArchitecture(readIntent('a plain html page with my opening hours'));
    assert.notEqual(marketplace.needsBackend, brochure.needsBackend);
    assert.notEqual(marketplace.shape, brochure.shape);
  });

  it('starts from the framework the user named instead of its own default', () => {
    const decision = decideArchitecture(readIntent('build a store with payments using Remix'));
    assert.equal(decision.scaffoldHint, 'remix');
  });

  it('does not claim a build when the request was a question', () => {
    const decision = decideArchitecture(readIntent('what is the difference between REST and GraphQL'));
    assert.equal(decision.shape, 'an answer, not a build');
  });
});

describe('the final record claims only what the evidence supports', () => {
  it('refuses to claim a deployment that has no deployment evidence', () => {
    const record = buildFinalEvidenceRecord({
      intendedClaim: 'deployed',
      evidence: [GENERATED, TESTED, COMMITTED],
    });
    assert.equal(record.claim, 'written_to_repository');
    assert.deepEqual(record.withheld.map((w) => w.claim), ['deployed']);
    assert.match(record.withheld[0].reason, /No deployment evidence/i);
  });

  it('refuses to claim live when it only deployed', () => {
    const record = buildFinalEvidenceRecord({
      intendedClaim: 'live_and_working',
      evidence: [GENERATED, TESTED, COMMITTED, DEPLOYED],
    });
    assert.equal(record.claim, 'deployed');
    assert.deepEqual(record.withheld.map((w) => w.claim), ['live_and_working']);
  });

  it('claims the full outcome when every step really happened', () => {
    const record = buildFinalEvidenceRecord({
      intendedClaim: 'live_and_working',
      evidence: [GENERATED, TESTED, COMMITTED, DEPLOYED, LIVE],
    });
    assert.equal(record.claim, 'live_and_working');
    assert.deepEqual(record.withheld, []);
    assert.equal(record.state, 'production_verified');
  });

  it('will not let a later claim stand on a skipped earlier one', () => {
    // A deployment record for code that was never committed. The gap is the point.
    const record = buildFinalEvidenceRecord({
      intendedClaim: 'deployed',
      evidence: [GENERATED, DEPLOYED],
    });
    assert.notEqual(record.claim, 'deployed', 'a deployment of uncommitted code is not a deployment');
    assert.equal(record.claim, 'code_generated');
  });

  it('treats a failed evidence item as no evidence', () => {
    const record = buildFinalEvidenceRecord({
      intendedClaim: 'locally_verified',
      evidence: [GENERATED, evidence('test_run', false, 'tests failed')],
    });
    assert.equal(record.claim, 'code_generated');
  });

  it('treats a non-boolean ok as not a pass', () => {
    const record = buildFinalEvidenceRecord({
      intendedClaim: 'locally_verified',
      evidence: [GENERATED, { kind: 'test_run', detail: 'maybe', ok: 'true' as unknown as boolean }],
    });
    assert.equal(record.claim, 'code_generated', 'only an explicit true counts');
  });

  it('claims nothing when there is nothing to claim', () => {
    const record = buildFinalEvidenceRecord({ intendedClaim: 'live_and_working', evidence: [] });
    assert.equal(record.claim, 'nothing_produced');
    assert.equal(record.state, 'failed');
    assert.match(record.summary, /no outcome is claimed/i);
    assert.equal(record.withheld.length, 5, 'every step of the intended claim must be accounted for');
  });

  it('says what is outstanding instead of quietly reporting a lesser success', () => {
    const record = buildFinalEvidenceRecord({
      intendedClaim: 'live_and_working',
      evidence: [GENERATED, TESTED, COMMITTED],
    });
    assert.ok(record.outstanding.length >= 2);
    assert.match(record.summary, /did not happen/i);
  });

  it('ignores evidence of the wrong kind for the claim', () => {
    const record = buildFinalEvidenceRecord({
      intendedClaim: 'written_to_repository',
      evidence: [GENERATED, evidence('screenshot'), evidence('preview')],
    });
    assert.equal(record.claim, 'code_generated');
  });
});

describe('guarding the sentence shown to the user', () => {
  const generatedOnly = buildFinalEvidenceRecord({
    intendedClaim: 'live_and_working',
    evidence: [GENERATED],
  });

  it('catches "live" from a run that only generated files', () => {
    const verdict = claimIsSupported('Your app is live!', generatedOnly);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.overclaim, 'live_and_working');
  });

  it('catches "deployed" and "pushed" from the same run', () => {
    assert.equal(claimIsSupported('Deployed successfully.', generatedOnly).ok, false);
    assert.equal(claimIsSupported('I pushed it to your repository.', generatedOnly).ok, false);
  });

  it('catches "verified" when nothing was verified', () => {
    assert.equal(claimIsSupported('All tests passing.', generatedOnly).ok, false);
  });

  it('offers the honest sentence as the correction', () => {
    const verdict = claimIsSupported('It is live.', generatedOnly);
    assert.equal(verdict.ok === false && verdict.correction, generatedOnly.summary);
  });

  it('allows a sentence the evidence does support', () => {
    const full = buildFinalEvidenceRecord({
      intendedClaim: 'live_and_working',
      evidence: [GENERATED, TESTED, COMMITTED, DEPLOYED, LIVE],
    });
    assert.equal(claimIsSupported('It is deployed and live.', full).ok, true);
  });

  it('allows a sentence that claims nothing', () => {
    assert.equal(claimIsSupported('Here is what I built.', generatedOnly).ok, true);
  });
});

describe('success vocabulary stays anchored to the lifecycle', () => {
  it('accepts only real success states', () => {
    for (const state of ['verified', 'repository_written', 'deployed', 'production_verified']) {
      assert.equal(mayBeCalledSuccess(state), true);
    }
  });

  it('refuses the words that used to stand in for success', () => {
    for (const state of ['generated_unverified', 'generated', 'accepted', 'preview available', 'testing', '']) {
      assert.equal(mayBeCalledSuccess(state), false, `${state} must not read as success`);
    }
  });
});
