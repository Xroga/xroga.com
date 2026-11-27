import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateMessageSuggestions } from './messageHelpers';
import { LEGACY_WEB_SEARCH_RETRY, WEB_SEARCH_NOT_RUN } from './connectedAppResult';

test('an empty failed turn does not suggest explaining or acting on a nonexistent answer', () => {
  for (const answer of ['', ' \n\t']) {
    for (const prompt of ['Compare two plans', 'Build a website', 'Research solar energy']) {
      const suggestions = generateMessageSuggestions(prompt, answer);
      assert.deepEqual(suggestions.followUps, []);
      assert.deepEqual(suggestions.refine, []);
      assert.deepEqual(suggestions.deploy, []);
    }
  }
});

test('saved research without an answer has no unrelated project follow-ups', () => {
  const review = '[Review action](/dashboard/actions/confirm/221fe7f9-f0dd-4b12-b03a-bcb57a13f655)';
  for (const answer of [WEB_SEARCH_NOT_RUN, LEGACY_WEB_SEARCH_RETRY, `Review the request before Xroga searches the web: ${review}`,
    `Review the exact research request before it is sent: ${review}. No live evidence has been retrieved.`]) {
    const suggestions = generateMessageSuggestions('Search public sources and present a comparison table.', answer);
    assert.deepEqual(suggestions.followUps, []);
    assert.deepEqual(suggestions.refine, []);
    assert.deepEqual(suggestions.deploy, []);
  }
});

test('suggestions give two answer follow-ups and two relevant Xroga actions', () => {
  const code = generateMessageSuggestions('Build a landing page', 'I built a responsive landing page.');
  assert.equal(code.followUps.length, 2);
  assert.equal(code.refine.length, 2);
  assert.match(code.refine[1], /tests/i);
  const research = generateMessageSuggestions('Research solar energy', 'These sources discuss solar panels.');
  assert.match(research.followUps[0], /claims/i);
  assert.match(research.refine[0], /Search the web/i);
  const chat = generateMessageSuggestions('Hello', 'Hello!');
  assert.equal(chat.followUps.length + chat.refine.length, 4);
  assert.doesNotMatch([...chat.followUps, ...chat.refine].join(' '), /Electron|Expo|Chrome extension/);
});
