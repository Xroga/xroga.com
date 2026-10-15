import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import {
  AD_GROUPS,
  AVAILABILITY_LABEL,
  INTENTS,
  AI_COPY,
  AI_QUESTIONS,
  BRIEF,
  PRODUCT_FACTS,
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
import { BEATS, MOBILE_BEATS, MOBILE_TOUR_MS, TOUR_MS } from './tourBeats';

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
const TOUR = read('./Tour.tsx');
const SCENES = [...files('./search/'), ...files('./growth/')].join('\n');
const LINKS_SRC = read('./search/Links.tsx');
const ADS_SRC = read('./growth/SearchAds.tsx');
const CSS = read('./S03.module.css');
const PAGE = read('../../homepage/HomepageClient.tsx');
const CATALOG = read('../../../lib/integrations-catalog.ts');
const ALL = SHELL + SEARCH + GROWTH + UI + TOUR + SCENES + read('./data.ts') + read('./tourBeats.ts');
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
test('one section, one headline, one supporting line, and two modes on one shared stage', () => {
  assert.ok(words(COPY.title) >= 4 && words(COPY.title) <= 11, COPY.title);
  assert.ok(words(COPY.lede) >= 15 && words(COPY.lede) <= 22, `lede is ${words(COPY.lede)} words`);
  assert.equal((SHELL.match(/<section/g) ?? []).length, 1, 'S03 has one section boundary');
  assert.doesNotMatch(SEARCH + GROWTH, /<section|<h3/, 'modes are panels of the one stage, not chapters');
  assert.match(SHELL, /role="tablist" aria-label="What Xroga works on"/);
  assert.match(SHELL, /id="s03-stage" role="tabpanel"/);
  assert.deepEqual([COPY.search.label, COPY.growth.label], ['Search & Visibility', 'Launch & Marketing']);
  for (const m of [COPY.search, COPY.growth]) assert.ok(words(m.line) <= 9, m.line);
});

test('plain language first: lens names are what a business owner wants, expert terms second', () => {
  assert.deepEqual(
    LENSES.map((l) => l.label),
    ['Fix my website', 'Find search opportunities', 'Appear in AI answers', 'Earn authority', 'Show up locally'],
  );
  for (const l of LENSES) assert.ok(l.expert.length > 0);
});

test('AI answers are named for real questions, never sample numbers', () => {
  assert.doesNotMatch(ALL, /Sample \d|['"]s[123]['"]/);
  for (const q of AI_QUESTIONS) {
    assert.match(q.q, /\?$/, q.id);
    for (const a of q.answer) if (a.cite) assert.ok(q.sources[a.cite - 1], `${q.id} cites ${a.cite}`);
  }
});

test('V12: no Replay, no Start over, no prominent preview pill; one understated note about the walkthrough', () => {
  assert.equal(COPY.disclosure, 'About this walkthrough');
  assert.match(COPY.about, /fictional examples/);
  assert.doesNotMatch(SHELL + TOUR, />\s*(Replay|Start over|Watch Xroga work|Interactive preview)\s*</);
  assert.doesNotMatch(SHELL + TOUR, /'Replay'|'Watch Xroga work'|\{type: 'reset'|type: 'reset'/);
  assert.doesNotMatch(ALL, /Interactive example|sample data|fake demo|Interactive preview/i);
  // the note lives in the stage's top row as a quiet text button, not a pill in the footer
  assert.match(TOUR, /className=\{s\.aboutBtn\} aria-expanded=\{about\} aria-controls="s03-about"/);
  assert.doesNotMatch(SHELL, /className=\{s\.preview\}/);
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
  assert.match(ALL, /nothing guarantees a mention or a citation/);
});

test('both businesses are fictional, said once, and every domain is reserved (.example)', () => {
  for (const d of ALL.match(/[\w-]+\.(?:com|net|org|io|co\.uk|example)\b/g) ?? [])
    if (!/^(simple-icons|integrations-catalog)/.test(d)) assert.match(d, /\.example$/, d);
  assert.match(COPY.about, /fictional/);
  assert.match(COPY.about, /nothing is published, sent or spent/);
  assert.equal(SITE.domain, 'peakform.example');
  assert.equal(BRAND.domain, 'emberroasters.example');
});

/* ---------------------------------------------------------------------------------------- search coverage */
test('five search lenses cover technical, content, AI answers, links and local', () => {
  assert.deepEqual(
    LENSES.map((l) => l.id),
    ['health', 'content', 'ai', 'links', 'local'],
  );
  for (const l of LENSES) assert.ok(l.expert.length > 0 && words(l.label) <= 4, l.label);
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

test('keywords: gaps are buyer searches PeakForm has no page for; compare, buy, local and learn are all represented', () => {
  for (const q of QUERIES) assert.equal(q.gap, q.you === 'No page answers this', q.id);
  assert.deepEqual([...new Set(QUERIES.map((q) => q.intent))].sort(), ['buy', 'compare', 'learn', 'local']);
  // every gap has a page brief: heading, what it covers, a FAQ, internal links and product facts
  for (const q of QUERIES.filter((x) => x.gap)) {
    const b = BRIEF[q.id];
    assert.ok(b && b.covers.length === 3 && b.faq && b.link && b.facts, q.id);
  }
  // the opening keyword is the same buyer question the AI lens asks
  assert.ok(AI_QUESTIONS[0].q.toLowerCase().startsWith(QUERIES[0].q.toLowerCase()));
});

test('AI answers: cited, mentioned-only, not cited and not checked are distinct; nothing is promised', () => {
  const states = new Set(AI_QUESTIONS.flatMap((q) => [...q.sources.map((x) => x.state), q.you]));
  for (const s of ['cited', 'mentioned', 'absent', 'untested']) assert.ok(states.has(s as never), s);
  for (const q of AI_QUESTIONS) for (const a of q.answer) if (a.cite) assert.equal(q.sources[a.cite - 1].state, 'cited', `${q.id}: ${a.text}`);
  assert.match(AI_COPY.recheck, /no new result is shown/);
  assert.doesNotMatch(ALL, /now recommended|recommends you|AI recommends|rank(?:ed)? #?1|top of ChatGPT|guaranteed (?:citation|mention|ranking)/i);
});

test('V11: the AI lens leads with a protein buyer, and the boiler-repair scene is gone everywhere in S03', () => {
  assert.equal(AI_QUESTIONS[0].q, 'Which whey protein should I buy for the gym?');
  assert.equal(initialState().sample, AI_QUESTIONS[0].id);
  assert.doesNotMatch(ALL, /boiler|Northlane|heating engineer|Headingley/i);
  assert.equal(SITE.name, 'PeakForm Nutrition');
  // one coherent example: every search lens names the same business, and its product page carries the facts answers cite
  assert.deepEqual(
    PRODUCT_FACTS.map((f) => f.id),
    ['protein', 'allergens', 'price', 'testing'],
  );
  assert.ok(BEATS.some((b) => b.caption === 'Checked which sources an AI answer cites.'));
  assert.ok(BEATS.some((b) => b.steps.some((st) => st.actions.some((a) => a.type === 'set' && (a.patch as Partial<State>).aiCheck === true))));
});

test('site health tells broken, slow, hidden by mistake and hidden on purpose apart', () => {
  assert.deepEqual([...new Set(PAGES.map((p) => p.state))].sort(), ['blocked', 'broken', 'excluded', 'ok', 'slow']);
  for (const i of ISSUES) assert.match(i.finding, /\.$/);
  assert.equal(ISSUES.find((i) => i.id === 'broken')!.finding, 'This product page returns 404.');
});

test('links: typed relationships with honest semantics', () => {
  const by = (c: string) => SOURCES.filter((s) => s.cls === c);
  assert.ok(by('verified').length === 1 && by('rival').length >= 2 && by('mention').length >= 1 && by('prospect').length >= 1 && by('discarded').length >= 1);
  // only verified relationships have a date observed; prospects and competitor-only sources do not link to the site
  for (const s of SOURCES) assert.equal(s.seen !== '—', s.cls === 'verified' || s.cls === 'mention', s.id);
  // edges: verified and competitor-only carry arrows; mentions stop short; prospects and excluded draw no line
  assert.match(LINKS_SRC, /x\.cls === 'prospect' \|\| x\.cls === 'discarded'\) continue/);
  assert.match(LINKS_SRC, /x\.cls === 'mention' \? 0\.7 : 1/);
  assert.match(LINKS_SRC, /x\.cls === 'rival' \? rivalR : siteR/);
  assert.match(LINKS_SRC, /Draft · awaiting your review/);
  // the competitor gap shows PeakForm's missing link as an open line that never arrives, never as a completed edge
  assert.match(LINKS_SRC, /cls: 'gap'/);
  assert.match(LINKS_SRC, /e\.end === 'open' \? 'url\(#s03-open\)'/);
  assert.match(LINKS_SRC, /No link from \{sel\.domain\} yet/);
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
    { type: 'set', patch: { issue: 'blocked', query: 'beginners', sample: 'trust' } },
    { type: 'mode', mode: 'mentions' },
    { type: 'lens', lens: 'health' },
    { type: 'mission', mission: 'social' },
    { type: 'set', patch: { audience: 'office', group: 'gift', budget: 40 } },
    { type: 'lens', lens: 'links' },
    { type: 'mission', mission: 'search' },
  );
  assert.equal(s.issue, 'blocked');
  assert.equal(s.query, 'beginners');
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
test('the guided tour: both modes, a real narrative, 16–21 s on wider screens and shorter on phones', () => {
  assert.ok(TOUR_MS >= 16000 && TOUR_MS <= 21000, `${TOUR_MS} ms`);
  assert.ok(MOBILE_TOUR_MS < TOUR_MS && MOBILE_TOUR_MS <= 14000, `${MOBILE_TOUR_MS} ms`);
  assert.equal(MOBILE_BEATS[0].view, 'search');
  assert.equal(MOBILE_BEATS[MOBILE_BEATS.length - 1].view, 'growth');
  // stage words are everyday verbs
  for (const b of [...BEATS, ...MOBILE_BEATS]) assert.ok(['Found', 'Compared', 'Prepared', 'Needs approval'].includes(b.stage), b.stage);
  assert.equal(BEATS[0].view, 'search');
  assert.equal(BEATS[BEATS.length - 1].view, 'growth');
  // every search lens and every growth job is shown at least once
  const actions = BEATS.flatMap((b) => b.steps.flatMap((s) => s.actions));
  for (const l of LENSES)
    assert.ok(
      actions.some((a) => a.type === 'lens' && a.lens === l.id),
      l.id,
    );
  for (const m of ['search', 'social', 'paths'])
    assert.ok(
      actions.some((a) => a.type === 'mission' && a.mission === m),
      m,
    );
  for (const b of BEATS) {
    assert.ok(words(b.caption) <= 9, b.caption);
    for (const st of b.steps) assert.ok(st.at < b.dur, b.caption);
  }
  // the tour only selects local states: it never marks anything published, verified or live
  assert.doesNotMatch(JSON.stringify(BEATS), /publish|verified|live|launched|sent/i);
  // replaying the tour from the start reaches a valid state
  const end = actions.reduce(reducer, initialState());
  assert.equal(end.view, 'growth');
  assert.equal(end.mission, 'paths');
});

test('the tour hands over on any input, pauses offscreen and hidden, runs a short intro on phones and none under reduced motion', () => {
  assert.match(TOUR, /kinds\.forEach\(\(k\) => el\.addEventListener\(k, onInput, true\)\)/);
  assert.match(TOUR, /data-tour-ctl/);
  assert.match(TOUR, /visibilitychange/);
  assert.match(TOUR, /intersectionRatio >= 0\.5/);
  assert.match(TOUR, /clearTimeout/);
  // full story on wider screens, a short one on phones, none under reduced motion; once per visit
  assert.match(SHELL, /setBeats\(reduced \? null : window\.matchMedia\('\(min-width: 701px\)'\)\.matches \? BEATS : MOBILE_BEATS\)/);
  assert.match(TOUR, /!seenThisVisit\(\)/);
  assert.match(TOUR, /sessionStorage/);
  assert.match(TOUR, /Skip/);
  // a bare click (some assistive technologies) interrupts like a pointer or a key
  assert.match(TOUR, /\['pointerdown', 'keydown', 'click'\]/);
  // BUG-07: a paused beat resumes where it stopped; steps already shown are not replayed
  assert.match(TOUR, /if \(from === 0 \|\| step\.at > from\)/);
  assert.match(TOUR, /B\[i\]\.dur - from/);
});

test('no stray timers, reduced motion respected, header-aware', () => {
  for (const src of [SHELL, SEARCH, GROWTH, UI, SCENES]) assert.doesNotMatch(src, /setInterval|setTimeout|autoPlay|loop=/);
  assert.doesNotMatch(TOUR, /setInterval/);
  assert.match(SHELL, /useReducedMotion/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
  assert.match(CSS, /\.section\[data-under\] \.shield/);
  assert.doesNotMatch(SHELL + TOUR, /addEventListener\('wheel'|scrollIntoView\(|scrollTo\(/);
  assert.match(CSS, /@keyframes sceneIn \{\s*from \{\s*opacity: 0\.5;/);
});

/* ------------------------------------------------------------------------------- V11 regressions (bugs) */
const HOMEPAGE_CSS = read('../../../styles/homepage-coding.css');
const hoverRules = (css: string) => [...css.matchAll(/([^{}]*:hover[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

test('BUG-01: the homepage button lift never reaches S03 (it replaced S03 transforms and made controls vibrate)', () => {
  const lift = hoverRules(HOMEPAGE_CSS).filter((r) => /translateY\(-2px\)/.test(r.body) && /:where\(button/.test(r.sel));
  assert.ok(lift.length >= 1);
  for (const r of lift) assert.match(r.sel, /:where\(:not\(#s03 \*\)\)/, r.sel);
  assert.match(HOMEPAGE_CSS, /:where\(button,\.xv-hc-btn-primary,\.xv-hc-btn-ghost\):where\(:not\(#s03 \*\)\):not\(:disabled\):active/);
});

test('BUG-02: no S03 hover state moves or resizes what is under the pointer', () => {
  for (const r of hoverRules(CSS))
    assert.doesNotMatch(r.body, /transform|translate|scale|rotate|width|height|padding|margin|top:|left:|font-size|max-height/, `${r.sel} {${r.body}}`);
  // graph node labels keep their line reserved; hover only changes opacity and colour
  assert.match(CSS, /\.src small \{[^}]*height: 14px;[^}]*opacity: 0;/);
});

test('BUG-03: nothing in S03 tracks the pointer; citation lines are measured on layout changes only', () => {
  assert.doesNotMatch(ALL, /onPointerMove|onMouseMove|pointermove|mousemove|onMouseEnter|onPointerEnter/);
  const AI_SRC = read('./search/Ai.tsx');
  assert.match(AI_SRC, /new ResizeObserver\(measure\)/);
  assert.match(AI_SRC, /ro\.disconnect\(\)/);
});

test('BUG-04/05: on phones the evidence button sits under the stage, and the card behind never shows its words', () => {
  assert.ok(SEARCH.indexOf('className={s.evidenceBtn}') > SEARCH.indexOf('className={s.scene}'));
  assert.match(SEARCH, /<\/div>\s*<\/div>\s*\{\/\* phones: the evidence opens as a sheet/);
  assert.doesNotMatch(CSS, /:is\([^)]*\.evidenceBtn[^)]*\) \{\s*position: absolute/);
  assert.match(
    CSS,
    /\.feed\[data-pos='back'\] :is\(\.feedTop, \.feedCopy\),\s*\.story\[data-pos='back'\] :is\(\.storyBar, \.storyLine, \.storyCta\) \{\s*visibility: hidden;/,
  );
});

test('BUG-06: animated figures and citation threads fade in place instead of sliding over neighbouring text', () => {
  assert.match(CSS, /\.gate b \{[^}]*animation: textIn/);
  for (const sel of ['answerCard', 'source', 'product', 'flow']) assert.doesNotMatch(CSS.split(`.${sel} {`)[1].split('}')[0], /popIn|draftIn|srcIn/, sel);
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

/* ------------------------------------------------------------------------------- V12 regressions */
const HEALTH_SRC = read('./search/Health.tsx');
const AI_SRC = read('./search/Ai.tsx');
const CONTENT_SRC = read('./search/Content.tsx');

test('V12-01: graph lines run between measured card edges in an open lane, never under a caption', () => {
  // sources sit in one lane with the marker before the label; lines leave from the marker and end at the target card's edge
  assert.match(CSS, /\.src \{[^}]*left: var\(--lane, 54%\);[^}]*transform: translate\(-14px, -50%\);/);
  assert.match(LINKS_SRC, /const x1 = dot\.left - b\.left - 3;/);
  assert.match(LINKS_SRC, /const x2 = t\.right - b\.left \+ 6;/);
  // crawl links go from card edge to card edge, measured without transforms
  assert.match(HEALTH_SRC, /offset geometry ignores transforms/);
  assert.match(HEALTH_SRC, /const x1 = a\.r \+ 4;/);
  // lines are measured on layout changes only, and every graph paints beneath its cards
  for (const src of [LINKS_SRC, HEALTH_SRC, AI_SRC]) assert.match(src, /new ResizeObserver\(measure\)/);
  assert.match(AI_SRC, /first in the DOM, so every card paints above the lines/);
  // a draft hides the graph instead of sitting on top of live lines
  assert.match(CSS, /\.links\[data-draft\] \.graph \{\s*visibility: hidden;/);
  // entrances fade in place, so measured ends never drift
  for (const sel of ['src', 'siteNode', 'rivalNode']) assert.doesNotMatch(CSS.split(`\n.${sel} {`)[1]?.split('}')[0] ?? '', /srcIn|siteIn|popIn/, sel);
});

test('V12-02: the AI scene says what was asked, which sources are cited, what is missing, what is prepared and what comes next', () => {
  assert.equal(AI_COPY.ask, 'AI shopping question');
  assert.match(AI_SRC, /'Cited source'/);
  assert.match(AI_SRC, /'Brand mentioned, not cited'/);
  assert.match(AI_SRC, /'Not cited in this checked example'/);
  assert.equal(AI_QUESTIONS[0].sources.filter((x) => x.state === 'cited').length, 2);
  assert.match(AI_SRC, /'Draft · awaiting approval'/);
  assert.match(AI_SRC, /'Ready to publish after review'/);
  assert.match(AI_COPY.recheckShort, /needs a connected source/);
  // the reveal order and its timing (question, sources, lines, product page, finding)
  assert.match(AI_SRC, /animationDelay: `\$\{300 \+ i \* 80\}ms`/);
  assert.match(AI_SRC, /animationDelay: `\$\{500 \+ i \* 100\}ms`/);
  assert.match(CSS, /\.product \{[^}]*animation: textIn 400ms linear 1300ms backwards;/);
  assert.match(CSS, /\.finding \{[^}]*animation: textIn 360ms linear 1700ms backwards;/);
});

test('V12-03: keyword research is a visible chain, with each data source beside the step it feeds and its true status', () => {
  assert.deepEqual(
    INTENTS.map((i) => i.label),
    ['Buy', 'Compare', 'Learn', 'Nearby'],
  );
  for (const [id, job] of [
    ['gsc', 'Your own searches'],
    ['semrush', 'Demand'],
    ['ahrefs', 'Competitor pages'],
  ])
    assert.match(CONTENT_SRC, new RegExp(`<Source id="${id}" job="${job}" />`));
  assert.equal(AVAILABILITY_LABEL.unlisted, 'Not currently supported');
  assert.equal(AVAILABILITY_LABEL.connect, 'Available to connect');
  assert.match(CONTENT_SRC, /Needs your approval → publish → check results after publishing/);
  assert.match(CONTENT_SRC, /Also cited in the AI answer/);
  assert.doesNotMatch(CONTENT_SRC, /Connected and authorized|Ahrefs analyzed|Semrush analyzed/);
});

test('S03 headline remains concise, its supporting copy stays approved, and the V12 background is preserved', () => {
  assert.equal(COPY.title, 'Turn visibility into customers.');
  assert.match(CSS, /white-space: nowrap;/);
  assert.match(CSS, /\.titleAccent \{/);
  assert.match(SHELL, /className=\{s\.titleAccent\}/);
  assert.equal(COPY.lede, 'Xroga spots gaps in search and AI answers, prepares content and campaigns, and helps turn more visitors into customers.');
  assert.equal(COPY.search.line, 'See why customers can’t find you');
  assert.equal(COPY.growth.line, 'Reach the right people. Win more customers.');
  assert.match(CSS, /--ink: #142236;/);
  assert.match(CSS, /linear-gradient\(145deg, #142639 0%, #182b3d 37%, #23283b 73%, #282735 100%\)/);
  assert.match(CSS, /radial-gradient\(70% 52% at 105% 16%, rgba\(120, 101, 172, 0\.24\), transparent 74%\)/);
  assert.match(CSS, /\.title\.title::after \{/);
  // the homepage stylesheet clears section backgrounds; S03 re-asserts the same layers with higher specificity so they render
  assert.match(CSS, /\.section\.section\.section \{\s*background-color: #142639 !important;\s*background-image:/);
  assert.match(CSS, /linear-gradient\(145deg, #142639 0%, #182b3d 37%, #23283b 73%, #282735 100%\) !important;/);
  // Preserve the approved V12 backdrop without adding a competing full-section effect.
  assert.doesNotMatch(CSS + SHELL, /titleMark|titleSweep|data-lit=/);
  assert.doesNotMatch(CSS, /\.section::before|\.section::after/);
});

test('the heading sequence plays once in ~3.2 s: visibility lit, three cues, a connector, then the customers highlight', () => {
  // the heading text itself is unchanged and fully readable; the two words are only wrapped
  assert.equal(COPY.titleLead, 'visibility');
  assert.ok(COPY.title.includes(COPY.titleLead));
  assert.deepEqual(COPY.cues, ['Search', 'AI answers', 'Campaigns']);
  assert.match(SHELL, /className=\{s\.titleLead\}>\{COPY\.titleLead\}</);
  assert.match(SHELL, /<ul className=\{s\.cues\} aria-label="Where Xroga helps">/);
  assert.match(SHELL, /<li className=\{s\.cueLine\} aria-hidden="true" \/>/);
  // order and timing: lead 0–760 ms, cues at 650/900/1150 ms, connector 1450–2310 ms, payoff 2250–3170 ms
  assert.match(CSS, /\.section\[data-title-seen\] \.titleLead \{\s*animation: s03TitleLead 760ms/);
  for (const [i, ms] of [
    [0, 650],
    [1, 900],
    [2, 1150],
  ])
    assert.match(CSS, new RegExp(`\\.cue\\[data-cue='${i}'\\] \\{\\s*animation-delay: ${ms}ms;`));
  assert.match(CSS, /animation: s03CueLine 860ms cubic-bezier\(0\.65, 0, 0\.35, 1\) 1450ms both;/);
  assert.match(CSS, /animation: s03TitleHighlight 920ms var\(--ease\) 2250ms both;/);
  // no looping, no layout properties animated
  const keyframes = CSS.match(/@keyframes s03(TitleLead|CueIn|CueLine|CueTip|TitleHighlight) \{[\s\S]*?\n\}/g) ?? [];
  assert.equal(keyframes.length, 5);
  for (const k of keyframes) assert.doesNotMatch(k, /\b(width|height|top|left|margin|padding|font-size|letter-spacing)\s*:/, k.slice(0, 40));
  assert.doesNotMatch(CSS, /s03(TitleLead|CueIn|CueLine|CueTip|TitleHighlight)[^;]*infinite/);
  // cues are hidden before the sequence only when script runs and motion is allowed; reduced motion shows the final state
  assert.match(SHELL, /setTitleReady\(!reduced\)/);
  assert.match(CSS, /\.section\[data-title-ready\]:not\(\[data-title-seen\]\) \.cue,/);
});
