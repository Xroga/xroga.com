import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { browserPhase, demoReducer, initialState } from './engine';
import { AWAY_BEATS, COPY, EMPLOYEES, INTRO_MS, MISSIONS, stepDurations, stepsOf } from './script';
import { initialWorkforce, workforceReducer, type WfAction, type WfState } from './workforce';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const MISSION_SRC = read('./Missions.tsx');
const WORKFORCE_SRC = read('./Workforce.tsx');
const DESK_SRC = read('./Workspaces.tsx');
const THEATER = read('./Theater.tsx');
const COMPANION = read('./Companion.tsx');
const SHELL = read('./S02Work.tsx');
const MOTION = read('./motion.tsx');
const CLOCK = read('./useDemoClock.ts');
const CSS_FILES = ['./S02.module.css', './Theater.module.css', './Missions.module.css', './Workforce.module.css', './Workspaces.module.css', './Companion.module.css', './Motion.module.css'];
const CSS = CSS_FILES.map(read);
const PAGE = read('../../homepage/HomepageClient.tsx');
const has = (src: string, target: string) => src.includes(`t="${target}"`) || src.includes(`'${target}'`);
const ALL_COPY = JSON.stringify({ MISSIONS, EMPLOYEES, COPY, AWAY_BEATS }) + MISSION_SRC + WORKFORCE_SRC + DESK_SRC + THEATER;
const run = (s: WfState, ...as: WfAction[]) => as.reduce(workforceReducer, s);

/* ===================================================================================== browser automation */
test('four browser missions: every action and finding lands on an element its app renders', () => {
  assert.deepEqual(
    MISSIONS.map((m) => m.label),
    ['Find a website bug', 'Prepare a Google Ad', 'Ship a Chrome extension', 'Prepare an article'],
  );
  for (const m of MISSIONS) {
    for (const st of m.steps) {
      const at = `${m.id}/${st.id}`;
      if (st.act !== 'none') assert.ok(st.t && has(MISSION_SRC, st.t), `${at} acts on a rendered target`);
      if (st.act === 'type') assert.ok(st.typed, `${at} types something`);
      if (st.pin) assert.ok(has(MISSION_SRC, st.pin.at), `${at} the finding is pinned to a rendered element`);
      if (st.pin?.until) assert.ok(m.steps.some((x) => x.id === st.pin!.until), `${at} resolves on a real step`);
    }
    assert.equal(m.steps.at(-1)!.act, 'none', `${m.id} settles and holds`);
    assert.ok(m.outcome.lines.length >= 3 && m.outcome.gate, `${m.id} has an inspectable result`);
    const total = stepDurations(`browser:${m.id}`).slice(0, -1).reduce((a, b) => a + b, 0);
    assert.ok(total <= 9000, `${m.id} plays in ${total}ms: a short demonstration, not a video`);
  }
  for (const fn of ['BugApp', 'AdsApp', 'ExtensionApp', 'ArticleApp']) assert.match(MISSION_SRC, new RegExp(`function ${fn}`));
  // the ads mission prepares a proper campaign: negative keywords and pre-flight checks before approval
  const ads = MISSIONS.find((m) => m.id === 'ads')!.steps.map((s) => s.id);
  assert.ok(ads.indexOf('negatives') > 0 && ads.indexOf('checks') < ads.indexOf('publish'));
});

test('browser approvals: spend, publish and store submission stop at the visitor; the bug hunt changes nothing', () => {
  const m = (id: string) => MISSIONS.find((x) => x.id === id)!;
  assert.match(m('ads').outcome.gate, /no money spent/i);
  assert.match(m('ads').outcome.gate, /not published/i);
  assert.match(m('extension').outcome.gate, /waits for you/i);
  assert.match(m('article').outcome.gate, /waits for you/i);
  assert.match(m('bug').outcome.gate, /nothing .* changed/i);
  assert.doesNotMatch(MISSION_SRC, />\s*(Publish now|Go live|Launch campaign|Pay now)\s*</);
  assert.match(MISSION_SRC, /Waiting for your approval/);
});

