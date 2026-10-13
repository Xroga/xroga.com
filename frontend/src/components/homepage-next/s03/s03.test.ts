import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { AUDIENCES, BRAND, COMPETITORS, COPY, PLAN, QUERIES, SOURCES, TOOLS, totalFunnel } from './data';
import { hasMark } from './marks';
import { initialState, isDefault, reducer, traceKey, type Action, type State } from './state';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SHELL = read('./S03Growth.tsx');
const PAPER = read('./Paper.tsx');
const TERRAIN = read('./Terrain.tsx');
const TRACE = read('./Trace.tsx');
const CSS = read('./S03.module.css');
const PAGE = read('../../homepage/HomepageClient.tsx');
const CATALOG = read('../../../lib/integrations-catalog.ts');
const ALL_COPY =
  JSON.stringify({
    BRAND,
    COMPETITORS,
    QUERIES,
    AUDIENCES,
    PLAN,
    SOURCES,
    TOOLS,
    COPY,
  }) +
  SHELL +
  PAPER +
  TERRAIN;
const run = (s: State, ...as: Action[]) => as.reduce(reducer, s);

/* ------------------------------------------------------------------------------------------------ placement */
test('S03 sits directly after S02 and before the existing power stories, which stay intact', () => {
  const s02 = PAGE.indexOf('<S02Work');
  const s03 = PAGE.indexOf('<S03Growth');
  const next = PAGE.indexOf('<HomepagePowerStories');
  assert.ok(s02 > 0 && s03 > s02 && next > s03);
});

/* --------------------------------------------------------------------------------------------------- copy */
test('headline and positioning copy', () => {
  assert.equal(COPY.title, 'Your next customer is already searching.');
  assert.match(COPY.lede, /searches you’re missing/);
  assert.match(COPY.launch, /Just launched, or selling for years/);
  assert.equal(COPY.disclosure, 'Illustrative example · sample data');
});

test('S03 does not reuse S02 language, objects or the old three-step slogan', () => {
  for (const banned of [/AI Employee/i, /\bmission/i, /\bbrowser\b/i, /Get found/i, /Reach people/i, /Know what works/i, /dental/i, /timeline/i]) {
    assert.doesNotMatch(ALL_COPY, banned, `found ${banned}`);
  }
});

test('the sample business is fictional and every domain is reserved (.example)', () => {
  assert.equal(BRAND.name, 'Morrow Supply');
  const domains = [BRAND.domain, ...Object.values(COMPETITORS).map((c) => c.domain)];
  for (const d of domains) assert.match(d, /\.example$/);
  for (const q of QUERIES) for (const r of q.results) assert.match(r.path, /^[a-z-]+\.example\b/);
});

/* -------------------------------------------------------------------------------------------------- data */
test('four search opportunities with consistent, plausible sample numbers', () => {
  assert.equal(QUERIES.length, 4);
  assert.equal(new Set(QUERIES.map((q) => q.id)).size, 4);
  for (const q of QUERIES) {
    assert.ok(q.volume > 0 && q.difficulty >= 0 && q.difficulty <= 100, q.id);
    assert.ok(q.x > 0 && q.x < 1 && q.ridge >= 0 && q.ridge <= 4, q.id);
    assert.ok(q.gsc.clicks <= q.gsc.impressions, q.id);
    assert.ok(COMPETITORS[q.rival], `${q.id} rival`);
    for (const c of q.ai.cited) assert.ok(c === 'you' || COMPETITORS[c], `${q.id} cites ${c}`);
    assert.equal(q.ai.youCited, q.ai.cited.includes('you'), `${q.id} youCited`);
    // the "you" row is either in the top results or listed separately, never both
    const inTop = q.results.some((r) => r.by === 'you');
    assert.ok(!(inTop && q.yourPage), q.id);
    if (q.yours && q.yours <= q.results.length) assert.ok(inTop, `${q.id} ranks in top results`);
  }
});

test('every funnel narrows stage by stage, and the totals add up', () => {
  for (const s of SOURCES) for (let i = 1; i < 4; i++) assert.ok(s.funnel[i] < s.funnel[i - 1], `${s.id} stage ${i}`);
  const t = totalFunnel();
  assert.deepEqual(
    t,
    [0, 1, 2, 3].map((i) => SOURCES.reduce((n, s) => n + s.funnel[i], 0)),
  );
});

test('the growth plan is a draft: capped spend, nothing published, an approval boundary', () => {
  assert.equal(
    AUDIENCES.reduce((n, a) => n + a.share, 0),
    100,
  );
  for (const c of PLAN.channels) assert.match(c.cap, /No spend|cap/);
  assert.match(PAPER, /Needs your approval/);
  assert.match(PAPER, /Nothing was published, sent or spent/);
  assert.match(PAPER, /not published/);
});

