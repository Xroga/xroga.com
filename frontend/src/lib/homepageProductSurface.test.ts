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
  assert.doesNotMatch(SHOWCASE, /<Logo/);
  assert.match(CSS, /xv-editorial-showcase__canvas\s*\{[^}]*1040px/);
  assert.match(CSS, /xv-editorial-showcase__devices\s*\{[^}]*24rem/);
});

test('the interactive homepage tour follows the real homepage theme and workspace shell', () => {
  assert.match(TOUR, /useThemeStore\(\(state\) => state\.theme\)/);
  assert.match(TOUR, /const demoSkin = skinForTheme\(theme\)/);
  assert.match(TOUR, /terminal-skin-\$\{demoSkin\}/);
  assert.match(TOUR, /setCollapsed\(\(value\) => !value\)/);
  assert.match(TOUR, /<ThemeToggle placement="right-start" \/>/);
  assert.doesNotMatch(TOUR, /DEMO_SKINS|setDemoSkin|setThemeOpen/);
  assert.match(CSS, /xv-wt-window\[class\*='terminal-skin-'\][\s\S]*--hc-bg:\s*var\(--terminal-ui-surface\)/);
});

test('the homepage workspace mirrors the real greeting, composer, ideas, and template rail', () => {
  assert.match(TOUR, /xv-wt-real-greeting/);
  assert.match(TOUR, /<HomepageChatBar/);
  assert.match(TOUR, /const IDEA_TABS = \[/);
  assert.match(TOUR, /SHOWCASE_TEMPLATES\.slice\(0, 4\)/);
  assert.match(TOUR, /thumbnailFor\(template, 'desktop'\)/);
  assert.match(TOUR, /href=\{`\/showcase\/\$\{template\.slug\}\/preview`\}/);
  assert.match(CSS, /xv-wt-real-template-row\s*\{[^}]*repeat\(4/);
});

test('the workspace tour keeps the real rail and a usable template row on narrow screens', () => {
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-window,[\s\S]*?grid-template-columns:\s*50px minmax\(0,1fr\)/);
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-real-template-row\s*\{[^}]*170px/);
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-sidebar-menu span[^}]*display:\s*none/);
});
