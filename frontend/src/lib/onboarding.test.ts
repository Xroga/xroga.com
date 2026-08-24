import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ONBOARDING,
  normalizeOnboarding,
  resumeStep,
  serializeOnboarding,
  shouldRouteToOnboarding,
  preparingDescription,
  PROJECT_TYPES,
  ONBOARDING_ROLES,
  type OnboardingState,
} from './onboarding';

/**
 * Guards for post-signup onboarding.
 *
 * The riskiest thing here is not the cards — it is the routing. A predicate that is
 * wrong in one direction traps the whole userbase in a setup flow on their next
 * login; wrong in the other, a new account never sees it. Both are guarded, along
 * with the migration that decides which side existing accounts fall on.
 *
 * This file imports the module directly: `onboarding.ts` has no imports of its own,
 * so it resolves under `tsx --test` from the repo root where `@/` is not in effect.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SHELL = read('../app/(shell)/layout.tsx');
const PAGE = read('../app/onboarding/page.tsx');
const SIGNUP = read('../components/auth/SignupForm.tsx');
const MIGRATION = read('../../../supabase/migrations/20260824220000_onboarding_state.sql');
const FLOW = read('../components/onboarding/OnboardingFlow.tsx');
const CARD = read('../components/onboarding/IntegrationCard.tsx');
const ACTIONS = read('../components/terminal/MessageBubbleActions.tsx');

const state = (patch: Partial<OnboardingState> = {}): OnboardingState => ({
  ...DEFAULT_ONBOARDING,
  ...patch,
});

test('only unfinished accounts are routed to onboarding', () => {
  assert.equal(shouldRouteToOnboarding(state({ status: 'not_started' })), true);
  assert.equal(shouldRouteToOnboarding(state({ status: 'in_progress' })), true);
  assert.equal(shouldRouteToOnboarding(state({ status: 'completed' })), false);
  /*
   * Skipping is an answer, not an unfinished state. Re-asking would make the skip
   * button a lie — the reader dismissed it and would be shown it again next login.
   */
  assert.equal(shouldRouteToOnboarding(state({ status: 'skipped' })), false);
});

test('existing accounts are not swept into a flow meant for new signups', () => {
  // Without the backfill every profile predating the column reads `not_started`,
  // and the whole userbase is sent through onboarding on their next login.
  assert.match(MIGRATION, /update public\.profiles/, 'existing rows are not backfilled');
  assert.match(MIGRATION, /'status', 'completed'/, 'the backfill must mark them finished');
  assert.match(MIGRATION, /where onboarding = '\{\}'::jsonb/, 'the backfill must only touch untouched rows');
  // Recorded as inferred, so nobody later mistakes these for accounts that answered.
  assert.match(MIGRATION, /'backfilled', true/);
});

test('a half-finished account resumes where it left off', () => {
  assert.equal(resumeStep(state({ currentStep: 'vercel' })), 'vercel');
  assert.equal(resumeStep(state({ currentStep: 'build_type' })), 'build_type');
  /*
   * `complete` resumes at `preparing` rather than showing the summary directly: the
   * last card does its own work and morphs into the ready state, so landing on the
   * summary would report on work this session never did.
   */
  assert.equal(resumeStep(state({ currentStep: 'complete' })), 'preparing');
});

test('unrecognised stored state falls back rather than throwing', () => {
  // The shell reads this on every load. A row written by an older or newer bundle
  // must not be able to brick the app.
  assert.deepEqual(normalizeOnboarding(null), DEFAULT_ONBOARDING);
  assert.deepEqual(normalizeOnboarding('nonsense'), DEFAULT_ONBOARDING);
  assert.deepEqual(normalizeOnboarding([]), DEFAULT_ONBOARDING);
  assert.equal(normalizeOnboarding({ status: 'banana' }).status, 'not_started');
  assert.equal(normalizeOnboarding({ project_type: 'spaceship' }).projectType, null);
});

test('the stored shape round-trips', () => {
  const original = state({
    status: 'in_progress',
    currentStep: 'vercel',
    projectType: 'ai_app',
    role: 'founder',
    githubConnected: true,
    githubSkipped: false,
    startedAt: '2026-08-24T00:00:00.000Z',
  });
  assert.deepEqual(normalizeOnboarding(serializeOnboarding(original)), original);
});

