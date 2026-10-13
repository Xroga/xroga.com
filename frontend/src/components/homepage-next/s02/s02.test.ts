import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { demoReducer, initialState, type DemoState } from './engine';
import { COPY, EMPLOYEES, FORBIDDEN_CLAIMS, MISSIONS, TEAM_STEPS, stepDurations, stepsOf } from './script';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const APPS = read('./Apps.tsx');
const THEATER = read('./Theater.tsx');
const TEAM = read('./Team.tsx');
const SHELL = read('./S02Work.tsx');
const MOTION = read('./motion.tsx');
const XMARK = read('./XMark.tsx');
const CLOCK = read('./useDemoClock.ts');
const CSS_FILES = ['./S02.module.css', './Theater.module.css', './Apps.module.css', './Team.module.css', './Motion.module.css', './XMark.module.css'];
const CSS = CSS_FILES.map(read);
const PAGE = read('../../homepage/HomepageClient.tsx');
const rendered = (target: string) => APPS.includes(`data-t="${target}"`) || APPS.includes(`'data-t': '${target}'`);

test('four browser missions: every action lands on a rendered element and each ends on a result', () => {
  assert.deepEqual(MISSIONS.map((m) => m.label), ['Find a website bug', 'Prepare a Google Ad', 'Publish an article', 'Publish a Chrome extension']);
  for (const m of MISSIONS) {
    m.steps.forEach((st) => {
      const at = `${m.id}/${st.stepId}`;
      if (st.action !== 'none') assert.ok(st.target && rendered(st.target), `${at} acts on a rendered target`);
      if (st.action === 'type') assert.ok(st.typed, at);
      if (st.note) assert.ok(rendered(st.note.at), `${at} the finding is pinned to a rendered element`);
      assert.ok(st.ms >= 600 && st.ms <= 4200, `${at} ${st.ms}ms`);
    });
    const end = m.steps.at(-1)!;
    assert.equal(end.action, 'none', `${m.id} settles`);
    assert.ok(end.ms >= 4000, `${m.id} the result is held`);
    assert.ok(m.result.lines.length >= 3 && m.result.gate, `${m.id} result`);
    const total = stepDurations(`browser:${m.id}`).slice(0, -1).reduce((a, b) => a + b, 0);
    assert.ok(total <= 11000, `${m.id} plays in ${total}ms: a short demonstration, not a video`);
  }
  // human gates: spend, publish and store submission wait for the visitor; the bug hunt changes nothing
  assert.equal(MISSIONS.find((m) => m.id === 'ads')!.result.state, 'approval');
  assert.match(MISSIONS.find((m) => m.id === 'ads')!.result.gate, /no money spent/);
  assert.match(MISSIONS.find((m) => m.id === 'article')!.result.gate, /not published/);
  assert.match(MISSIONS.find((m) => m.id === 'extension')!.result.lines.map((l) => l.text).join(' '), /it is not publication/);
  assert.match(MISSIONS.find((m) => m.id === 'bug')!.result.gate, /Nothing was changed/);
  // the four missions are four different applications
  for (const fn of ['BugApp', 'AdsApp', 'ArticleApp', 'ExtensionApp']) assert.match(APPS, new RegExp(`function ${fn}\\(`));
  assert.match(APPS, /POST<\/b>\/api\/invites<em>403/);
});

