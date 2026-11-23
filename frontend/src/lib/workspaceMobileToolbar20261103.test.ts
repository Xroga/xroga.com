import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Project edits keeps its accessible name and shows only its visible icon', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.xv-workspace-header-tools \.xv-ws-launch span \{ display: none !important; \}/);
  assert.doesNotMatch(css, /\.xv-workspace-header-tools \.xv-ws-launch > span:not\(\.xv-animated-icon-host\) \{ display: none !important; \}/);
  assert.match(css, /\.xv-workspace-header-tools button > \.xv-animated-icon-host \{ display: inline-flex !important; \}/);
  const launcher = readFileSync(new URL('../components/terminal/WorkspaceLauncher.tsx', import.meta.url), 'utf8');
  assert.match(launcher, /aria-label=\{workspaceOpen \? 'Close project edits' : 'Open project edits'\}/);
  assert.doesNotMatch(launcher, /<span>Project edits<\/span>/);
});

test('workspace Share, Team and Skin are named, borderless icon actions at every width', () => {
  const people = readFileSync(new URL('../components/terminal/WorkspacePeopleControls.tsx', import.meta.url), 'utf8');
  const peopleCss = readFileSync(new URL('../components/terminal/WorkspacePeopleControls.module.css', import.meta.url), 'utf8');
  const skin = readFileSync(new URL('../components/terminal/TerminalSkinPicker.tsx', import.meta.url), 'utf8');
  const globalCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(people, /aria-label="Share conversation"/);
  assert.match(people, /aria-label="Team"/);
  assert.doesNotMatch(people, /<span>(Share|Team)<\/span>/);
  assert.match(peopleCss, /\.control \{[^}]*border:0;[^}]*background:transparent;/);
  assert.match(peopleCss, /\.control \{[^}]*width:30px;/);
  assert.doesNotMatch(skin, /<span className="xv-skin-trigger-label">Skin<\/span>/);
  assert.match(skin, /aria-label=\{\x60Terminal skin:/);
  assert.match(globalCss, /\.xv-workspace-header-tools \.xv-skin-trigger \{[^}]*border: 0 !important;[^}]*background: transparent !important;/);
  // Keyboard-visible focus remains; the resting controls alone are borderless.
  assert.match(peopleCss, /\.control:focus-visible/);
  assert.match(globalCss, /\.xv-workspace-header-tools \.xv-skin-trigger:focus-visible/);
});
