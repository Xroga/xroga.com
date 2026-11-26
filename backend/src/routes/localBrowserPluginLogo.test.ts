import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safePluginLogo } from './localBrowserPlugins.js';

test('only a Composio logo over https is passed to the extension', () => {
  assert.equal(safePluginLogo('https://logos.composio.dev/api/googlesheets'), 'https://logos.composio.dev/api/googlesheets');
  for (const bad of [
    'http://logos.composio.dev/api/x', 'https://evil.example/logo.png', 'https://logos.composio.dev.evil.example/x',
    'https://user:pass@logos.composio.dev/x', 'https://logos.composio.dev:8443/x', 'javascript:alert(1)',
    'data:image/png;base64,AAAA', '//logos.composio.dev/x', '', 'x'.repeat(400), undefined, null, 42,
  ]) assert.equal(safePluginLogo(bad), undefined, String(bad).slice(0, 40));
});
