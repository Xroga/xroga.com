import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateMessageSuggestions } from './messageHelpers';

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