test('browser engine: a mission plays once, holds its result, replays on request; stale timers are ignored', () => {
  let s = initialState();
  assert.equal(s.track, 'browser:bug');
  assert.equal(browserPhase(s, false), 'ready');
  const stale = s.gen;
  s = demoReducer(s, { type: 'select', track: 'browser:ads' });
  assert.equal(demoReducer(s, { type: 'advance', gen: stale }), s);
  s = demoReducer(s, { type: 'advance', gen: s.gen });
  assert.equal(browserPhase(s, true), 'working');
  for (let i = 0; i < stepsOf('browser:ads').length; i++) s = demoReducer(s, { type: 'advance', gen: s.gen });
  assert.equal(s.track, 'browser:ads', 'no automatic switching to another mission');
  assert.equal(s.ended, true);
  assert.equal(browserPhase(s, true), 'approval-pending');
  s = demoReducer(s, { type: 'replay' });
  assert.equal(s.step, 0);
});

/* ======================================================================================== AI workforce */
test('six employees: distinct responsibility, colour, motion, schedule, deliverable and desk', () => {
  assert.deepEqual(
    EMPLOYEES.map((e) => e.name),
    ['Software Builder', 'Growth Strategist', 'Research Analyst', 'Creative Producer', 'Data Specialist', 'Operations Manager'],
  );
  for (const key of ['accent', 'idle', 'short', 'role'] as const) {
    assert.equal(new Set(EMPLOYEES.map((e) => e[key])).size, 6, `every employee has its own ${key}`);
  }
  assert.equal(new Set(EMPLOYEES.map((e) => e.assignment.triggers[0])).size, 6, 'six different schedules');
  assert.equal(new Set(EMPLOYEES.map((e) => e.assignment.deliver)).size, 6, 'six different deliverables');
  // six different desk skeletons, not one dashboard re-skinned
  for (const fn of ['Builder', 'Growth', 'Research', 'Creative', 'Data', 'Ops']) assert.match(DESK_SRC, new RegExp(`function ${fn}\\(`));
  for (const root of ['k.repo', 'k.crm', 'k.research', 'k.studio', 'k.data', 'k.ops']) assert.ok(DESK_SRC.includes(`className={${root}}`), root);
  // the founder's glass X character, tinted once per role (one file per employee and size)
  assert.match(COMPANION, /\/homepage\/s02\/employees\/x-\$\{e\.id\}-/);
  for (const e of EMPLOYEES) for (const px of [256, 512]) assert.ok(existsSync(new URL(`../../../../public/homepage/s02/employees/x-${e.id}-${px}.webp`, import.meta.url)), `${e.id} ${px}`);
});

test('every employee does real work overnight: inputs, runs, a saved deliverable and a decision for you', () => {
  for (const e of EMPLOYEES) {
    const kinds = e.away.map((b) => b.kind);
    assert.ok(kinds.includes('run'), `${e.id} works`);
    assert.ok(kinds.includes('deliver') || kinds.includes('handoff'), `${e.id} delivers`);
    assert.equal(kinds.filter((k) => k === 'decision').length, e.ret.decisions, `${e.id} decisions match the timeline`);
    for (const b of e.away) assert.ok(b.at >= 0 && b.at + b.len <= 24, `${e.id} ${b.label} sits inside Mon 18:00 → Tue 18:00`);
    assert.ok(e.ret.changed.length === 3 && e.ret.artifact.title && e.ret.decision.question && e.ret.next, `${e.id} return summary`);
    assert.ok(e.assignment.approvals.length >= 2, `${e.id} has approval boundaries`);
  }
});

