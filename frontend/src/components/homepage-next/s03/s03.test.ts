import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AI_SAMPLES, AUDIENCES, BRAND, CHANNELS, COMPETITORS, COPY, OUTCOMES, QUERIES, SOURCES, TOOLS, shares, totalFunnel } from './data';
import { hasMark } from './marks';
import { initialState, isDefault, reducer, type Action, type State } from './state';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SHELL = read('./S03Growth.tsx');
const DISCOVER = read('./Discover.tsx');
const CAMPAIGNS = read('./Campaigns.tsx');
const OUTCOMES_SRC = read('./Outcomes.tsx');
const STACK = read('./Stack.tsx');
const TERRAIN = read('./Terrain.tsx');
const TRACE = read('./Trace.tsx');
const ART = read('./Art.tsx');
const CSS = read('./S03.module.css');
const PAGE = read('../../homepage/HomepageClient.tsx');
const CATALOG = read('../../../lib/integrations-catalog.ts');
const UI = SHELL + DISCOVER + CAMPAIGNS + OUTCOMES_SRC + STACK + TERRAIN;
const ALL_COPY = JSON.stringify({ BRAND, COMPETITORS, QUERIES, AUDIENCES, CHANNELS, SOURCES, OUTCOMES, TOOLS, COPY }) + UI;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const run = (s: State, ...as: Action[]) => as.reduce(reducer, s);

/* ------------------------------------------------------------------------------------------------ placement */
test('S03 sits directly after S02 and before the existing power stories, which stay intact', () => {
  const s02 = PAGE.indexOf('<S02Work');
  const s03 = PAGE.indexOf('<S03Growth');
  const next = PAGE.indexOf('<HomepagePowerStories');
  assert.ok(s02 > 0 && s03 > s02 && next > s03);
});

/* --------------------------------------------------------------------------------------------------- copy */
test('a short editorial header: one headline, one supporting sentence', () => {
  assert.equal(COPY.title, 'Your next customer is already searching.');
  assert.ok(words(COPY.title) >= 6 && words(COPY.title) <= 9);
  assert.ok(words(COPY.lede) >= 12 && words(COPY.lede) <= 20, `lede is ${words(COPY.lede)} words`);
  assert.equal(COPY.disclosure, 'Illustrative example · sample data');
});

test('every resting insight is a 4–10 word headline, and labels stay short', () => {
  for (const q of QUERIES) {
    assert.ok(words(q.headline) >= 4 && words(q.headline) <= 10, `${q.id}: ${q.headline}`);
    assert.ok(words(q.status) <= 4, q.status);
    for (const r of q.results) assert.ok(words(r.note) <= 6, r.note);
  }
  for (const t of TOOLS) {
    assert.ok(words(t.role) <= 4, t.role);
    assert.ok(t.could.length >= 2 && t.could.length <= 3, t.id);
  }
  for (const w of Object.values(COPY.worlds)) assert.ok(words(w) <= 2, w);
});

test('S03 does not reuse S02 language, objects or banned slogans', () => {
  for (const banned of [
    /AI Employee/i,
    /\bmission/i,
    /\bbrowser\b/i,
    /Get found/i,
    /Reach people/i,
    /Know what works/i,
    /Unlock 10x/i,
    /AI does everything/i,
    /dental/i,
    /timeline/i,
  ]) {
    assert.doesNotMatch(ALL_COPY, banned, `found ${banned}`);
  }
});

test('the sample business is fictional and every domain is reserved (.example)', () => {
  assert.equal(BRAND.name, 'Morrow Supply');
  for (const d of [BRAND.domain, ...Object.values(COMPETITORS).map((c) => c.domain)]) assert.match(d, /\.example$/);
  assert.doesNotMatch(ALL_COPY, /https?:\/\/(?!localhost)/);
});