/* ------------------------------------------------------------------------------------- capability truth */
test('tools: the required providers, none shown as connected, catalog names match the real directory', () => {
  const names = TOOLS.map((t) => t.name);
  for (const n of ['Ahrefs', 'Semrush', 'Google Search Console', 'Google Analytics', 'Google Ads', 'Meta Ads', 'HubSpot']) assert.ok(names.includes(n), n);
  for (const t of TOOLS) if (t.catalog) assert.ok(CATALOG.includes(`"name": "${t.catalog}"`), `${t.catalog} is in integrations-catalog.ts`);
  assert.doesNotMatch(ALL_COPY.replace(/not connected|Nothing is connected|are not\s+connected|connection required/gi, ''), /\bconnected\b/i);
  assert.match(SHELL, /href="\/integrations"/);
});

test('every logo is an official mark or the plain name — none are invented', () => {
  for (const t of TOOLS) if (t.id !== 'ahrefs') assert.ok(hasMark(t.id), `${t.id} has a mark`);
  assert.equal(hasMark('ahrefs'), false);
});

/* ------------------------------------------------------------------------------------------------ reducer */
test('selecting a search keeps the evidence lens and closes detail', () => {
  let s = run(initialState(), { type: 'paper', mode: 'ai' }, { type: 'why', open: true }, { type: 'query', id: 'tips' });
  assert.equal(s.query, 'tips');
  assert.equal(s.paper, 'ai');
  assert.equal(s.why, false);
  s = run(s, { type: 'paper', mode: 'outline' }, { type: 'query', id: 'cubes' });
  assert.equal(s.paper, 'organic');
});

test('explore cycles through every search and wraps around', () => {
  let s = initialState();
  const seen = [s.query];
  for (let i = 0; i < QUERIES.length; i++) seen.push((s = reducer(s, { type: 'next-query' })).query);
  assert.deepEqual(
    seen.slice(0, 4),
    QUERIES.map((q) => q.id),
  );
  assert.equal(seen[4], QUERIES[0].id);
});

test('views keep selections; approval is a reversible preview', () => {
  let s = run(
    initialState(),
    { type: 'query', id: 'personal' },
    { type: 'view', view: 'plan' },
    { type: 'audience', id: AUDIENCES[1].id },
    { type: 'approve' },
  );
  assert.equal(s.approved, true);
  s = run(s, { type: 'view', view: 'conversions' }, { type: 'source', id: 'email' }, { type: 'view', view: 'market' });
  assert.equal(s.query, 'personal');
  assert.equal(s.audience, AUDIENCES[1].id);
  assert.equal(reducer(s, { type: 'approve' }).approved, false);
});

test('reset returns to the start without replaying; escape closes the innermost layer first', () => {
  const busy = run(initialState(), { type: 'query', id: 'tips' }, { type: 'paper', mode: 'compare' }, { type: 'why', open: true }, { type: 'tool', id: 'ga' });
  assert.equal(isDefault(busy), false);
  let s = reducer(busy, { type: 'escape' });
  assert.equal(s.tool, null);
  s = reducer(s, { type: 'escape' });
  assert.equal(s.why, false);
  s = reducer(s, { type: 'escape' });
  assert.equal(s.paper, 'organic');
  const r = reducer(busy, { type: 'reset' });
  assert.deepEqual(r, initialState());
  assert.equal(isDefault(r), true);
  assert.equal(isDefault(run(initialState(), { type: 'approve' })), false);
});

test('the trace re-draws on a real change only', () => {
  const s = initialState();
  assert.equal(traceKey(s), traceKey(reducer(s, { type: 'tool', id: 'ga' })));
  assert.notEqual(traceKey(s), traceKey(reducer(s, { type: 'query', id: 'tips' })));
});

/* ----------------------------------------------------------------------------------------- motion & a11y */
test('one entrance, no autoplay timers, reduced motion respected', () => {
  for (const src of [SHELL, PAPER, TERRAIN, TRACE]) assert.doesNotMatch(src, /setInterval|autoPlay|loop=/);
  assert.match(SHELL, /useReducedMotion/);
  assert.match(SHELL, /IntersectionObserver/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  assert.doesNotMatch(SHELL, /wheel|scrollIntoView\(/);
});

test('controls carry roles and names', () => {
  assert.match(TERRAIN, /role="radiogroup"/);
  assert.match(TERRAIN, /role="radio"/);
  assert.match(SHELL, /role="tablist"/);
  assert.match(SHELL, /aria-expanded/);
  assert.match(PAPER, /aria-pressed=\{st\.approved\}/);
  assert.match(TRACE, /aria-hidden="true"/);
});
