import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { demoReducer, initialState, type DemoState } from './engine';
import { COPY, EMPLOYEES, FEATURED, MISSIONS, TEAM_STEPS, THEN, stepDurations, stepsOf } from './script';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const MISSION_SRC = read('./Missions.tsx');
const WORK_SRC = read('./Workspaces.tsx');
const THEATER = read('./Theater.tsx');
const COMPANION = read('./Companion.tsx');
const SHELL = read('./S02Work.tsx');
const MOTION = read('./motion.tsx');
const CLOCK = read('./useDemoClock.ts');
const CSS_FILES = ['./S02.module.css', './Theater.module.css', './Missions.module.css', './Workspaces.module.css', './Companion.module.css', './Motion.module.css'];
const CSS = CSS_FILES.map(read);
const PAGE = read('../../homepage/HomepageClient.tsx');
const has = (src: string, target: string) => src.includes(`t="${target}"`) || src.includes(`'${target}'`);
const ALL_COPY = JSON.stringify({ MISSIONS, EMPLOYEES, COPY }) + MISSION_SRC + WORK_SRC + THEATER;

test('four browser missions: every action and finding lands on an element its app renders', () => {
  assert.deepEqual(
    MISSIONS.map((m) => m.label),
    ['Find a website bug', 'Prepare a Google Ad', 'Publish a Chrome extension', 'Prepare an article'],
  );
  for (const m of MISSIONS) {
    for (const st of m.steps) {
      const at = `${m.id}/${st.id}`;
      if (st.act !== 'none') assert.ok(st.t && has(MISSION_SRC, st.t), `${at} acts on a rendered target`);
      if (st.act === 'type') assert.ok(st.typed, `${at} types something`);
      if (st.pin) assert.ok(has(MISSION_SRC, st.pin.at), `${at} the finding is pinned to a rendered element`);
      if (st.pin?.until) assert.ok(m.steps.some((x) => x.id === st.pin!.until), `${at} resolves on a real step`);
      assert.ok(st.ms >= 800 && st.ms <= 5200, `${at} ${st.ms}ms`);
    }
    const end = m.steps.at(-1)!;
    assert.equal(end.act, 'none', `${m.id} settles`);
    assert.ok(end.ms >= 4000, `${m.id} the result is held`);
    assert.ok(m.outcome.lines.length >= 3 && m.outcome.gate, `${m.id} has an inspectable result`);
    const total = stepDurations(`browser:${m.id}`).slice(0, -1).reduce((a, b) => a + b, 0);
    assert.ok(total <= 9000, `${m.id} plays in ${total}ms: a short demonstration, not a video`);
  }
  // four different tools, not one dashboard reskinned
  for (const fn of ['BugApp', 'AdsApp', 'ExtensionApp', 'ArticleApp']) assert.match(MISSION_SRC, new RegExp(`function ${fn}`));
});

test('approvals: spend, publish and store submission stop at the visitor; the bug hunt changes nothing', () => {
  const m = (id: string) => MISSIONS.find((x) => x.id === id)!;
  assert.match(m('ads').outcome.gate, /no money spent/i);
  assert.match(m('ads').outcome.gate, /not published/i);
  assert.match(m('extension').outcome.gate, /waits for you/i);
  assert.match(m('article').outcome.gate, /waits for you/i);
  assert.match(m('bug').outcome.gate, /nothing .* changed/i);
  for (const id of ['ads', 'extension', 'article']) assert.equal(m(id).outcome.state, 'approval');
  // the final buttons ask for approval; none presents publish, pay or launch as done
  assert.doesNotMatch(MISSION_SRC, />\s*(Publish now|Go live|Launch campaign|Pay now)\s*</);
  assert.match(MISSION_SRC, /Waiting for your approval/);
});

test('six AI Employees: distinct colour, tie, idle signature, workspace and deliverable', () => {
  assert.deepEqual(
    EMPLOYEES.map((e) => e.name),
    ['Software Builder', 'Growth Strategist', 'Research Analyst', 'Creative Producer', 'Data Specialist', 'Operations Manager'],
  );
  for (const key of ['accent', 'tie', 'idle', 'app', 'short'] as const) {
    assert.equal(new Set(EMPLOYEES.map((e) => e[key])).size, 6, `every employee has its own ${key}`);
  }
  for (const e of EMPLOYEES) {
    for (const st of e.steps) {
      if (st.t) assert.ok(has(WORK_SRC, st.t), `${e.id}/${st.id} acts on a rendered target`);
      if (st.pin) assert.ok(has(WORK_SRC, st.pin.at), `${e.id}/${st.id} pin target is rendered`);
    }
    assert.ok(e.outcome.gate, `${e.id} states what waits for the visitor`);
  }
  for (const fn of ['BuilderApp', 'GrowthApp', 'ResearchApp', 'CreativeApp', 'DataApp', 'OpsApp']) assert.match(WORK_SRC, new RegExp(`function ${fn}`));
  // the authentic orb artwork, never redrawn; ties in six cuts
  assert.match(COMPANION, /companion-orb-512\.webp/);
  assert.ok(existsSync(new URL('../../../../public/homepage/s02/companion-orb-512.webp', import.meta.url)));
  assert.ok(existsSync(new URL('../../../../public/homepage/s02/companion-orb-256.webp', import.meta.url)));
  for (const tie of ['slim', 'striped', 'dotted', 'knit', 'clip']) assert.match(COMPANION, new RegExp(`${tie}:`));
  assert.match(COMPANION, /tie === 'bow'/);
});