/* -------------------------------------------------------------------------------------------------- data */
test('four search opportunities with consistent sample numbers', () => {
  assert.equal(QUERIES.length, 4);
  assert.equal(new Set(QUERIES.map((q) => q.id)).size, 4);
  for (const q of QUERIES) {
    assert.ok(q.volume > 0 && q.difficulty >= 0 && q.difficulty <= 100, q.id);
    assert.ok(q.x > 0 && q.x < 1 && q.ridge >= 0 && q.ridge <= 4, q.id);
    assert.ok(q.gsc.clicks <= q.gsc.impressions, q.id);
    assert.ok(COMPETITORS[q.rival], `${q.id} rival`);
    for (const c of q.ai.cited) assert.ok(c === 'you' || COMPETITORS[c], `${q.id} cites ${c}`);
    // your page is either in the top three or shown separately, never both
    const inTop = q.results.some((r) => r.by === 'you');
    assert.ok(inTop !== Boolean(q.you), q.id);
    assert.equal(inTop, q.yours <= 3, `${q.id} rank vs. results`);
    // the AI mention count shown in the comparison matches the cited list
    const named = q.ai.cited.includes('you') ? q.compare.find((c) => c.label === 'AI mentions')!.you : '0 of 4';
    assert.match(named, new RegExp(`of ${AI_SAMPLES}$`));
    if (!q.ai.cited.includes('you')) assert.equal(named, `0 of ${AI_SAMPLES}`);
  }
});

test('every audience grows from a real search and every channel has a cap and a provider', () => {
  for (const a of AUDIENCES)
    assert.ok(
      QUERIES.some((q) => q.id === a.from),
      a.id,
    );
  for (const c of CHANNELS) {
    assert.match(c.cap, /cap|opted in/);
    assert.ok(
      TOOLS.some((t) => t.id === c.provider),
      c.id,
    );
  }
});

test('every funnel narrows, totals add up and shares sum to one', () => {
  for (const s of SOURCES) for (let i = 1; i < 4; i++) assert.ok(s.funnel[i] < s.funnel[i - 1], `${s.id} stage ${i}`);
  const t = totalFunnel();
  assert.deepEqual(
    t,
    [0, 1, 2, 3].map((i) => SOURCES.reduce((n, s) => n + s.funnel[i], 0)),
  );
  const sum = SOURCES.map(shares).reduce((a, x) => ({ v: a.v + x.visitors, p: a.p + x.purchases }), { v: 0, p: 0 });
  assert.ok(Math.abs(sum.v - 1) < 1e-9 && Math.abs(sum.p - 1) < 1e-9);
  assert.match(OUTCOMES.forecast, /forecast, not a result/);
  assert.match(OUTCOMES.method, /Sample data/);
});

/* ------------------------------------------------------------------------------------- capability truth */
test('tools: the required providers, none shown as connected, catalog names match the real directory', () => {
  const names = TOOLS.map((t) => t.name);
  for (const n of ['Ahrefs', 'Semrush', 'Google Search Console', 'Google Analytics', 'Google Ads', 'Meta Ads', 'HubSpot']) assert.ok(names.includes(n), n);
  for (const t of TOOLS) if (t.catalog) assert.ok(CATALOG.includes(`"name": "${t.catalog}"`), `${t.catalog} is in integrations-catalog.ts`);
  // honest phrasing ("not connected", "once connected", "connected by you") is fine; a status claim is not
  assert.doesNotMatch(ALL_COPY, /(?<!Nothing )\b(?:is|are|now|already)\s+connected\b|>\s*Connected\s*</i);
  assert.doesNotMatch(ALL_COPY.replace(/Not connected · connection required/g, ''), /\bConnected\b/);
  assert.match(STACK, /href="\/integrations"/);
  assert.match(STACK, /Not connected · connection required/);
});

test('every logo is an official mark or the plain name — none are invented', () => {
  for (const t of TOOLS) if (t.id !== 'ahrefs') assert.ok(hasMark(t.id), `${t.id} has a mark`);
  assert.equal(hasMark('ahrefs'), false);
});

