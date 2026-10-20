import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ANNOUNCE,
  APPROVALS,
  ASSETS,
  AUDIENCES,
  CHANNELS,
  COPY,
  FIELD,
  LISTING,
  OPPORTUNITIES,
  PERSPECTIVES,
  PRODUCT,
  RESULTS,
  SOURCES,
  STACK_GROUPS,
  TOOLS,
  pct,
  totals,
} from './data';
import { hasMark } from './marks';
import { initialState, isDefault, reducer, type Action, type State } from './state';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SHELL = read('./S03Growth.tsx');
const ARTIFACT = read('./Artifact.tsx');
const LAUNCH = read('./Launch.tsx');
const DISCOVERY = read('./Discovery.tsx');
const CAMPAIGNS = read('./Campaigns.tsx');
const RESULTS_SRC = read('./Results.tsx');
const STACK = read('./Stack.tsx');
const CSS = read('./S03.module.css');
const PAGE = read('../../homepage/HomepageClient.tsx');
const CATALOG = read('../../../lib/integrations-catalog.ts');
const UI = SHELL + ARTIFACT + LAUNCH + DISCOVERY + CAMPAIGNS + RESULTS_SRC + STACK;
const DATA = JSON.stringify({
  PRODUCT,
  PERSPECTIVES,
  ASSETS,
  ANNOUNCE,
  LISTING,
  OPPORTUNITIES,
  FIELD,
  AUDIENCES,
  CHANNELS,
  APPROVALS,
  SOURCES,
  RESULTS,
  TOOLS,
  COPY,
});
const ALL_COPY = DATA + UI;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const run = (s: State, ...as: Action[]) => as.reduce(reducer, s);

/* ------------------------------------------------------------------------------------------------ placement */
test('S03 stays after S02 and before the current next homepage section', () => {
  const s02 = PAGE.indexOf('<S02Work');
  const s03 = PAGE.indexOf('<S03Growth');
  // Main replaces the legacy stories with the dedicated S04 publishing section.
  // Keep the same placement invariant for both the feature and integrated source.
  const next = PAGE.includes('<S04Publish') ? PAGE.indexOf('<S04Publish') : PAGE.indexOf('<HomepagePowerStories');
  assert.ok(s02 > 0 && s03 > s02 && next > s03);
});

/* --------------------------------------------------------------------------------------------------- copy */
test('a short editorial header: one headline, one 15–25 word sentence, one specific action', () => {
  assert.equal(COPY.title, 'A finished product isn’t a finished business.');
  assert.ok(words(COPY.lede) >= 15 && words(COPY.lede) <= 25, `lede is ${words(COPY.lede)} words`);
  assert.equal(COPY.cta, 'Open the growth workspace');
  assert.equal(COPY.preview, 'Interactive preview');
});

test('four journey steps, each with one short headline and one short line', () => {
  assert.deepEqual(
    PERSPECTIVES.map((p) => p.label),
    ['Launch', 'Discovery', 'Campaigns', 'Results'],
  );
  for (const p of PERSPECTIVES) {
    assert.ok(words(p.title) <= 7, p.title);
    assert.ok(words(p.line) <= 12, p.line);
  }
});

test('the resting first view stays light on words', () => {
  const launch = PERSPECTIVES[0];
  const visible = [
    COPY.eyebrow,
    COPY.title,
    COPY.lede,
    COPY.cta,
    ...PERSPECTIVES.map((p) => p.label),
    launch.title,
    launch.line,
    COPY.preview,
    ...ASSETS.map((a) => a.label),
  ];
  assert.ok(words(visible.join(' ')) <= 75, `${words(visible.join(' '))} words`);
  for (const o of OPPORTUNITIES) assert.ok(words(o.move) <= 7 && words(o.status) <= 3, o.id);
  for (const s of SOURCES) assert.ok(words(s.note) <= 10, s.id);
  for (const a of AUDIENCES) assert.ok(words(a.headline) <= 7, a.id);
});

test('no generic slogans, no S02 language, no "sample data"', () => {
  for (const banned of [
    /sample data/i,
    /Start in Xroga/i,
    /Start with Xroga/i,
    /Launch is only the beginning/i,
    /already searching/i,
    /Unlock/i,
    /Supercharge/i,
    /Transform your/i,
    /Grow 10x/i,
    /Know what works/i,
    /See what works/i,
    /Reach more people/i,
    /Know where the market looks/i,
    /Turn attention into demand/i,
    /AI Employee/i,
    /\bmission/i,
    /approved in preview/i,
  ]) {
    assert.doesNotMatch(ALL_COPY, banned, `found ${banned}`);
  }
});