test('one real handoff: the Research Analyst sends its brief and it arrives on the Growth board', () => {
  const research = EMPLOYEES.find((e) => e.id === 'research')!;
  assert.ok(research.steps.some((s) => s.id === 'handoff' && s.t === 'r.send'));
  assert.match(research.outcome.gate, /Growth Strategist/);
  assert.match(SHELL, /'handoff'\) setBriefSent\(true\)/);
  assert.match(WORK_SRC, /briefSent \? 'From Research Analyst'/);
  assert.match(THEATER, /e\.id === 'growth' && briefSent/);
});

test('the team enters in under two seconds, then the featured employee takes the computer', () => {
  const total = TEAM_STEPS.reduce((a, s) => a + s.ms, 0);
  assert.ok(total < 2100, `entrance ${total}ms`);
  assert.equal(THEN['emp:team'], `emp:${FEATURED}`);
  let s: DemoState = { ...initialState(false), track: 'emp:team', step: TEAM_STEPS.length - 1 };
  s = demoReducer(s, { type: 'advance', gen: s.gen });
  assert.equal(s.track, `emp:${FEATURED}`, 'hands over after the entrance');
  // a visitor who chooses Team keeps the lineup
  let v = demoReducer(initialState(false), { type: 'select', track: 'emp:team' });
  v = { ...v, step: TEAM_STEPS.length - 1 };
  v = demoReducer(v, { type: 'advance', gen: v.gen });
  assert.equal(v.track, 'emp:team');
  assert.equal(v.ended, true);
});

test('one timeline: a choice plays once and holds its result; stale timers are ignored', () => {
  let s = initialState(false);
  assert.equal(s.track, 'browser:bug');
  const stale = s.gen;
  s = demoReducer(s, { type: 'select', track: 'browser:ads' });
  assert.equal(demoReducer(s, { type: 'advance', gen: stale }), s, 'stale timer ignored');
  for (let i = 0; i < stepsOf('browser:ads').length; i++) s = demoReducer(s, { type: 'advance', gen: s.gen });
  assert.equal(s.track, 'browser:ads');
  assert.equal(s.ended, true, 'holds its result; nothing chains');
  s = demoReducer(s, { type: 'replay' });
  assert.equal(s.step, 0);
  assert.equal(s.ended, false);
  // switching modes returns to the last scene of that mode
  s = demoReducer(s, { type: 'mode', mode: 'employees' });
  assert.equal(s.track, 'emp:team');
  s = demoReducer(s, { type: 'mode', mode: 'browser' });
  assert.equal(s.track, 'browser:ads');
});

test('the clock runs only on screen and visible; motion never moves the page', () => {
  assert.match(CLOCK, /IntersectionObserver/);
  assert.match(CLOCK, /visibilitychange|document\.hidden/);
  assert.doesNotMatch(SHELL + THEATER + MOTION, /scrollIntoView|scrollTo\(/);
  assert.match(SHELL, /preventScroll: true/);
  for (const [i, css] of CSS.entries()) if (/animation|transition/.test(css)) assert.match(css, /prefers-reduced-motion: reduce/, CSS_FILES[i]);
});

test('one compact section: one disclosure, one CTA, no video or player chrome', () => {
  assert.equal(COPY.disclosure, 'Illustrative experience · sample data');
  assert.equal((SHELL.match(/COPY\.disclosure/g) ?? []).length, 1);
  assert.equal((SHELL.match(/<Link /g) ?? []).length, 1);
  assert.match(SHELL, /'\/workspace' : '\/auth\/signup'/);
  assert.doesNotMatch(ALL_COPY, /<video|autoPlay|>Pause<|scrubber/);
  assert.match(PAGE, /<S02Work loggedIn=\{loggedIn\} \/>/);
});

test('truthful copy: sample data, fictional domains, no claims of live autonomy or guaranteed results', () => {
  assert.doesNotMatch(ALL_COPY, /fully autonomous|guarantee|100% accurate|replaces your team|no human needed/i);
  const domains = ALL_COPY.match(/\b[a-z0-9-]+\.(com|io|net|org|co)\b/gi) ?? [];
  assert.deepEqual(domains, [], `only .example domains appear: ${domains.join(', ')}`);
  assert.match(MISSIONS.find((m) => m.id === 'extension')!.outcome.lines.map((l) => l.text).join(' '), /decided by Google/);
});

test('accessibility: tabs, labelled dock, companions decorative, hidden UI inert', () => {
  assert.match(SHELL, /role="tablist"/);
  assert.match(SHELL, /aria-selected=/);
  assert.match(THEATER, /'Choose a browser mission' : 'Choose an AI Employee'/);
  assert.match(THEATER, /aria-pressed=/);
  assert.match(COMPANION, /aria-hidden="true"/);
  assert.match(THEATER, /inertIf\(!show\)/);
  for (const css of CSS) assert.doesNotMatch(css, /outline:\s*none/);
});
