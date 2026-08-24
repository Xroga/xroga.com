import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the shared theme backdrop.
 *
 * The three marketing landings used to carry artwork of their own — eight remote images
 * on /software, a hotlinked hero on /ai-app-builder, a flat dark ground on
 * /ai-coding-agent. They now render the homepage's backdrop instead, which swaps with
 * the theme on `<body>`, and take their surfaces from one shared token set.
 *
 * Four things can break that quietly:
 *
 * 1. **An opaque page ground.** The backdrop is a fixed layer behind the document. One
 *    `background: #fff` on a page root hides it completely, and the page still looks
 *    deliberate — just wrong.
 * 2. **Drift from the homepage.** The image URLs are duplicated from homepage-coding.css
 *    because that file's copy is entangled with hundreds of `.xv-home-coding` component
 *    rules. Duplication is fine; silent divergence is not.
 * 3. **A colour written for one theme.** These sheets were composed for a single dark
 *    (or single light) design. Any near-white or near-black literal left behind is
 *    invisible on half the themes — measured, repeatedly, while doing this.
 * 4. **A page that forgets the tokens.** Rendering the backdrop without
 *    `xv-theme-surface` leaves every `--tp-*` undefined, so every colour built from one
 *    becomes guaranteed-invalid and the page inherits whatever the body says.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SHARED = read('../styles/theme-backdrop.css');
const HOMEPAGE = read('../styles/homepage-coding.css');
const COMPONENT = read('../components/layout/ThemeBackdrop.tsx');

/** The three landings, each as its page component and its stylesheet. */
const PAGES = [
  { name: '/software', tsx: read('../components/marketing/SoftwareLanding.tsx'), css: read('../styles/software-landing.css'), root: '.xsw-page' },
  { name: '/ai-app-builder', tsx: read('../components/marketing/AiAppBuilderLanding.tsx'), css: read('../styles/ai-app-builder-landing.css'), root: '.xab-page' },
  { name: '/ai-coding-agent', tsx: read('../components/marketing/AiCodingAgentLanding.tsx'), css: read('../styles/ai-coding-agent-landing.css'), root: '.agx-page' },
] as const;

const THEMES = ['white', 'beige', 'gray', 'black'] as const;

/** The declarations of one rule, bounded by its own closing brace. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** Every backdrop image the sheet names, keyed by theme. */
function backdropImages(css: string, scope: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const theme of THEMES) {
    const pattern = new RegExp(`body\\.theme-${theme}[^{]*${scope}[^{]*\\{([^}]*)\\}`, 'g');
    const urls: string[] = [];
    for (const m of css.matchAll(pattern)) {
      const url = /url\('([^']+)'\)/.exec(m[1]);
      if (url) urls.push(url[1]);
    }
    found[theme] = urls.sort();
  }
  return found;
}

test('every theme has its own backdrop artwork', () => {
  const images = backdropImages(SHARED, '.xv-theme-backdrop');
  for (const theme of THEMES) {
    assert.ok(images[theme].length > 0, `theme-${theme} names no backdrop image`);
  }
  // Four distinct worlds, not one image recoloured.
  const desktop = THEMES.map((t) => images[t][0]);
  assert.equal(new Set(desktop).size, THEMES.length, 'each theme should have distinct artwork');
});

test('the backdrop names the same files as the homepage', () => {
  const mine = backdropImages(SHARED, '.xv-theme-backdrop');
  const theirs = backdropImages(HOMEPAGE, '.xv-hc-bg-image');
  for (const theme of THEMES) {
    assert.deepEqual(
      mine[theme],
      theirs[theme],
      `theme-${theme} artwork has drifted from the homepage; these two lists must stay identical`,
    );
  }
});

test('the backdrop sits behind the document and is decorative', () => {
  const body = ruleBody(SHARED, '.xv-theme-backdrop');
  assert.match(body, /position:\s*fixed/, 'the backdrop must not scroll with the page');
  assert.match(body, /z-index:\s*-1/, 'it must paint behind the page content');
  assert.match(body, /pointer-events:\s*none/, 'it must never intercept a click');
  assert.ok(COMPONENT.includes('aria-hidden="true"'), 'artwork with no meaning must be hidden from assistive tech');
  // Match the import, not the word: the component's own comment explains at length why
  // this is not a next/image, and a raw scan is satisfied by that explanation.
  assert.ok(
    !/^import .*['"]next\/image['"]/m.test(COMPONENT),
    'the source is chosen by a CSS class applied before hydration, not by React',
  );
});

test('every theme defines the tokens a page builds its colours from', () => {
  for (const theme of THEMES) {
    const body = ruleBody(SHARED, `body.theme-${theme} .xv-theme-surface`);
    assert.ok(body.includes('--tp-bg'), `theme-${theme} must set --tp-bg`);
    assert.ok(body.includes('--tp-ink'), `theme-${theme} must set --tp-ink`);
    assert.ok(body.includes('--tp-muted'), `theme-${theme} must set --tp-muted`);
  }
});

test('each landing renders the backdrop and joins the token surface', () => {
  for (const page of PAGES) {
    assert.ok(page.tsx.includes('<ThemeBackdrop />'), `${page.name} must render the backdrop`);
    assert.ok(
      page.tsx.includes('xv-theme-surface'),
      `${page.name} must carry xv-theme-surface, or every --tp-* it reads is undefined`,
    );
  }
});

test('no page ground is opaque enough to hide the backdrop', () => {
  for (const page of PAGES) {
    const body = ruleBody(page.css, page.root);
    const background = /background:\s*([^;]+);/.exec(body)?.[1]?.trim();
    assert.equal(
      background,
      'transparent',
      `${page.root} paints "${background}", which covers the fixed backdrop entirely`,
    );
  }
});

test('no landing keeps a colour written for a single theme', () => {
  // A near-white or near-black literal is invisible on half the themes. Colours that
  // sit on a filled accent are exempt: a blue or green fill is dark on every ground,
  // so its label is legitimately always white.
  const onFill = /(?:--xsw-blue|--xab-blue|--agx-green|--xsw-ink\) 88%, #000|color-mix\(in srgb, var\(--x[sa][wb]-blue\) 88%, #000\))/;
  for (const page of PAGES) {
    for (const m of page.css.matchAll(/\n([^\n{}]+)\{([^}]*)\}/g)) {
      const [, selector, body] = m;
      for (const decl of body.matchAll(/color:\s*(#[0-9a-fA-F]{3,8})/g)) {
        const hex = decl[1].toLowerCase();
        const near = /^#(f{3,8}|fff[0-9a-f]{3}|0{3,8})$/.test(hex);
        if (!near) continue;
        assert.ok(
          onFill.test(body),
          `${page.name}: "${selector.trim()}" sets ${hex} but paints no accent fill behind it, so it disappears on half the themes`,
        );
      }
    }
  }
});

test('the two light themes tint their scrim toward their own ground', () => {
  // These pages set dark ink on White and Beige. A scrim that washes toward brown or
  // navy there puts dark type on a mid-tone ground and it stops reading — which is what
  // the homepage's Beige values did when they were copied across unchanged.
  for (const [theme, ground] of [['white', '234, 247, 255'], ['beige', '242, 226, 200']] as const) {
    const body = ruleBody(SHARED, `body.theme-${theme} .xv-theme-backdrop::after`);
    assert.ok(
      body.includes(ground),
      `the theme-${theme} scrim must tint toward its own ground (${ground}), not away from it`,
    );
  }
});