test('the business is fictional, said once, and every domain is reserved (.example)', () => {
  assert.equal(PRODUCT.name, 'Aurel');
  assert.match(PRODUCT.domain, /\.example$/);
  for (const o of OPPORTUNITIES) for (const d of o.leader.match(/[\w-]+\.\w+/g) ?? []) assert.match(d, /\.example$/, d);
  assert.match(COPY.about, /fictional/);
  assert.match(COPY.about, /nothing is published, sent or spent/);
  assert.doesNotMatch(ALL_COPY, /https?:\/\/(?!localhost)/);
});

/* -------------------------------------------------------------------------------------------------- data */
test('opportunities: unique, inside the field, and presence agrees with the status', () => {
  assert.equal(new Set(OPPORTUNITIES.map((o) => o.id)).size, OPPORTUNITIES.length);
  for (const o of [...OPPORTUNITIES, ...FIELD]) assert.ok(o.x >= 0 && o.x <= 100 && o.y >= 0 && o.y <= 100);
  for (const o of OPPORTUNITIES) {
    assert.ok(o.demand >= 1 && o.demand <= 4, o.id);
    if (o.presence === 'visible') assert.equal(o.leader, PRODUCT.domain, o.id);
    else assert.notEqual(o.leader, PRODUCT.domain, o.id);
  }
  assert.ok(OPPORTUNITIES.some((o) => o.kind === 'AI answer' && o.presence === 'missing'));
});

test('every audience changes the artwork, not only the words; every channel has a provider', () => {
  assert.equal(new Set(AUDIENCES.map((a) => a.art)).size, AUDIENCES.length);
  assert.equal(new Set(AUDIENCES.map((a) => a.offer)).size, AUDIENCES.length);
  for (const c of CHANNELS)
    assert.ok(
      TOOLS.some((t) => t.id === c.provider),
      c.id,
    );
});

test('every path narrows, totals add up, and the chosen figures agree with the insight', () => {
  for (const s of SOURCES) for (let i = 1; i < 3; i++) assert.ok(s.flow[i] < s.flow[i - 1], `${s.id} stage ${i}`);
  assert.deepEqual(
    totals(),
    [0, 1, 2].map((i) => SOURCES.reduce((n, s) => n + s.flow[i], 0)),
  );
  // the bottleneck really is the weakest trial-to-active source
  const worst = [...SOURCES].sort((a, b) => a.flow[2] / a.flow[1] - b.flow[2] / b.flow[1])[0];
  assert.equal(worst.id, 'paid');
  assert.equal(pct(66, 120), '55%');
  assert.equal(new Set(SOURCES.map((s) => s.mark)).size, SOURCES.length, 'sources never rely on colour alone');
  assert.match(RESULTS.method, /Illustrative/);
});

/* ------------------------------------------------------------------------------------- capability truth */
test('services: grouped by job, none shown as connected, catalog names match the real directory', () => {
  const names = TOOLS.map((t) => t.name);
  for (const n of ['Ahrefs', 'Semrush', 'Search Console', 'Google Analytics', 'Google Ads', 'Meta Ads', 'HubSpot']) assert.ok(names.includes(n), n);
  for (const t of TOOLS) {
    assert.ok(
      STACK_GROUPS.some((g) => g.step === t.step),
      `${t.id} belongs to a group`,
    );
    if (t.catalog) assert.ok(CATALOG.includes(`"name": "${t.catalog}"`), `${t.catalog} is in integrations-catalog.ts`);
  }
  assert.equal(TOOLS.find((t) => t.id === 'gsc')!.catalog, null);
  assert.equal(TOOLS.find((t) => t.id === 'gtm')!.catalog, null);
  assert.doesNotMatch(ALL_COPY, /(?<!no accounts )\b(?:is|are|now|already)\s+connected\b|>\s*Connected\s*</i);
  assert.match(STACK, /href="\/integrations"/);
  assert.match(STACK, /connection required/);
  assert.match(STACK, /Integration not confirmed/);
});

test('every logo is an official mark or the plain name — none are invented', () => {
  for (const t of TOOLS) if (t.id !== 'ahrefs') assert.ok(hasMark(t.id), `${t.id} has a mark`);
  assert.equal(hasMark('ahrefs'), false);
});

