import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import {
  AD_GROUPS,
  AI_SOURCES,
  AUDIENCES,
  BRAND,
  CHANNELS,
  COPY,
  ISSUES,
  LENSES,
  LINKS,
  LINK_MODES,
  MISSIONS,
  PAGES,
  QUERIES,
  SITE,
  SOURCES,
  TERMS,
  TOOLS,
  availability,
  pct,
  totals,
} from './data';
import { hasMark } from './marks';
import { initialState, isDefault, reducer, visibleIn, type Action, type State } from './state';

const dir = new URL('./', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, dir), 'utf8');
const files = (sub: string) =>
  readdirSync(new URL(sub, dir))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => read(`${sub}${f}`));
const SHELL = read('./S03Growth.tsx');
const SEARCH = read('./SearchStudio.tsx');
const GROWTH = read('./GrowthStudio.tsx');
const UI = read('./ui.tsx');
const SCENES = [...files('./search/'), ...files('./growth/')].join('\n');
const LINKS_SRC = read('./search/Links.tsx');
const ADS_SRC = read('./growth/SearchAds.tsx');
const CSS = read('./S03.module.css');
const PAGE = read('../../homepage/HomepageClient.tsx');
const CATALOG = read('../../../lib/integrations-catalog.ts');
const ALL = SHELL + SEARCH + GROWTH + UI + SCENES + read('./data.ts');
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const run = (s: State, ...as: Action[]) => as.reduce(reducer, s);

/* ------------------------------------------------------------------------------------------------ placement */
test('S03 sits directly after S02 and before the existing power stories, which stay intact', () => {
  const s02 = PAGE.indexOf('<S02Work');
  const s03 = PAGE.indexOf('<S03Growth');
  const next = PAGE.indexOf('<HomepagePowerStories');
  assert.ok(s02 > 0 && s03 > s02 && next > s03);
});

