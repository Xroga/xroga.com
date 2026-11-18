import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getIntegrationLogo } from './integrationLogos';
import { getPublicIntegrationLogo, LOCAL_PUBLIC_INTEGRATION_LOGOS } from './publicIntegrationLogo';

test('use only actual checked-in Xroga brand SVGs as preferred local artwork', () => {
  assert.deepEqual(Object.keys(LOCAL_PUBLIC_INTEGRATION_LOGOS).sort(), [
    'anthropic', 'cursor', 'github', 'gitlab',
    'openai', 'replit', 'supabase', 'vercel',
  ]);
  for (const [id, path] of Object.entries(LOCAL_PUBLIC_INTEGRATION_LOGOS)) {
    assert.match(path, /^\/brand\/logos\/[a-z0-9-]+\.svg$/);
    assert.equal(getPublicIntegrationLogo(id, 'https://provider.example/logo.png'), path);
  }
});

test('unknown apps use the provided genuine logo and never a guessed brand URL', () => {
  assert.equal(getPublicIntegrationLogo('alpaca', 'https://cdn.example.org/alpaca.svg'), 'https://cdn.example.org/alpaca.svg');
  assert.equal(getPublicIntegrationLogo('truly-unknown-app'), undefined);
  assert.equal(getPublicIntegrationLogo('shopify'), getIntegrationLogo('shopify'));
  assert.equal(getPublicIntegrationLogo('shopify', 'https://example.org/shopify.png'), 'https://example.org/shopify.png');
  assert.equal(getPublicIntegrationLogo('alpaca', 'javascript:alert(1)'), undefined);
});
