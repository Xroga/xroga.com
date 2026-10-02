import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CSS = read('../app/globals.css');
const UIVERSE = read('../styles/uiverse.css');
const COMPANION = read('../styles/companion.css');
const APP_SHELL = read('../components/layout/AppShell.tsx');
const PAGE_FRAME = read('../components/layout/PageFullscreenFrame.tsx');
const DASHBOARD = read('../components/dashboard/DashboardView.tsx');

test('workspace uses a dedicated content gutter instead of widening the sidebar gutter', () => {
  assert.match(UIVERSE, /--xv-content-gutter-inline:\s*clamp\(24px, 2\.25vw, 40px\)/);
  assert.match(
    UIVERSE,
    /\.xv-app-stage:not\(\.xv-app-stage--fullscreen\)[\s\S]*padding:\s*\n\s*var\(--xv-content-gutter-block\)\s*\n\s*var\(--xv-content-gutter-inline\)\s*!important/,
  );
  assert.match(UIVERSE, /--xv-sidebar-inset:\s*var\(--xv-app-gutter\)/);
});

test('workspace is one centered rounded window with restrained elevation', () => {
  assert.match(UIVERSE, /\.xv-workspace-shell\s*\{[\s\S]*width:\s*min\(100%, var\(--xv-app-canvas-max\)\)/);
  assert.match(UIVERSE, /\.xv-workspace-shell\s*\{[\s\S]*border-radius:\s*var\(--xv-app-radius\)\s*!important/);
  assert.match(CSS, /\.xv-workspace-shell\.xv-workspace-shell\.xv-workspace-shell\s*\{\s*box-shadow:\s*var\(--xv-app-window-shadow\)\s*!important/);
  assert.match(UIVERSE, /\.xv-workspace-header\s*\{[\s\S]*background:\s*transparent\s*!important/);
});

test('traffic lights and workspace controls are compact integrated chrome', () => {
  assert.match(UIVERSE, /\.xv-term-lights i\s*\{[\s\S]*width:\s*7px\s*!important[\s\S]*height:\s*7px\s*!important/);
  assert.match(UIVERSE, /\.xv-ws-launch,[\s\S]*\.xv-page-fullscreen-toggle\s*\{[\s\S]*border:\s*0\s*!important/);
  assert.match(UIVERSE, /\.xv-ws-tab\.is-active,[\s\S]*\.xv-ws-device\.is-active\s*\{[\s\S]*background:/);
});

test('dashboard and settings routes share one app surface', () => {
  assert.match(APP_SHELL, /const isFramedAppPage\s*=/);
  assert.match(APP_SHELL, /pathname\.startsWith\('\/dashboard\/'\)/);
  assert.match(APP_SHELL, /pathname\.startsWith\('\/settings\/'\)/);
  assert.match(APP_SHELL, /<div className="xv-page-stage">[\s\S]*<div className="xv-page-surface">/);
  assert.match(UIVERSE, /\.xv-page-surface\s*\{[\s\S]*border-radius:\s*var\(--xv-app-radius\)/);
});

test('page fullscreen control lives inside the page surface in both states', () => {
  assert.match(PAGE_FRAME, /<div className="xv-page-frame-toolbar">\{toggle\}<\/div>/);
  assert.match(
    PAGE_FRAME,
    /xv-page-fullscreen-stage[\s\S]*xv-page-surface xv-page-surface--fullscreen[\s\S]*\{frame\}/,
  );
  assert.doesNotMatch(PAGE_FRAME, /flex justify-end mb-3 -mt-1/);
});

test('Smoky reuses the existing companion and moves into the measured desktop gutter', () => {
  assert.match(DASHBOARD, /--xv-shell-right/);
  assert.match(DASHBOARD, /--xv-shell-top/);
  assert.match(COMPANION, /@media \(min-width: 1440px\)[\s\S]*\.xv-companion-composer-anchor/);
  assert.match(COMPANION, /right:\s*max\(6px, calc\(\(var\(--xv-shell-right, 40px\) - 28px\) \/ 2\)\)/);
});
