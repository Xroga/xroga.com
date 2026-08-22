import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { CAPABILITY_PAGES } from './capabilityPages';

/**
 * Guards for the /ai-coding-agent landing page.
 *
 * Three things about this page are easy to break without noticing:
 *
 * 1. **The other five capability routes.** This page stopped rendering `CapabilityPage`,
 *    but that component is still what `/ai-website-builder`, `/build-saas-with-ai`,
 *    `/vercel-ai-deployment`, `/github-ai-coding-agent` and `/ai-website-generator` are.
 *    A redesign that reached into it would change all of them silently.
 * 2. **Dead links.** The reference nav and footer point at `/crypto-builder`, `/changelog`,
 *    `/careers`, `/blog`, `/guides` and `/security`. None of those has ever been a route.
 *    A link that 404s looks identical to one that works until someone clicks it.
 * 3. **Fabricated proof.** The reference carries two rows of stock portraits under a
 *    "Trusted by builders and teams" claim, and a "No credit card required" line. Neither
 *    is supported by anything in this repository, and both are the kind of thing that gets
 *    pasted back in later because a layout looks empty without it.
 *
 * The copy is asserted against `CAPABILITY_PAGES` rather than duplicated, so the page and
 * the rest of the site cannot describe this capability differently.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LANDING = read('../components/marketing/AiCodingAgentLanding.tsx');
const HEADER = read('../components/marketing/AiCodingAgentHeader.tsx');
const PAGE = read('../app/ai-coding-agent/page.tsx');
const CSS = read('../styles/ai-coding-agent-landing.css');
const APP_DIR = new URL('../app/', import.meta.url);

/**
 * Source with comments removed.
 *
 * These files explain at length what they deliberately leave out — the trust claim, the
 * dead routes — so a scan of the raw text finds the very strings it is meant to forbid,
 * inside the note saying they were forbidden. Only what actually reaches the page counts.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
}

const SOURCE = code(LANDING) + code(HEADER);

test('the shared CapabilityPage is left to the routes that still use it', () => {
  assert.ok(
    !/import\s*\{[^}]*CapabilityPage/.test(PAGE),
    'this route should render its own landing',
  );
  assert.ok(
    !SOURCE.includes('CapabilityPage'),
    'the landing must not reach into the component five other routes render',
  );
});

test('the page reads its copy from the shared capability data', () => {
  const data = CAPABILITY_PAGES['ai-coding-agent'];
  assert.ok(LANDING.includes("CAPABILITY_PAGES['ai-coding-agent']"), 'copy must come from the data');
  // The layout must render all of it, not a hand-picked subset that drifts.
  for (const field of ['data.eyebrow', 'data.intro', 'data.limits', 'data.outcomes', 'data.process']) {
    assert.ok(LANDING.includes(field), `${field} must be rendered`);
  }
  assert.equal(data.outcomes.length, 4, 'the outcome grid is built for four');
  assert.equal(data.process.length, 3, 'the step row is built for three');
});

/**
 * Every URL path the app router actually serves.
 *
 * Built by walking `src/app` and dropping `(group)` segments, which organise files
 * without appearing in the URL — `/dashboard` lives at `(shell)/dashboard`, so a
 * naive path join reports the real route as missing.
 */