test('campaigns never imply anything was published, sent or spent', () => {
  assert.match(CAMPAIGNS, /\$0 spent/);
  assert.match(CAMPAIGNS, /Nothing is published, sent or spent from this page/);
  assert.match(CAMPAIGNS, /Approval step preview/);
  assert.match(CAMPAIGNS, /Ready for review/);
  assert.doesNotMatch(ARTIFACT, /href=|<image|<img/);
});

test('exactly one real route out of the section, plus the integrations directory', () => {
  assert.equal((SHELL.match(/<Link /g) ?? []).length, 1);
  assert.match(SHELL, /loggedIn \? '\/workspace' : '\/auth\/signup'/);
  assert.equal((STACK.match(/<Link /g) ?? []).length, 1);
  for (const src of [LAUNCH, DISCOVERY, CAMPAIGNS, RESULTS_SRC]) assert.doesNotMatch(src, /href=/);
});

/* ------------------------------------------------------------------------------------------------ reducer */
test('steps keep selections and switching never replays', () => {
  const s = run(
    initialState(),
    { type: 'asset', id: 'announce' },
    { type: 'p', p: 'discovery' },
    { type: 'opp', id: 'howto' },
    { type: 'p', p: 'campaigns' },
    { type: 'audience', id: 'study' },
    { type: 'channel', id: 'email' },
    { type: 'p', p: 'results' },
    { type: 'source', id: 'paid' },
    { type: 'p', p: 'launch' },
  );
  assert.equal(s.asset, 'announce');
  assert.equal(s.opp, 'howto');
  assert.equal(s.audience, 'study');
  assert.equal(s.channel, 'email');
  assert.equal(s.source, 'paid');
});

test('the review step is a reversible preview', () => {
  const s = run(initialState(), { type: 'ready' });
  assert.equal(s.ready, true);
  assert.equal(isDefault(s), false);
  assert.equal(reducer(s, { type: 'ready' }).ready, false);
});

test('details open on request; escape closes the innermost first; reset returns to the start', () => {
  const busy = run(initialState(), { type: 'p', p: 'discovery' }, { type: 'detail', detail: 'evidence' }, { type: 'tool', id: 'ga' });
  let s = reducer(busy, { type: 'escape' });
  assert.equal(s.detail, null);
  assert.equal(s.tool, 'ga');
  s = reducer(s, { type: 'escape' });
  assert.equal(s.tool, null);
  assert.equal(reducer(run(initialState(), { type: 'detail', detail: 'evidence' }), { type: 'p', p: 'results' }).detail, null);
  assert.equal(reducer(run(initialState(), { type: 'detail', detail: 'about' }), { type: 'p', p: 'results' }).detail, 'about');
  assert.deepEqual(reducer(busy, { type: 'reset' }), initialState());
  assert.equal(isDefault(initialState()), true);
});

/* ----------------------------------------------------------------------------------------- motion & a11y */
test('one entrance, no autoplay timers, reduced motion respected, header-aware', () => {
  for (const src of [SHELL, LAUNCH, DISCOVERY, CAMPAIGNS, RESULTS_SRC, STACK, ARTIFACT]) assert.doesNotMatch(src, /setInterval|setTimeout|autoPlay|loop=/);
  assert.match(SHELL, /useReducedMotion/);
  assert.match(SHELL, /IntersectionObserver/);
  assert.match(SHELL, /pointerType !== 'mouse'/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  assert.match(CSS, /\.section\[data-under\] \.shield/);
  assert.doesNotMatch(SHELL, /addEventListener\('wheel'|scrollIntoView\(/);
  // scene changes never start from an empty stage
  assert.match(CSS, /@keyframes sceneIn \{\s*from \{\s*opacity: 0\.6;/);
});

test('controls carry roles and names', () => {
  assert.match(SHELL, /role="tablist"/);
  assert.match(SHELL, /role="tab"/);
  assert.match(LAUNCH, /role="radiogroup" aria-label="Launch kit"/);
  assert.match(DISCOVERY, /role="radiogroup" aria-label="Search opportunities"/);
  assert.match(CAMPAIGNS, /role="radiogroup" aria-label="Audience"/);
  assert.match(CAMPAIGNS, /role="radiogroup" aria-label="Channel"/);
  assert.match(RESULTS_SRC, /role="radiogroup" aria-label="Source"/);
  assert.match(CAMPAIGNS, /aria-pressed=\{st\.ready\}/);
  assert.match(STACK, /aria-expanded/);
  assert.match(ARTIFACT, /aria-hidden="true"/);
});
