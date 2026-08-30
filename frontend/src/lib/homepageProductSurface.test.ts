import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TOUR = read('../components/homepage/HomepageWorkspaceTour.tsx');
const SHOWCASE = read('../components/showcase/HomepageShowcase.tsx');
const CSS = read('../styles/homepage-coding.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('the homepage showcase is compact, stable, and labels both real device views', () => {
  assert.doesNotMatch(SHOWCASE, /IntersectionObserver|setInterval|isInView|isPaused/);
  assert.match(SHOWCASE, /xv-editorial-showcase__device-label">Mobile/);
  assert.match(SHOWCASE, /xv-editorial-showcase__device-label">Desktop/);
  assert.match(SHOWCASE, /thumbnailFor\(template, 'mobile'\)/);
  assert.match(SHOWCASE, /thumbnailFor\(template, 'desktop'\)/);
  assert.match(CSS, /xv-editorial-showcase__canvas\s*\{[^}]*1180px/);
  assert.match(CSS, /xv-editorial-showcase__devices\s*\{[^}]*32rem/);
});

test('the interactive homepage tour uses the real workspace skin vocabulary', () => {
  assert.match(TOUR, /const DEMO_SKINS = \[/);
  for (const skin of ['gray', 'dark', 'light', 'solar']) {
    assert.match(TOUR, new RegExp(`id: '${skin}'`));
  }
  assert.match(TOUR, /terminal-skin-\$\{demoSkin\}/);
  assert.match(TOUR, /setCollapsed\(\(value\) => !value\)/);
  assert.match(TOUR, /setThemeOpen\(\(open\) => !open\)/);
  assert.match(CSS, /xv-wt-window\[class\*='terminal-skin-'\][\s\S]*--hc-bg:\s*var\(--terminal-ui-surface\)/);
});

test('the homepage workspace preview shows and navigates real showcase products', () => {
  assert.match(TOUR, /SHOWCASE_TEMPLATES\[showcaseIndex\]/);
  assert.match(TOUR, /thumbnailFor\(template, 'desktop'\)/);
  assert.match(TOUR, /Previous showcase product/);
  assert.match(TOUR, /Next showcase product/);
  assert.match(TOUR, /Real Xroga showcase product/);
  assert.match(TOUR, /href=\{`\/showcase\/\$\{template\.slug\}\/preview`\}/);
});

test('the workspace tour becomes a readable stacked product on narrow screens', () => {
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-window,[\s\S]*?min-width:\s*0/);
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-studio\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-preview-canvas\s*\{[^}]*min-height:\s*340px/);
});