function servedRoutes(dir: URL, prefix = ''): Set<string> {
  const found = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(entry.name)) found.add(prefix || '/');
      continue;
    }
    // Route groups and private folders contribute no URL segment.
    if (entry.name.startsWith('@') || entry.name.startsWith('_')) continue;
    const segment = /^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`;
    for (const route of servedRoutes(new URL(`${entry.name}/`, dir), prefix + segment)) {
      found.add(route);
    }
  }
  return found;
}

test('every internal link is a route that exists', () => {
  // Two forms reach the page: a literal attribute in JSX, and an entry in one of the
  // nav/footer/card arrays. Matching only the first missed almost every link.
  const hrefs = [
    ...[...SOURCE.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]),
    ...[...SOURCE.matchAll(/href:\s*'(\/[^'#?]*)'/g)].map((m) => m[1]),
  ];
  assert.ok(hrefs.length > 15, `expected the nav, cards and footer to contribute links, found ${hrefs.length}`);

  const routes = servedRoutes(APP_DIR);
  assert.ok(routes.has('/ai-coding-agent'), 'the walker should find this page itself');

  for (const href of [...new Set(hrefs)]) {
    assert.ok(
      routes.has(href === '/' ? '/' : href),
      `${href} is linked but no page in src/app serves it`,
    );
  }
});

test('the routes this page abandoned are still linked nowhere here', () => {
  // Named explicitly, because these are the ones the reference uses.
  for (const dead of ['/crypto-builder', '/changelog', '/careers', '/blog', '/guides', '/security', '/api-reference']) {
    assert.ok(
      !SOURCE.includes(`href="${dead}"`) && !SOURCE.includes(`href: '${dead}'`),
      `${dead} has never been a route; the real crypto page is /crypto`,
    );
  }
});

test('no fabricated proof', () => {
  const claims = [
    /trusted by/i,
    /no credit card/i,
    /\bloved by\b/i,
    /\bjoin \d/i,
    /\d+[,\d]*\+?\s*(developers|teams|companies|users|builders)/i,
  ];
  for (const claim of claims) {
    assert.ok(
      !claim.test(SOURCE),
      `${claim} appears on the page; nothing in this repository establishes it`,
    );
  }
  // Stock portraits standing in for customers are the same problem in image form.
  assert.ok(
    !/avatar|headshot|portrait|randomuser|pravatar|unsplash/i.test(SOURCE),
    'no stock faces may stand in for customers',
  );
});

test('the demonstration panels say they are demonstrations', () => {
  // The window shows a ticket number, a terminal and a "Completed" badge. Unlabelled,
  // that reads as a record of a real run.
  //
  // Read from stripped code, not the raw file. The doc comment at the top of the
  // component explains this labelling policy in the same words, so a raw scan is
  // satisfied by the note about the caption even after the caption itself is deleted —
  // the guard passed its own mutation until this line changed.
  const rendered = code(LANDING);
  assert.ok(
    /interface demonstration/i.test(rendered),
    'the workspace panel must be labelled as an interface demonstration',
  );
  assert.ok(
    /illustrative/i.test(rendered),
    'the panel must say its contents are illustrative rather than a record',
  );
  assert.ok(
    /depends on your\s+repository/i.test(rendered),
    'the checks list must say which checks run depends on the project',
  );
});

test('the page uses the real Logo component', () => {
  assert.ok(SOURCE.includes("from '@/components/layout/Logo'"), 'the brand mark must be the real one');
  assert.ok(!/<svg[^>]*>[\s\S]*?[Xx]roga/.test(SOURCE), 'the wordmark must never be redrawn inline');
});

test('the green palette cannot leak off this page', () => {
  // Every rule is scoped to classes this page owns, and the palette lives on `.agx-page`.
  // A `:root` block here would repaint the whole site the moment the sheet loaded.
  assert.ok(!/^:root\s*\{/m.test(CSS), 'this sheet must not declare :root variables');
  assert.ok(!/^body\s*\{/m.test(CSS), 'this sheet must not style body');
  assert.ok(CSS.includes('.agx-page {'), 'the palette belongs on the page wrapper');

  // Every top-level selector should carry the page's prefix.
  const selectors = [...CSS.matchAll(/^([.a-zA-Z][^{@\n]*)\{/gm)].map((m) => m[1].trim());
  for (const selector of selectors) {
    assert.ok(
      selector.includes('.agx-'),
      `"${selector}" is not scoped to this page and would affect the rest of the site`,
    );
  }
});

test('headings set their own colour', () => {
  // globals.css colours h1-h6 by type with --foreground, which is near-black under the
  // default theme-white body class. A heading here that only inherits disappears.
  for (const selector of ['.agx-h1', '.agx-h2']) {
    const at = CSS.indexOf(`${selector} {`);
    assert.notEqual(at, -1, `${selector} is missing`);
    const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));
    assert.ok(
      /color:/.test(body),
      `${selector} must set color explicitly or globals.css paints it black on a black page`,
    );
  }
});

test('the page never becomes its own scroll container', () => {
  const at = CSS.indexOf('.agx-page {');
  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));
  assert.ok(
    !/overflow-x:\s*hidden/.test(body),
    'overflow-x: hidden makes this a scroll container and breaks the sticky header inside it',
  );
});

test('no gradient-filled text', () => {
  assert.ok(!/background-clip:\s*text/.test(CSS), 'headings use a solid colour');
  assert.ok(!/gradient-text/.test(SOURCE), 'headings use a solid colour');
});
