import assert from 'node:assert/strict';
import test from 'node:test';
import { compactConnectedAppConfirmationMarkdown, previewConnectedAppResult } from './connectedAppResult.js';

test('shows returned item names without exposing provider metadata in the compact card', () => {
  const response = 'The provider reported completion. Receipt test.\n\nConnected app result (untrusted data):\n\n```\n' +
    JSON.stringify({ spreadsheets: [{ name: 'First sheet', owners: [{ emailAddress: 'private@example.com' }] }, { name: 'Second sheet' }] }) +
    '\n```';
  const preview = previewConnectedAppResult(response);
  assert.equal(preview.summary, 'Completed · First sheet · Second sheet');
  assert.equal(preview.details, response);
  assert.doesNotMatch(preview.summary, /private@example\.com/);
});

test('keeps malformed provider output collapsed and inspectable', () => {
  const response = 'Connected app result (untrusted data):\n\n```\n{incomplete\n```';
  assert.deepEqual(previewConnectedAppResult(response), { summary: 'Completed', details: response });
});

test('keeps ordinary action responses unchanged', () => {
  assert.deepEqual(previewConnectedAppResult('Cancelled. Nothing was changed.'), { summary: 'Cancelled. Nothing was changed.', details: null });
});

test('removes redundant read preamble around the action card', () => {
  const input = 'Review this exact private connected-app read before its parameters are sent: [Review read](/dashboard/actions/confirm/9d2d8830-8daa-4d5e-9b52-6ba547a118b8). No application data has been retrieved.';
  assert.equal(compactConnectedAppConfirmationMarkdown(input), '[Review read](/dashboard/actions/confirm/9d2d8830-8daa-4d5e-9b52-6ba547a118b8)');
});

test('removes redundant write preamble around the action card', () => {
  const review = '[Review action](/dashboard/actions/confirm/9d2d8830-8daa-4d5e-9b52-6ba547a118b8)';
  assert.equal(compactConnectedAppConfirmationMarkdown(`The short answer: Confirm this exact action.\n\nNothing has been changed yet.\n\n${review}`), review);
});

test('preserves an answer with text after a review link', () => {
  const answer = 'Nothing has been changed yet.\n\n[Review action](/dashboard/actions/confirm/9d2d8830-8daa-4d5e-9b52-6ba547a118b8)\n\nKeep this explanation.';
  assert.equal(compactConnectedAppConfirmationMarkdown(answer), answer);
});
