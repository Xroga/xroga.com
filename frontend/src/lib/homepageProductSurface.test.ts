import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TOUR = read('../components/homepage/HomepageWorkspaceTour.tsx');
const SHOWCASE = read('../components/showcase/HomepageShowcase.tsx');
const CSS = read('../styles/homepage-coding.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('the homepage showcase is a full-width framed gallery with both screens at every breakpoint', () => {
  assert.doesNotMatch(SHOWCASE, /IntersectionObserver|setInterval|isInView|scrollIntoView/);
  assert.match(SHOWCASE, /const AUTO_ADVANCE_MS = 8_000/);
  assert.match(SHOWCASE, /window\.setTimeout\([\s\S]*AUTO_ADVANCE_MS/);
  assert.match(SHOWCASE, /Pause automatic template rotation/);
  assert.match(SHOWCASE, /useReducedMotion\(\)/);
  assert.match(SHOWCASE, /rail\.scrollTo\(/);
  assert.match(SHOWCASE, /xv-showcase-display/);
  assert.doesNotMatch(SHOWCASE, /xv-showcase-laptop|xv-showcase-laptop__base|xv-showcase-laptop__browser/);
  assert.match(SHOWCASE, /xv-showcase-phone__screen/);
  assert.match(SHOWCASE, /thumbnailFor\(template, 'mobile'\)/);
  assert.match(SHOWCASE, /thumbnailFor\(template, 'desktop'\)/);
  assert.match(SHOWCASE, /onWheel=\{scrollTemplates\}/);
  assert.match(SHOWCASE, /event\.preventDefault\(\)/);
  assert.match(SHOWCASE, /xv-showcase-gallery__rail/);
  assert.doesNotMatch(SHOWCASE, /ChevronLeft|ChevronRight|xv-showcase-gallery__arrow/);
  assert.doesNotMatch(SHOWCASE, /xv-editorial-showcase__(?:masthead|story|footer)/);
  assert.match(CSS, /xv-showcase-gallery__canvas\s*\{[^}]*1600px[^}]*border:\s*0[^}]*background:\s*transparent[^}]*box-shadow:\s*none/);
  assert.match(CSS, /xv-showcase-gallery__stage\s*\{[^}]*min-height:\s*0[^}]*border:\s*0[^}]*background:\s*transparent/);
  assert.match(CSS, /xv-showcase-gallery__stage\s*\{[^}]*--xv-showcase-device-height:/);
  assert.match(CSS, /xv-showcase-display\s*\{[^}]*height:var\(--xv-showcase-device-height\)[^}]*aspect-ratio:8\/5/);
  assert.match(CSS, /xv-showcase-phone\s*\{[^}]*height:var\(--xv-showcase-device-height\)[^}]*aspect-ratio:414\/760[^}]*rgba\(255,255,255,\.96\)/);
  assert.ok(
    SHOWCASE.indexOf('xv-showcase-gallery__stage') < SHOWCASE.indexOf('xv-showcase-gallery__header'),
    'the real device preview should appear before its description and actions',
  );
  assert.match(CSS, /xv-showcase-gallery__rail\s*\{[^}]*scroll-snap-type:\s*x mandatory/);
  assert.match(CSS, /xv-showcase-autoplay-progress 8s linear/);
  assert.match(CSS, /@media\(max-width:760px\)[\s\S]*?\.xv-home-coding \.xv-showcase-gallery__stage\s*\{[^}]*--xv-showcase-device-height:clamp\(8rem,40vw,10rem\)/);
  assert.match(CSS, /@media\(max-width:760px\)[\s\S]*?\.xv-home-coding \.xv-showcase-display\s*\{[^}]*height:var\(--xv-showcase-device-height\)/);
  assert.match(CSS, /@media\(max-width:760px\)[\s\S]*?\.xv-home-coding \.xv-showcase-phone\s*\{[^}]*height:var\(--xv-showcase-device-height\)/);
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
  assert.match(TOUR, /CONTINUE WHERE YOU STOPPED|recentTerminal/);
  assert.match(TOUR, /Orbit Clean E2E · just now/);
  assert.match(TOUR, /<WorkspaceConnectionsStrip href=\{connectionHref\} \/>/);
  assert.match(CSS, /xv-wt-real-greeting > p\s*\{[^}]*clamp\(\.68rem,1vw,\.86rem\)/);
});

test('the workspace tour keeps the real rail and a usable template row on narrow screens', () => {
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-window,[\s\S]*?grid-template-columns:\s*50px minmax\(0,1fr\)/);
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-real-template-row\s*\{[^}]*170px/);
  assert.match(CSS, /@media \(max-width:\s*760px\)[\s\S]*?\.xv-home-coding \.xv-wt-sidebar-menu span[^}]*display:\s*none/);
});
