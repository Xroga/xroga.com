import assert from 'node:assert/strict';
import test from 'node:test';

import { openGitHubOAuthPopup } from './githubConnect';

test('continues GitHub OAuth in the current tab after resolving the authorize URL', async () => {
  const order: string[] = [];
  const result = await openGitHubOAuthPopup({
    resolveUrl: async () => {
      order.push('resolve');
      return { url: 'https://github.com/login/oauth/authorize?state=test' };
    },
    navigateSameTab: (url) => order.push(`same-tab:${url}`),
  });

  assert.equal(result.opened, true);
  assert.equal(result.popup, null);
  assert.deepEqual(order, [
    'resolve',
    'same-tab:https://github.com/login/oauth/authorize?state=test',
  ]);
});

test('does not navigate when GitHub OAuth is not configured', async () => {
  const order: string[] = [];
  const result = await openGitHubOAuthPopup({
    resolveUrl: async () => {
      order.push('resolve');
      return { url: '' };
    },
    navigateSameTab: (url) => order.push(`same-tab:${url}`),
  });

  assert.equal(result.opened, false);
  assert.equal(result.popup, null);
  assert.equal(result.error, 'GitHub OAuth is not configured');
  assert.deepEqual(order, ['resolve']);
});

test('reports URL resolution failures without navigating', async () => {
  const order: string[] = [];
  const result = await openGitHubOAuthPopup({
    resolveUrl: async () => {
      order.push('resolve');
      throw new Error('API unavailable');
    },
    navigateSameTab: () => order.push('same-tab'),
  });

  assert.equal(result.opened, false);
  assert.equal(result.error, 'API unavailable');
  assert.deepEqual(order, ['resolve']);
});