test('every project type and role has a label and a line', () => {
  for (const type of PROJECT_TYPES) {
    const line = preparingDescription(type);
    assert.ok(line.length > 0 && line.endsWith('.'), `${type} has no preparing line`);
  }
  assert.ok(preparingDescription(null).length > 0, 'an unanswered project type still needs a line');
  assert.equal(new Set(ONBOARDING_ROLES).size, ONBOARDING_ROLES.length);
});

test('the shell sends unfinished accounts to onboarding without looping', () => {
  assert.match(SHELL, /shouldRouteToOnboarding\(normalizeOnboarding\(profile\.onboarding\)\)/);
  assert.match(SHELL, /redirect\('\/onboarding'\)/);
  /*
   * Guarded on the row existing. A profile that has not been provisioned yet would
   * otherwise read as `not_started`, redirect to onboarding, and — since onboarding
   * reads the same missing row — bounce straight back.
   */
  assert.match(SHELL, /if \(profile && shouldRouteToOnboarding/, 'a missing profile must not loop');
  // And the page itself refuses to re-ask an account that already answered.
  assert.match(PAGE, /if \(!shouldRouteToOnboarding\(state\)\) redirect\('\/workspace'\)/);
});

test('signup lands new accounts in setup, without ignoring an explicit destination', () => {
  assert.match(SIGNUP, /: '\/onboarding';/, 'a new signup should default to setup');
  // An explicit `next` still wins — a shared link should survive signing up.
  assert.match(SIGNUP, /requestedNext\?\.startsWith\('\/'\)/);
});

test('connection state comes from the providers, never from a timer', () => {
  const flow = FLOW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(flow, /api\.github\.status\(\)/, 'GitHub state must be read from GitHub');
  assert.match(flow, /api\.vercel\.status\(\)/, 'Vercel state must be read from Vercel');
  // The card must not be able to declare success on its own.
  const card = CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(
    !/setPhase\('connected'\)[\s\S]{0,120}setTimeout/.test(card),
    'a timer must never flip the card to connected',
  );
  assert.match(card, /alreadyConnected/, 'the tick is driven by the provider status prop');
  // Reuses the app's real flows rather than a second implementation.
  assert.match(flow, /openGitHubOAuthPopup/);
  assert.match(flow, /openVercelOAuthPopup/);
});

test('only the card in front can move the flow on', () => {
  /*
   * Every card in the stack is mounted at once. Without this gate an integration that
   * was already connected fired its advance from behind the card the reader was
   * actually on: with Vercel connected from a previous session, opening onboarding
   * threw them from the first question to the preparing screen having answered
   * nothing. Observed as zero radio buttons on the page.
   */
  const card = CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(card, /if \(!active\) return;/, 'a card behind the front can advance the flow');
  const flow = FLOW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(flow, /active=\{step === 'github'\}/);
  assert.match(flow, /active=\{step === 'vercel'\}/);
});

test('a press cannot start two authorizes', () => {
  const card = CARD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(card, /if \(phase === 'connecting' \|\| phase === 'connected'\) return;/);
  assert.match(card, /disabled=\{connecting \|\| connected\}/);
});

test('skipping is offered without being dressed as a hazard', () => {
  const flow = FLOW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // No confirmation, no "are you sure" — skipping just advances.
  assert.ok(!/confirm\(/.test(flow), 'skipping must not raise a confirmation');
  assert.match(flow, /status: 'skipped'/, 'a global skip must be recorded');
  assert.match(flow, /githubSkipped: true/);
  assert.match(flow, /vercelSkipped: true/);
});

test('the assistant reply no longer offers to be edited', () => {
  const actions = ACTIONS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/onEdit/.test(actions), 'the edit affordance is back on assistant replies');
  assert.ok(!/Pencil/.test(actions), 'the edit glyph is still imported');
  // The user's own message keeps its actions; only the reply lost one.
  assert.match(actions, /role === 'user'/);
});