test('six AI Employees: distinct professions, apps and deliverables, each with the authentic X', () => {
  assert.deepEqual(EMPLOYEES.map((e) => e.name), ['Product Engineer', 'Research Analyst', 'Client Acquisition', 'Creative Producer', 'Data & Finance', 'Operations Manager']);
  assert.equal(new Set(EMPLOYEES.map((e) => e.app)).size, 6, 'six different apps');
  assert.equal(new Set(EMPLOYEES.map((e) => e.deliverable.title)).size, 6);
  for (const e of EMPLOYEES) {
    assert.ok(existsSync(new URL(`../../../../public/homepage/s02/x-${e.id}.webp`, import.meta.url)), `${e.id} X asset`);
    assert.equal(e.steps[0].stepId, 'assign');
    for (const st of e.steps) if (st.action !== 'none') assert.ok(st.target && rendered(st.target), `${e.id}/${st.stepId} target rendered`);
    for (const st of e.steps) if (st.note) assert.ok(rendered(st.note.at), `${e.id}/${st.stepId} note anchored`);
  }
  assert.match(XMARK, /\/homepage\/s02\/x-\$\{id\}\.webp/);
  for (const fn of ['EngineerApp', 'ResearchApp', 'AcquisitionApp', 'CreativeApp', 'DataApp', 'OpsApp']) assert.match(APPS, new RegExp(`function ${fn}\\(`));
  for (const st of ['assigned', 'working', 'handoff', 'approval', 'done']) assert.ok(CSS[5].includes(`'${st}'`), `X state ${st} is styled`);
});

test('one handoff: the Research Analyst sends the brief and Client Acquisition starts from it', () => {
  const research = EMPLOYEES.find((e) => e.id === 'research')!;
  const acq = EMPLOYEES.find((e) => e.id === 'acquisition')!;
  assert.deepEqual(research.sends, { title: 'Opportunity brief', to: 'acquisition' });
  assert.equal(acq.receives, 'Opportunity brief');
  assert.match(acq.deliverable.lines[0].text, /Harbor district brief/, 'the recipient visibly uses the brief');
  assert.match(THEATER, /data-in=""/);
  assert.match(THEATER, /data-out=""/);
  assert.match(SHELL, /setBriefReady\(true\)/);
});

