import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeVercelAuthFailure,
  describeVercelDeployFailure,
  isVercelAuthFailure,
} from './vercelAuthError.js';

/**
 * Cover for run `85681d10`, "build a landing page of dental clinic".
 *
 * The code was generated and the GitHub push succeeded. The reason nothing went live
 * was handed to the user as:
 *
 *   Vercel deploy failed: Vercel: Vercel deploy failed: 403
 *   {"error":{"code":"forbidden","message":"Not authorized","invalidToken":true}}
 *
 * A raw API blob, a prefix repeated three times, and the one actionable fact —
 * `invalidToken: true`, meaning the stored authorization is dead — buried inside it.
 */

const PRODUCTION_ERROR =
  'Vercel: Vercel deploy failed: 403 {"error":{"code":"forbidden","message":"Not authorized","invalidToken":true}}';

test('reproduces the run: the production error is recognised as an auth failure', () => {
  assert.equal(isVercelAuthFailure(new Error(PRODUCTION_ERROR)), true);
});

test('the invalidToken marker alone is enough', () => {
  // Detection keys on the shape of the failure, not on Vercel's wording, which is
  // theirs to change.
  assert.equal(isVercelAuthFailure('{"invalidToken":true}'), true);
});

test('an auth status with auth wording is enough', () => {
  assert.equal(isVercelAuthFailure('Vercel deploy failed: 401 Unauthorized'), true);
  assert.equal(isVercelAuthFailure('Vercel deploy failed: 403 Forbidden'), true);
});

test('a real build failure is not mistaken for an auth failure', () => {
  // Misclassifying this would tell a user to reconnect Vercel over a code error.
  for (const message of [
    'Vercel deploy failed: 400 Bad Request — invalid project settings',
    'Vercel nextjs deploy failed: 500 Internal Server Error',
    'Vercel deploy failed: 429 rate limited',
    'Build failed: Module not found: Cannot resolve "./Hero"',
  ]) {
    assert.equal(isVercelAuthFailure(message), false, message);
  }
});

test('a 403 without auth wording is not assumed to be a token problem', () => {
  assert.equal(isVercelAuthFailure('Vercel deploy failed: 403 deployment limit reached'), false);
});

test('the auth message gives exactly one action and does not print the blob', () => {
  const message = describeVercelDeployFailure(new Error(PRODUCTION_ERROR));
  assert.match(message, /Reconnect Vercel/i);
  assert.doesNotMatch(message, /invalidToken|forbidden|\{|\}|403/);
});

test('the auth message says the code is safe, and where it is', () => {
  // On this run the push had already succeeded. "Deploy failed" with no other context
  // reads as "your work is gone".
  const message = describeVercelAuthFailure({ githubRepoName: 'Xroga/portfolio' });
  assert.match(message, /Xroga\/portfolio/);
  assert.match(message, /safe/i);
});

test('with no repository it does not claim the code was pushed', () => {
  const message = describeVercelAuthFailure({});
  assert.doesNotMatch(message, /pushed to/i);
});

test('it never blames the user’s code for an authorization failure', () => {
  const message = describeVercelDeployFailure(new Error(PRODUCTION_ERROR));
  assert.doesNotMatch(message, /error in your|invalid code|build error|fix your/i);
});

test('a non-auth failure keeps its detail, with the duplicated prefix collapsed', () => {
  const message = describeVercelDeployFailure(
    new Error('Vercel: Vercel deploy failed: Vercel deploy failed: 400 invalid project settings'),
  );
  assert.match(message, /invalid project settings/);
  assert.equal(message.match(/deploy failed/gi)?.length, 1);
});

test('an empty error still produces a readable line', () => {
  assert.match(describeVercelDeployFailure(new Error('')), /no detail returned/);
  assert.match(describeVercelDeployFailure(null), /no detail returned/);
});

test('a very long response body is trimmed', () => {
  const message = describeVercelDeployFailure(new Error(`400 ${'x'.repeat(2000)}`));
  assert.ok(message.length < 300, `message was ${message.length} characters`);
});
