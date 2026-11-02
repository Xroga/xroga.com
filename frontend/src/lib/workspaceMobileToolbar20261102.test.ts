import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('mobile toolbar hides labels without hiding animated icon hosts', () => {
  const globalCss = read('../app/globals.css');
  const peopleCss = read('../components/terminal/WorkspacePeopleControls.module.css');
  assert.match(globalCss, /\.xv-ws-launch > span:not\(\.xv-animated-icon-host\)/);
  assert.match(globalCss, /\.xv-ws-launch > \.xv-animated-icon-host \{ display: inline-flex !important; \}/);
  assert.match(peopleCss, /\.control>:global\(\.xv-animated-icon-host\) \{ display:inline-flex; \}/);
});