test('S03 is independent of S02: no S02 imports or components', () => {
  assert.doesNotMatch(ALL, /from ['"]\.\.\/s02|S02Work|AI Employee|\bmission control\b/i);
});

/* --------------------------------------------------------------------------------------------------- copy */
test('one short headline, one supporting line, and two chapter entrances', () => {
  assert.ok(words(COPY.title) >= 5 && words(COPY.title) <= 11, COPY.title);
  assert.ok(words(COPY.lede) >= 15 && words(COPY.lede) <= 22, `lede is ${words(COPY.lede)} words`);
  for (const c of [COPY.search, COPY.growth]) {
    assert.ok(words(c.title) >= 4 && words(c.title) <= 9, c.title);
    assert.ok(words(c.line) <= 13, c.line);
  }
  assert.match(SHELL, /href="#s03-search"/);
  assert.match(SHELL, /href="#s03-growth"/);
  assert.match(SEARCH, /id="s03-search"/);
  assert.match(GROWTH, /id="s03-growth"/);
});

test('no generic slogans, no repeated "sample data", no promises of rankings or results', () => {
  for (const banned of [
    /sample data/i,
    /Start in Xroga/i,
    /Start with Xroga/i,
    /Unlock/i,
    /Supercharge/i,
    /Grow 10x/i,
    /guarantee(?!s?\b)/i,
    /#1 ranking/i,
    /Learn more/,
    /Aurel/,
    /Relayboard/,
  ]) {
    assert.doesNotMatch(ALL, banned, `found ${banned}`);
  }
  // an explicit statement that nothing is guaranteed is allowed; a promise is not
  assert.match(ALL, /nothing here is a guarantee/);
});

test('both businesses are fictional, said once, and every domain is reserved (.example)', () => {
  for (const d of ALL.match(/[\w-]+\.(?:com|net|org|io|co\.uk|example)\b/g) ?? [])
    if (!/^(simple-icons|integrations-catalog)/.test(d)) assert.match(d, /\.example$/, d);
  assert.match(COPY.about, /fictional/);
  assert.match(COPY.about, /nothing is published, sent or spent/);
  assert.equal(SITE.domain, 'northlane.example');
  assert.equal(BRAND.domain, 'emberroasters.example');
});

/* ---------------------------------------------------------------------------------------- search coverage */
test('five search lenses cover technical, content, AI answers, links and local', () => {
  assert.deepEqual(
    LENSES.map((l) => l.id),
    ['health', 'content', 'ai', 'links', 'local'],
  );
  for (const l of LENSES) assert.ok(words(l.status) <= 3, l.status);
});

test('site health: every issue sits on a real internal link between real pages', () => {
  const ids = new Set(PAGES.map((p) => p.id));
  for (const [a, b] of LINKS) assert.ok(ids.has(a) && ids.has(b));
  for (const i of ISSUES) {
    assert.ok(
      LINKS.some(([a, b]) => a === i.from && b === i.to),
      i.id,
    );
    assert.match(i.verify, /\S/);
  }
});

test('content: gaps are queries Northlane has no page for; intents are all represented', () => {
  for (const q of QUERIES) assert.equal(q.gap, q.you === 'No page', q.id);
  assert.deepEqual([...new Set(QUERIES.map((q) => q.intent))].sort(), ['buying', 'comparing', 'learning']);
});

test('AI answers: explicit cited / not cited / not tested / conflicting states, no guaranteed citation', () => {
  const states = new Set([...AI_SOURCES.map((x) => x.state), 'absent', 'untested']);
  for (const s of ['cited', 'absent', 'untested', 'conflicting']) assert.ok(states.has(s as never), s);
});

test('links: typed relationships with honest semantics', () => {
  const by = (c: string) => SOURCES.filter((s) => s.cls === c);
  assert.ok(by('verified').length >= 2 && by('rival').length >= 2 && by('mention').length >= 1 && by('prospect').length >= 1 && by('discarded').length >= 1);
  // only verified relationships have a date observed; prospects and competitor-only sources do not link to the site
  for (const s of SOURCES) assert.equal(s.seen !== '—', s.cls === 'verified' || s.cls === 'mention', s.id);
  // edges: verified and competitor-only carry arrows; mentions stop short; prospects and excluded draw no line
  assert.match(LINKS_SRC, /x\.cls === 'prospect' \|\| x\.cls === 'discarded'\) return null/);
  assert.match(LINKS_SRC, /x\.cls === 'mention' \? 0\.72 : 1/);
  assert.match(LINKS_SRC, /toRival \? RIVAL_AT : SITE_AT/);
  assert.match(LINKS_SRC, /Draft · awaiting your review/);
  assert.match(LINKS_SRC, /A draft is not a link/);
  assert.match(by('discarded')[0].action, /breaks search policies/);
});

/* ---------------------------------------------------------------------------------------- growth coverage */
test('four growth jobs; search ads have two ad groups, negatives and a proposed cap', () => {
  assert.deepEqual(
    MISSIONS.map((m) => m.id),
    ['launch', 'search', 'social', 'paths'],
  );
  for (const g of AD_GROUPS) {
    assert.ok(TERMS.some((t) => t.group === g.id));
    assert.ok(
      g.headlines.every((h) => h.length <= 30),
      `${g.id} headlines fit 30 characters`,
    );
  }
  assert.ok(TERMS.filter((t) => t.group === 'irrelevant').length >= 2);
  assert.match(ADS_SRC, /proposed/);
  assert.match(ADS_SRC, /Nothing is launched or charged from this page/);
});

test('social: each audience changes the image tone, the line and the offer', () => {
  assert.equal(new Set(AUDIENCES.map((a) => a.tone)).size, AUDIENCES.length);
  assert.equal(new Set(AUDIENCES.map((a) => a.offer)).size, AUDIENCES.length);
  assert.equal(new Set(AUDIENCES.map((a) => a.line)).size, AUDIENCES.length);
});

test('conversion paths narrow, add up, and never rely on colour alone', () => {
  for (const c of CHANNELS) for (let i = 1; i < 3; i++) assert.ok(c.flow[i] < c.flow[i - 1], `${c.id} stage ${i}`);
  assert.deepEqual(
    totals(),
    [0, 1, 2].map((i) => CHANNELS.reduce((n, c) => n + c.flow[i], 0)),
  );
  const worst = [...CHANNELS].sort((a, b) => a.flow[2] / a.flow[1] - b.flow[2] / b.flow[1])[0];
  assert.equal(worst.id, 'social');
  assert.equal(pct(72, 160), '45%');
  assert.equal(new Set(CHANNELS.map((c) => c.mark)).size, CHANNELS.length);
});

/* ------------------------------------------------------------------------------------- provider truth */
test('providers: catalog names match the real directory; unlisted ones never claim availability', () => {
  for (const t of Object.values(TOOLS)) {
    if (t.catalog) assert.ok(CATALOG.includes(`"name": "${t.catalog}"`), `${t.catalog} is in integrations-catalog.ts`);
    assert.equal(availability(t), t.catalog ? 'connect' : 'unlisted');
  }
  for (const id of ['gsc', 'gtm', 'gbp'] as const) assert.equal(TOOLS[id].catalog, null, id);
  assert.doesNotMatch(ALL, /\b(?<!no accounts )(?:is|are|now|already)\s+connected\b|['"]Connected['"]/i);
  assert.match(UI, /href="\/integrations"/);
});

test('providers appear inside the work they support, never as a wall', () => {
  for (const l of LENSES) assert.ok(l.tools.length <= 3, l.id);
  for (const m of MISSIONS) assert.ok(m.tools.length <= 3, m.id);
  assert.deepEqual(LENSES.find((l) => l.id === 'links')!.tools, ['ahrefs', 'semrush']);
  assert.ok(!LENSES.find((l) => l.id === 'links')!.tools.includes('gsc'), 'Search Console is not a competitor-link source');
  assert.deepEqual(MISSIONS.find((m) => m.id === 'search')!.tools[0], 'gads');
  assert.deepEqual(MISSIONS.find((m) => m.id === 'social')!.tools, ['meta']);
  for (const id of ['ahrefs', 'gbp'] as const) assert.equal(hasMark(id), false);
});

test('exactly one route into the product, plus the integrations directory', () => {
  assert.equal((SHELL.match(/<Link /g) ?? []).length, 1);
  assert.match(SHELL, /loggedIn \? '\/workspace' : '\/auth\/signup'/);
  assert.doesNotMatch(SCENES, /href=/);
});

/* ------------------------------------------------------------------------------------------------ reducer */
test('lenses and missions keep every selection; switching never replays', () => {
  const s = run(
    initialState(),
    { type: 'set', patch: { issue: 'noindex', query: 'combi', sample: 's2' } },
    { type: 'mode', mode: 'mentions' },
    { type: 'lens', lens: 'health' },
    { type: 'mission', mission: 'social' },
    { type: 'set', patch: { audience: 'office', group: 'gift', budget: 40 } },
    { type: 'lens', lens: 'links' },
    { type: 'mission', mission: 'search' },
  );
  assert.equal(s.issue, 'noindex');
  assert.equal(s.query, 'combi');
  assert.equal(s.mode, 'mentions');
  assert.equal(s.source, 'forum');
  assert.equal(s.audience, 'office');
  assert.equal(s.group, 'gift');
  assert.equal(s.budget, 40);
});

test('a link view never leaves a hidden source selected, and outreach closes outside its view', () => {
  for (const m of LINK_MODES) {
    const s = run(initialState(), { type: 'set', patch: { source: 'spam' } }, { type: 'mode', mode: m.id });
    assert.ok(
      visibleIn(m.id).some((x) => x.id === s.source),
      `${m.id} shows ${s.source}`,
    );
  }
  const drafted = run(initialState(), { type: 'set', patch: { mode: 'outreach', outreach: true } }, { type: 'mode', mode: 'mine' });
  assert.equal(drafted.outreach, false);
});

test('escape closes the innermost layer first; reset clears one chapter only', () => {
  const busy = run(initialState(), { type: 'set', patch: { detail: 'method', sheet: 'search' } }, { type: 'tool', chapter: 'search', id: 'ahrefs' });
  let s = reducer(busy, { type: 'escape' });
  assert.equal(s.tool, null);
  s = reducer(s, { type: 'escape' });
  assert.equal(s.sheet, null);
  s = reducer(s, { type: 'escape' });
  assert.equal(s.detail, null);
  const both = run(initialState(), { type: 'lens', lens: 'ai' }, { type: 'mission', mission: 'paths' });
  const r = reducer(both, { type: 'reset', chapter: 'search' });
  assert.equal(r.lens, initialState().lens);
  assert.equal(r.mission, 'paths');
  assert.equal(isDefault(r, 'search'), true);
  assert.equal(isDefault(r, 'growth'), false);
});

/* ----------------------------------------------------------------------------------------- motion & a11y */
test('one entrance, no autoplay timers, reduced motion respected, header-aware', () => {
  assert.doesNotMatch(ALL, /setInterval|setTimeout|autoPlay|loop=/);
  assert.match(SHELL, /useReducedMotion/);
  assert.match(SHELL, /IntersectionObserver/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  assert.match(CSS, /\.section\[data-under\] \.shield/);
  assert.doesNotMatch(SHELL, /addEventListener\('wheel'|scrollIntoView\(/);
  assert.match(CSS, /@keyframes sceneIn \{\s*from \{\s*opacity: 0\.5;/);
});

test('controls carry roles and names', () => {
  assert.match(SEARCH, /role="tablist" aria-orientation="vertical" aria-label="Search work"/);
  assert.match(GROWTH, /role="tablist" aria-orientation="vertical" aria-label="Growth work"/);
  assert.match(LINKS_SRC, /role="radiogroup" aria-label="Sources"/);
  assert.match(UI, /role="radiogroup" aria-label=\{label\}/);
  assert.match(UI, /aria-expanded=\{open\}/);
  assert.match(ADS_SRC, /aria-label="Proposed daily budget cap in pounds"/);
  assert.match(SEARCH, /aria-controls="s03-search-inspector"/);
});