test('the time away is deterministic: a fixed reference clock from Mon 17:42 to Tue 18:00', () => {
  assert.equal(AWAY_BEATS[0].clock, 'Mon 17:42');
  assert.equal(AWAY_BEATS.at(-1)!.clock, 'Tue 18:00');
  AWAY_BEATS.slice(1).forEach((b, i) => assert.ok(b.hour > AWAY_BEATS[i].hour, 'hours only move forward'));
  assert.equal(AWAY_BEATS.at(-1)!.hour, 24);
  assert.doesNotMatch(read('./workforce.ts'), /Date\.now|new Date|performance\.now/, 'no real elapsed time');
  assert.ok(INTRO_MS <= 3000, 'team entrance is 2-3 s');
});

test('the workforce lifecycle: team → assignment (two steps) → away → back to results', () => {
  let s = initialWorkforce();
  assert.equal(s.view, 'team');
  assert.equal(s.intro, 'pending');
  s = run(s, { type: 'intro-done' }, { type: 'open', id: 'ops' });
  assert.equal(s.view, 'assignment');
  assert.equal(s.sheet, 0);
  s = run(s, { type: 'trigger', index: 1 }, { type: 'sheet', step: 1 }, { type: 'tool', index: 4 }, { type: 'approval', index: 2 });
  assert.equal(s.config.ops.trigger, 1);
  assert.equal(s.config.ops.tools[4], true);
  assert.equal(s.config.ops.approvals[2], false);
  s = run(s, { type: 'preview' });
  assert.equal(s.view, 'away');
  assert.equal(s.tasks.ops.source, 'you');
  assert.equal(s.tasks.ops.assignedAt, 'Mon 17:42');
  for (let i = 0; i < AWAY_BEATS.length; i++) s = run(s, { type: 'tick', gen: s.gen });
  assert.equal(s.view, 'workspace');
  assert.equal(s.returned, true);
  // every task advanced from the reference clock, not just the assigned one
  for (const e of EMPLOYEES) {
    const t = s.tasks[e.id];
    assert.equal(t.nextRun, e.ret.next);
    assert.deepEqual(t.artifacts, [e.ret.artifact.title]);
    assert.equal(t.approvalNeeded, e.ret.decisions);
    assert.equal(t.status, 'review');
    assert.match(t.lastActivity, /^Tue \d\d:\d\d$/);
  }
  assert.equal(s.tasks.builder.source, 'standing');
  // a stale tick from before the return is ignored
  assert.equal(run(s, { type: 'tick', gen: 0 }), s);
});

test('after the return any employee opens straight to results; the entrance never replays; decisions stay local', () => {
  let s = run(initialWorkforce(), { type: 'open', id: 'research' }, { type: 'preview' }, { type: 'skip' });
  assert.equal(s.view, 'workspace');
  s = run(s, { type: 'inspect', id: 'growth' });
  assert.equal(s.view, 'workspace');
  assert.equal(s.selected, 'growth');
  s = run(s, { type: 'team' });
  assert.equal(s.intro, 'done');
  s = run(s, { type: 'decide', id: 'growth', value: 'approved' });
  assert.equal(s.decisions.growth, 'approved');
  assert.equal(s.tasks.growth.approvalNeeded, 0);
  assert.equal(s.tasks.growth.status, 'delivered');
  // before any time away, choosing a specialist opens their assignment instead of empty results
  assert.equal(run(initialWorkforce(), { type: 'inspect', id: 'data' }).view, 'assignment');
  assert.match(DESK_SRC, /nothing real was changed/);
});

