import assert from 'node:assert/strict';
import test from 'node:test';

import { openVercelOAuthPopup } from './vercelConnect';

test('continues configured Vercel OAuth in the current tab', async () => {
  const order: string[] = [];
  const result = await openVercelOAuthPopup({
    resolveUrl: async () => {
      order.push('resolve');
      return { url: 'https://vercel.com/integrations/xroga/new', oauthConfigured: true };
    },
    navigateSameTab: (url) => order.push(`same-tab:${url}`),
  });

  assert.deepEqual(result, {
    opened: true,
    popup: false,
    oauthConfigured: true,
  });
  assert.deepEqual(order, [
    'resolve',
    'same-tab:https://vercel.com/integrations/xroga/new',
  ]);
});

test('does not navigate when Vercel OAuth is not configured', async () => {
  const order: string[] = [];
  const result = await openVercelOAuthPopup({
    resolveUrl: async () => {
      order.push('resolve');
      return { url: '', oauthConfigured: false };
    },
    navigateSameTab: (url) => order.push(`same-tab:${url}`),
  });

  assert.equal(result.opened, false);
  assert.equal(result.popup, false);
  assert.equal(result.oauthConfigured, false);
  assert.equal(result.goToIntegrations, true);
  assert.match(result.error ?? '', /temporarily unavailable|configure/i);
  assert.doesNotMatch(result.error ?? '', /paste|personal token/i);
  assert.deepEqual(order, ['resolve']);
});

test('classifies a missing Vercel OAuth session store', async () => {
  const result = await openVercelOAuthPopup({
    resolveUrl: async () => {
      throw new Error('Could not store OAuth session');
    },
  });

  assert.equal(result.opened, false);
  assert.equal(result.oauthConfigured, false);
  assert.equal(result.goToIntegrations, true);
  assert.match(result.error ?? '', /secure OAuth session/i);
  assert.doesNotMatch(result.error ?? '', /paste|personal token/i);
});
