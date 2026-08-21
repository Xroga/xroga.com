import assert from 'node:assert/strict';
import test from 'node:test';

import { openGitHubOAuthPopup } from './githubConnect';

function popupStub(order: string[]) {
  return {
    closed: false,
    close() {
      order.push('close');
    },
    focus() {
      order.push('focus');
    },
    location: {
      set href(value: string) {
        order.push(`navigate-popup:${value}`);
      },
      get href() {
        return '';
      },
    },
  };
}

test('opens the GitHub popup before awaiting the authorize URL', async () => {
  const order: string[] = [];
  const result = await openGitHubOAuthPopup({
    openWindow: () => {
      order.push('open');
      return popupStub(order);
    },
    resolveUrl: async () => {
      order.push('resolve');
      return { url: 'https://github.com/login/oauth/authorize?state=test' };
    },
    navigateSameTab: () => order.push('same-tab'),
  });

  assert.equal(result.opened, true);
  assert.ok(result.popup);
  assert.deepEqual(order, [
    'open',
    'resolve',
    'navigate-popup:https://github.com/login/oauth/authorize?state=test',
    'focus',
  ]);
});

test('falls back to same-tab OAuth when the browser blocks the popup', async () => {
  const order: string[] = [];
  const result = await openGitHubOAuthPopup({
    openWindow: () => {
      order.push('open');
      return null;
    },
    resolveUrl: async () => {
      order.push('resolve');
      return { url: 'https://github.com/login/oauth/authorize?state=test' };
    },
    navigateSameTab: (url) => order.push(`same-tab:${url}`),
  });

  assert.equal(result.opened, true);
  assert.equal(result.popup, null);
  assert.deepEqual(order, [
    'open',
    'resolve',
    'same-tab:https://github.com/login/oauth/authorize?state=test',
  ]);
});

test('closes the reserved popup when URL resolution fails', async () => {
  const order: string[] = [];
  const result = await openGitHubOAuthPopup({
    openWindow: () => {
      order.push('open');
      return popupStub(order);
    },
    resolveUrl: async () => {
      order.push('resolve');
      throw new Error('API unavailable');
    },
    navigateSameTab: () => order.push('same-tab'),
  });

  assert.equal(result.opened, false);
  assert.equal(result.error, 'API unavailable');
  assert.deepEqual(order, ['open', 'resolve', 'close']);
});