test('the Research → Growth handoff is a dated document that lands on Growth’s board', () => {
  const research = EMPLOYEES.find((e) => e.id === 'research')!;
  const growth = EMPLOYEES.find((e) => e.id === 'growth')!;
  const sent = research.away.find((b) => b.kind === 'handoff')!;
  const received = growth.away.find((b) => b.kind === 'arrive')!;
  assert.ok(sent && received && received.at > sent.at, 'Growth starts after Research hands over');
  assert.match(growth.assignment.triggers[0], /Research delivers a brief/);
  assert.match(WORKFORCE_SRC, /Brief #7 · Research → Growth · 06:10/);
  assert.match(DESK_SRC, /from Research Analyst · Tue 06:10/);
  assert.match(DESK_SRC, /Brief #7 → Growth Strategist/);
});

test('the two modes are different experiences: no pointer, app dock or browser window in AI Employees', () => {
  assert.doesNotMatch(WORKFORCE_SRC + DESK_SRC, /Pointer|usePush|from '\.\/motion'|MISSION_APPS/);
  assert.match(THEATER, /mode === 'browser' \?[\s\S]*<Dock[\s\S]*: \(\s*<Workforce /);
  // switching modes keeps both states: two separate reducers in the shell
  assert.match(SHELL, /useDemoClock\(root, reduced, mode === 'browser'\)/);
  assert.match(SHELL, /useReducer\(workforceReducer/);
});

/* ================================================================================ shared quality bars */
test('clocks run only on screen and visible; nothing moves the page', () => {
  assert.match(CLOCK, /IntersectionObserver/);
  assert.match(CLOCK, /visibilitychange|document\.hidden/);
  assert.match(SHELL, /wfLive = mode === 'workforce' && onScreen && !hidden/);
  assert.doesNotMatch(SHELL + THEATER + MOTION + WORKFORCE_SRC, /scrollIntoView|scrollTo\(/);
  assert.match(SHELL, /preventScroll: true/);
  for (const [i, css] of CSS.entries()) if (/animation|transition/.test(css)) assert.match(css, /prefers-reduced-motion: reduce/, CSS_FILES[i]);
});

test('one compact section: one disclosure, one concept tag, one CTA, no video or player chrome', () => {
  assert.equal(COPY.disclosure, 'Illustrative experience · sample data');
  assert.equal((SHELL.match(/COPY\.disclosure/g) ?? []).length, 1);
  assert.equal((WORKFORCE_SRC.match(/COPY\.conceptTag/g) ?? []).length, 1);
  assert.equal((SHELL.match(/<Link /g) ?? []).length, 1);
  assert.match(SHELL, /'\/workspace' : '\/auth\/signup'/);
  assert.doesNotMatch(ALL_COPY, /<video|autoPlay|>Pause<|scrubber/);
  assert.match(PAGE, /<S02Work loggedIn=\{loggedIn\} \/>/);
});

test('truthful copy: concept preview, simulation only, fictional domains, no live-autonomy claims', () => {
  assert.doesNotMatch(ALL_COPY, /24\/7|fully autonomous|guarantee|100% accurate|replaces your team|no human needed|always on/i);
  const domains = ALL_COPY.match(/\b[a-z0-9-]+\.(com|io|net|org|co)\b/gi) ?? [];
  assert.deepEqual(domains, [], `only .example domains appear: ${domains.join(', ')}`);
  assert.match(WORKFORCE_SRC, /Simulation only · nothing is created or contacted/);
  assert.match(WORKFORCE_SRC, /in the product vision, on Xroga’s servers/);
  assert.equal(COPY.conceptTag, 'Concept preview');
});

test('accessibility: tabs, real buttons and checkboxes, labelled regions, decorative companions', () => {
  assert.match(SHELL, /role="tablist"/);
  assert.match(SHELL, /aria-selected=/);
  assert.match(THEATER, /aria-label="Choose a browser mission"/);
  assert.match(WORKFORCE_SRC, /aria-pressed=\{c\.trigger === i\}/);
  assert.match(WORKFORCE_SRC, /type="checkbox"/);
  assert.match(WORKFORCE_SRC, /aria-label="Your AI workforce"/);
  assert.match(WORKFORCE_SRC, /role="img" aria-label=\{`Team activity/);
  assert.match(COMPANION, /aria-hidden="true"/);
  for (const css of CSS) assert.doesNotMatch(css, /outline:\s*none/);
});