test('the team enters once, staggered, then waits for the visitor', () => {
  assert.equal(initialState().lastByMode.employees, 'emp:team');
  assert.equal(TEAM_STEPS.length, 1);
  assert.ok(TEAM_STEPS[0].ms >= 1500 && TEAM_STEPS[0].ms <= 2500);
  assert.match(CSS[3], /calc\(480ms \+ var\(--i\) \* 100ms\)/, '100ms staggered starts');
  assert.match(TEAM, /aria-label=\{`Open \$\{e\.name\}/);
  assert.match(TEAM, /aria-pressed=\{active === e\.id\}/);
});

const run = (s: DemoState, n: number) => {
  for (let i = 0; i < n; i++) s = demoReducer(s, { type: 'advance', gen: s.gen });
  return s;
};

test('one timeline: a choice plays once and holds its result; stale timers are ignored', () => {
  let s = run(initialState(), 2);
  const stale = s.gen;
  s = demoReducer(s, { type: 'select', track: 'browser:ads' });
  assert.equal(demoReducer(s, { type: 'advance', gen: stale }), s);
  s = run(s, stepsOf('browser:ads').length + 3);
  assert.equal(s.track, 'browser:ads', 'nothing chains to another scene');
  assert.equal(s.step, stepsOf('browser:ads').length - 1);
  assert.equal(s.ended, true);
  const m = demoReducer(s, { type: 'mode', mode: 'employees' });
  assert.equal(m.track, 'emp:team');
  const back = demoReducer(demoReducer(m, { type: 'select', track: 'emp:data' }), { type: 'mode', mode: 'browser' });
  assert.equal(back.track, 'browser:ads', 'each mode returns to its last choice');
  assert.equal(demoReducer(back, { type: 'mode', mode: 'employees' }).track, 'emp:data');
  const again = demoReducer(s, { type: 'replay' });
  assert.equal(again.step, 0);
  assert.equal(again.ended, false);
});

test('no pause, replay or progress chrome; contextual controls only after the work settles', () => {
  assert.doesNotMatch(SHELL, /Pause demonstration|Replay from|s\.progress|Previous step/);
  assert.doesNotMatch(SHELL + THEATER, /\bPlan\b|\bVerify\b|\bDeliver\b/);
  assert.match(THEATER, /\{last && \(\s*<div className=\{t\.after\}>/);
  assert.match(THEATER, /Show the work/);
  assert.match(THEATER, /Watch again/);
  assert.match(CLOCK, /const running = !reduced && onScreen && !hidden && !state\.paused && !state\.ended;/);
});

test('the layout is compact: one stage of about 440 to 540px on desktop and fixed bands', () => {
  assert.match(CSS[0], /height: clamp\(440px, calc\(100svh - 360px\), 520px\)/);
  assert.match(CSS[0], /\.selector \{[^}]*min-height: 56px/);
  assert.match(CSS[0], /transition: transform 220ms/, 'mode pill 180 to 260ms');
  assert.match(CSS[0], /animation: swap 450ms/, 'stage swap 350 to 550ms');
  assert.match(CSS[1], /scale\(1\.08\)/, 'camera push 1.05 to 1.12');
  assert.match(CSS[4], /animation: press 1\d\dms/, 'click impulse');
});

test('nothing moves the page or steals focus; motion stays on the compositor', () => {
  for (const src of [APPS, THEATER, TEAM, SHELL, MOTION, CLOCK]) {
    assert.doesNotMatch(src, /scrollIntoView|window\.scroll|scrollTo\(|document\.documentElement\.scroll/);
    for (const m of src.matchAll(/\.focus\(([^)]*)\)/g)) assert.match(m[1], /preventScroll: true/);
  }
  CSS.forEach((css, i) => {
    for (const kf of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\s*\}?/g)) assert.doesNotMatch(kf[1], /\b(top|left|right|bottom|width|height|margin)\s*:/, `${CSS_FILES[i]} ${kf[0].slice(0, 50)}`);
    for (const m of css.matchAll(/animation:[^;]*infinite[^;]*;([^}]*)\}/g)) assert.match(m[1], /animation-play-state: paused/, m[0].slice(0, 60));
    assert.doesNotMatch(css, /backdrop-filter:\s*blur/);
  });
});

test('one section, scoped styles, truthful copy, real CTA routes', () => {
  assert.equal((PAGE.match(/<S02Work /g) ?? []).length, 1);
  const s01 = PAGE.indexOf('<S01CapabilityDeck />');
  const s02 = PAGE.indexOf('<S02Work loggedIn={loggedIn} />');
  assert.ok(s01 < s02 && s02 < PAGE.indexOf('<HomepagePowerStories />'));
  for (const css of CSS) assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /^(html|body|h[1-6]|header|nav|main|\.xv-)/m);
  assert.equal(COPY.eyebrow, 'XROGA IN ACTION');
  assert.equal(COPY.title, 'Give the work to Xroga. Watch it happen.');
  assert.deepEqual(COPY.modes, { browser: 'Browser Automation', employees: 'AI Employees' });
  assert.match(COPY.availability, /in development/);
  assert.match(COPY.illustrative, /Illustrative/);
  assert.doesNotMatch(JSON.stringify({ MISSIONS, EMPLOYEES }), FORBIDDEN_CLAIMS);
  assert.doesNotMatch(APPS + THEATER + TEAM, FORBIDDEN_CLAIMS);
  for (const src of [JSON.stringify({ MISSIONS, EMPLOYEES, COPY }), APPS, THEATER, TEAM, SHELL]) assert.doesNotMatch(src, /[–—]/);
  assert.match(SHELL, /href=\{loggedIn \? '\/workspace' : '\/auth\/signup'\}/);
  assert.ok(existsSync(new URL('../../../app/auth/signup', import.meta.url)));
});

test('accessibility: tabs, labelled controls, mock apps out of the tab order, reduced motion', () => {
  assert.match(SHELL, /role="tablist"/);
  assert.match(SHELL, /aria-pressed=\{state\.track === `browser:\$\{x\.id\}`\}/);
  assert.match(SHELL, /aria-live="polite"/);
  assert.match(THEATER, /aria-hidden="true" \{\.\.\.inertIf\(true\)\}/);
  assert.doesNotMatch(APPS, /<button|<a /);
  for (const css of CSS) if (/animation/.test(css)) assert.match(css, /prefers-reduced-motion: reduce/);
});
