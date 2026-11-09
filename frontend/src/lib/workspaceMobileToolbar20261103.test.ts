import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('compact workspace toolbar hides labels but keeps every animated icon visible', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.xv-workspace-header-tools \.xv-ws-launch span \{ display: none !important; \}/);
  assert.match(css, /\.xv-workspace-header-tools \.xv-ws-launch > span:not\(\.xv-animated-icon-host\) \{ display: none !important; \}/);
  assert.match(css, /\.xv-workspace-header-tools button > \.xv-animated-icon-host \{ display: inline-flex !important; \}/);
});

test('workspace Share, Team and Skin are borderless desktop text actions and mobile icon actions', () => {
  const people = readFileSync(new URL('../components/terminal/WorkspacePeopleControls.tsx', import.meta.url), 'utf8');
  const peopleCss = readFileSync(new URL('../components/terminal/WorkspacePeopleControls.module.css', import.meta.url), 'utf8');
  const skin = readFileSync(new URL('../components/terminal/TerminalSkinPicker.tsx', import.meta.url), 'utf8');
  const globalCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(people, /aria-label="Share conversation"/);
  assert.match(people, /aria-label="Team"/);
  assert.match(people, /<span>Share<\/span>/);
  assert.match(people, /<span>Team<\/span>/);
  assert.match(peopleCss, /\.control \{[^}]*border:0;[^}]*background:transparent;/);
  assert.match(peopleCss, /@media\(max-width:1023px\)[\s\S]*?\.control>span \{ display:none; \}/);
  assert.match(skin, /<span className="xv-skin-trigger-label">Skin<\/span>/);
  assert.match(globalCss, /\.xv-workspace-header-tools \.xv-skin-trigger \{[^}]*border: 0 !important;[^}]*background: transparent !important;/);
  assert.match(globalCss, /@media \(min-width: 1024px\)[\s\S]*?\.xv-workspace-header-tools \.xv-skin-trigger-label \{ display: inline; \}/);
  assert.match(globalCss, /@media \(max-width: 1023px\)[\s\S]*?\.xv-workspace-header-tools \.xv-skin-trigger-label \{ display: none !important; \}/);
  // Keyboard-visible focus remains; the resting controls alone are borderless.
  assert.match(peopleCss, /\.control:focus-visible/);
  assert.match(globalCss, /\.xv-workspace-header-tools \.xv-skin-trigger:focus-visible/);
});
