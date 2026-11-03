import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('compact workspace toolbar hides labels but keeps every animated icon visible', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.xv-workspace-header-tools \.xv-ws-launch span \{ display: none !important; \}/);
  assert.match(css, /\.xv-workspace-header-tools \.xv-ws-launch > span:not\(\.xv-animated-icon-host\) \{ display: none !important; \}/);
  assert.match(css, /\.xv-workspace-header-tools button > \.xv-animated-icon-host \{ display: inline-flex !important; \}/);
});
