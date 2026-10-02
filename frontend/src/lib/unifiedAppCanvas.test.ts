import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CSS = read('../app/globals.css');
const UIVERSE = read('../styles/uiverse.css');
const COMPANION = read('../styles/companion.css');
const APP_SHELL = read('../components/layout/AppShell.tsx');
const PAGE_FRAME = read('../components/layout/PageFullscreenFrame.tsx');

test('workspace keeps the outside frame tight and moves breathing room inside', () => {
  assert.match(UIVERSE, /--xv-content-gutter-inline:\s*4px/);
  assert.match(UIVERSE, /--xv-content-gutter-block:\s*4px/);
  assert.match(
    UIVERSE,
    /\.xv-terminal-scroll\s*\{\s*padding-inline:\s*clamp\(24px, 2\.15vw, 36px\)\s*!important/,
  );
  assert.match(UIVERSE, /--xv-sidebar-inset:\s*var\(--xv-app-gutter\)/);
});

test('workspace is rounded without an outline and uses only restrained elevation', () => {
  assert.match(UIVERSE, /\.xv-workspace-shell\s*\{[\s\S]*border:\s*0\s*!important/);
  assert.match(UIVERSE, /\.xv-workspace-shell\s*\{[\s\S]*border-radius:\s*var\(--xv-app-radius\)\s*!important/);
  assert.match(
    CSS,
    /--xv-app-window-shadow:[\s\S]*0 5px 18px rgba\(0, 0, 0, 0\.10\)[\s\S]*0 1px 4px rgba\(0, 0, 0, 0\.06\)/,
  );
  assert.match(UIVERSE, /\.xv-workspace-header\s*\{[\s\S]*border-bottom:\s*0\s*!important/);
});

test('dashboard and settings no longer inherit the obsolete six-rem top gap', () => {
  assert.match(APP_SHELL, /isFramedAppPage[\s\S]*\? 'flex-1 min-h-0 overflow-hidden'/);
  const framed = APP_SHELL.slice(APP_SHELL.indexOf(': isFramedAppPage'), APP_SHELL.indexOf(': [', APP_SHELL.indexOf(': isFramedAppPage')));
  assert.doesNotMatch(framed, /xv-main-scroll-under-header/);
  assert.match(UIVERSE, /\.xv-page-surface\s*\{[\s\S]*border:\s*0;/);
});

test('page fullscreen control lives inside the page surface in both states', () => {
  assert.match(PAGE_FRAME, /<div className="xv-page-frame-toolbar">\{toggle\}<\/div>/);
  assert.match(
    PAGE_FRAME,
    /xv-page-fullscreen-stage[\s\S]*xv-page-surface xv-page-surface--fullscreen[\s\S]*\{frame\}/,
  );
});

test('Project edits is a rounded inset surface inside the workspace', () => {
  assert.match(
    UIVERSE,
    /\.xv-workspace-body\[data-workspace-open='true'\] \.xv-workspace-panel\s*\{[\s\S]*margin:\s*8px 8px 8px 4px/,
  );
  assert.match(
    UIVERSE,
    /\.xv-workspace-body\[data-workspace-open='true'\] \.xv-workspace-panel\s*\{[\s\S]*border-radius:\s*14px\s*!important/,
  );
  assert.match(
    UIVERSE,
    /\.xv-workspace-body\[data-workspace-open='true'\] \.xv-workspace-panel\s*\{[\s\S]*border:\s*0\s*!important/,
  );
});

test('Smoky stays attached to the composer inside the workspace', () => {
  assert.match(COMPANION, /\.xv-companion-composer-anchor\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(
    COMPANION,
    /body:not\(\.xv-terminal-fullscreen-active\)[\s\S]*\.xv-companion-composer-anchor\s*\{[^}]*position:\s*fixed/,
  );
});
