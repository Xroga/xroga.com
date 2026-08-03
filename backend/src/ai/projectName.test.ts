import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectNameFromPrompt } from './pipeline.js';

/**
 * Cover for the project name shown in production.
 *
 * Runs `dca6799a` and `85681d10` both shipped under the name
 *
 *   [Previous Conversation For Context
 *
 * which is the first four words of the conversation-memory wrapper the terminal puts
 * around every prompt before sending it. It appeared as the project title in the
 * terminal header and throughout the build report, and made a working build look like
 * a corrupted one.
 */

const WRAPPED = `[Previous conversation for context — refer when user asks about earlier messages]
user: build a portfolio site with a dark theme
assistant: Shipped Portfolio Site.

[Current message]
build a landing page of dental clinic`;

test('reproduces the run: the memory wrapper never becomes the project name', () => {
  const name = projectNameFromPrompt(WRAPPED);
  assert.doesNotMatch(name, /Previous|Conversation|Context/i);
});

test('the name comes from the current message, not the conversation history', () => {
  assert.equal(projectNameFromPrompt(WRAPPED), 'Landing Page Of Dental');
});

test('a plain prompt is unchanged by the stripping', () => {
  assert.equal(projectNameFromPrompt('build a portfolio site with a dark theme'), 'Portfolio Site With A');
  assert.equal(projectNameFromPrompt('create an invoicing app'), 'Invoicing App');
});

test('a bracketed prefix without a current-message marker is still stripped', () => {
  assert.equal(projectNameFromPrompt('[context] build a dental clinic site'), 'Dental Clinic Site');
});

test('a prompt that is only a wrapper falls back rather than naming nothing', () => {
  assert.equal(projectNameFromPrompt('[Current message]'), 'Xroga Build');
  assert.equal(projectNameFromPrompt(''), 'Xroga Build');
});

test('brackets inside the real request are kept', () => {
  // Only a leading bracketed block is a wrapper; brackets mid-sentence are content.
  assert.match(projectNameFromPrompt('build a site for [Acme] corp'), /Site For/);
});

test('the name stays short enough to display', () => {
  const long = `build ${'a very detailed enterprise '.repeat(20)}dashboard`;
  assert.ok(projectNameFromPrompt(long).length <= 48);
});