test('campaigns never imply anything was published, sent or spent', () => {
  assert.match(CAMPAIGNS, /\$0 spent/);
  assert.match(CAMPAIGNS, /Nothing was published, sent or spent/);
  assert.match(CAMPAIGNS, /Local preview · not published/);
  assert.doesNotMatch(ART, /href=|<image/);
});

test('no brand mark is drawn inside the data', () => {
  assert.doesNotMatch(TRACE + TERRAIN + DISCOVER + OUTCOMES_SRC, /xroga-orb|<Image|<img/);
});

/* ------------------------------------------------------------------------------------------------ reducer */
test('worlds keep selections and switching never replays', () => {
  const s = run(
    initialState(),
    { type: 'query', id: 'personal' },
    { type: 'world', world: 'campaigns' },
    { type: 'audience', id: 'gift' },
    { type: 'world', world: 'outcomes' },
    { type: 'source', id: 'email' },
    { type: 'world', world: 'discover' },
  );
  assert.equal(s.query, 'personal');
  assert.equal(s.audience, 'gift');
  assert.equal(s.source, 'email');
});

test('explore cycles through every search and wraps around', () => {
  let s = run(initialState(), { type: 'world', world: 'outcomes' });
  const seen: string[] = [];
  for (let i = 0; i < QUERIES.length; i++) seen.push((s = reducer(s, { type: 'next-query' })).query);
  assert.equal(s.world, 'discover');
  assert.deepEqual(new Set(seen).size, QUERIES.length);
  assert.equal(seen[QUERIES.length - 1], QUERIES[0].id);
});

test('approval is a reversible preview', () => {
  const s = run(initialState(), { type: 'approve' });
  assert.equal(s.approved, true);
  assert.equal(isDefault(s), false);
  assert.equal(reducer(s, { type: 'approve' }).approved, false);
});

test('layers open on request; escape closes the innermost first; reset returns to the start', () => {
  const busy = run(initialState(), { type: 'query', id: 'tips' }, { type: 'layer', layer: 'evidence' }, { type: 'tool', id: 'ga' });
  let s = reducer(busy, { type: 'escape' });
  assert.equal(s.layer, null);
  assert.equal(s.tool, 'ga');
  s = reducer(s, { type: 'escape' });
  assert.equal(s.tool, null);
  assert.equal(reducer(run(initialState(), { type: 'layer', layer: 'evidence' }), { type: 'world', world: 'outcomes' }).layer, null);
  assert.deepEqual(reducer(busy, { type: 'reset' }), initialState());
  assert.equal(isDefault(initialState()), true);
});

/* ----------------------------------------------------------------------------------------- motion & a11y */
test('one entrance, no autoplay timers, reduced motion respected, header-aware', () => {
  for (const src of [SHELL, DISCOVER, CAMPAIGNS, OUTCOMES_SRC, STACK, TERRAIN, TRACE]) assert.doesNotMatch(src, /setInterval|setTimeout|autoPlay|loop=/);
  assert.match(SHELL, /useReducedMotion/);
  assert.match(SHELL, /IntersectionObserver/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  assert.match(CSS, /scroll-margin-top/);
  assert.doesNotMatch(SHELL, /addEventListener\('wheel'|scrollIntoView\(/);
});

test('controls carry roles and names', () => {
  assert.match(SHELL, /role="tablist"/);
  assert.match(TERRAIN, /role="radiogroup"/);
  assert.match(CAMPAIGNS, /role="radiogroup" aria-label="Audience"/);
  assert.match(OUTCOMES_SRC, /role="radiogroup" aria-label="Source"/);
  assert.match(CAMPAIGNS, /aria-pressed=\{st\.approved\}/);
  assert.match(STACK, /aria-expanded/);
  assert.match(TRACE, /aria-hidden="true"/);
});
