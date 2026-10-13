import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { browserPhase, demoReducer, initialState } from './engine';
import { COPY, MISSIONS, stepDurations, stepsOf } from './script';
import { EMPLOYEES, FIRST_EMPLOYEE, employeeOf, type EmployeeId } from './team';
import { busy, followupsOf, gateOf, initialWorkforce, norm, workforceReducer, type WfAction, type WfState } from './workforce';

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
const ALL_COPY = JSON.stringify({ MISSIONS, EMPLOYEES, COPY }) + MISSION_SRC + WORKFORCE_SRC + DESK_SRC + THEATER + SHELL;
const run = (s: WfState, ...as: WfAction[]) => as.reduce(workforceReducer, s);
/** Releases every queued beat of one thread, the way the section's timers would. */
const drain = (s: WfState, id: EmployeeId) => {
  for (let i = 0; i < 50 && busy(s.threads[id]); i++) s = workforceReducer(s, { type: 'tick', id, gen: s.threads[id].gen });
  return s;
};
/** Plays an employee's whole scripted story by sending each suggested message. */
const story = (s: WfState, id: EmployeeId) => {
  s = run(s, { type: 'select', id });
  for (let g = gateOf(id, s.threads[id]); g; g = gateOf(id, s.threads[id])) s = drain(run(s, { type: 'send', id, text: g.chip, manual: true }), id);
  return s;
};

/* ===================================================================================== browser automation */
test('four browser missions, in order, with the article demo replaced by prospecting and outreach', () => {
  assert.deepEqual(
    MISSIONS.map((m) => m.label),
    ['Find a Website Bug', 'Prepare a Google Ad', 'Ship a Chrome Extension', 'Find Clients & Prepare Outreach'],
  );
  assert.doesNotMatch(ALL_COPY, /Prepare an article|ArticleApp/);
});

test('every action, typed value and finding lands on an element its app renders', () => {
  for (const m of MISSIONS) {
    for (const st of m.steps) {
      const at = `${m.id}/${st.id}`;
      if (st.act !== 'none') assert.ok(st.t && has(MISSION_SRC, st.t), `${at} acts on a rendered target`);
      if (st.act === 'type') assert.ok(st.typed, `${at} types something`);
      if (st.pin) assert.ok(has(MISSION_SRC, st.pin.at), `${at} the finding is pinned to a rendered element`);
      if (st.pin?.until) assert.ok(m.steps.some((x) => x.id === st.pin!.until), `${at} resolves on a real step`);
    }
    assert.equal(m.steps.at(-1)!.act, 'none', `${m.id} settles and holds`);
    assert.ok(m.outcome.lines.length >= 4 && m.outcome.gate, `${m.id} has an inspectable result`);
    const total = stepDurations(`browser:${m.id}`).slice(0, -1).reduce((a, b) => a + b, 0);
    assert.ok(total >= 11000 && total <= 20000, `${m.id} plays in ${total}ms: deep enough to show the work, short enough to watch`);
  }
});

test('the missions go deep: failure → evidence → repair → retest; research → exclusions → checks; permissions → test → fix; qualify → reject → drafts', () => {
  const ids = (id: string) => MISSIONS.find((m) => m.id === id)!.steps.map((s) => s.id);
  const order = (id: string, seq: string[]) => seq.forEach((x, i) => i && assert.ok(ids(id).indexOf(seq[i - 1]) < ids(id).indexOf(x), `${id}: ${seq[i - 1]} before ${x}`));
  order('bug', ['bounced', 'network', 'inspect', 'repo', 'cause', 'fix', 'tests', 'retest']);
  order('ads', ['brief', 'landing', 'keep', 'exclude', 'negatives', 'radius', 'headline', 'budget', 'checks', 'submit']);
  order('extension', ['manifest', 'perms', 'narrow', 'build', 'smoke', 'repair', 'retest', 'listing', 'assets', 'submit']);
  order('outreach', ['brief', 'search', 'visit1', 'qualify', 'visit2', 'reject', 'crm', 'drafts', 'queue']);
  const pins = (id: string) => MISSIONS.find((m) => m.id === id)!.steps.filter((s) => s.pin).map((s) => s.pin!.kind);
  assert.ok(pins('bug').includes('fail') && pins('bug').includes('pass'), 'the bug is seen failing and then passing');
  assert.ok(pins('outreach').includes('pass') && pins('outreach').includes('fail'), 'one business qualifies, one is rejected');
});

test('browser approvals: nothing is merged, spent, submitted or sent', () => {
  const m = (id: string) => MISSIONS.find((x) => x.id === id)!;
  assert.match(m('bug').outcome.gate, /Merging and deploying wait for you/);
  assert.match(m('ads').outcome.gate, /Not published · no money spent/);
  assert.match(m('extension').outcome.gate, /Submission awaits you/);
  assert.match(m('outreach').outcome.gate, /Nothing sent/);
  assert.match(MISSION_SRC, /No mailbox is connected in this example/);
  assert.doesNotMatch(MISSION_SRC, />\s*(Publish now|Go live|Launch campaign|Pay now|Send now|Merge now)\s*</);
  assert.match(MISSION_SRC, /Waiting for your approval/);
});

test('browser engine: a mission plays once and holds its result; stale timers are ignored', () => {
  let s = initialState();
  assert.equal(s.track, 'browser:bug');
  assert.equal(browserPhase(s, false), 'ready');
  const stale = s.gen;
  s = demoReducer(s, { type: 'select', track: 'browser:ads' });
  assert.equal(demoReducer(s, { type: 'advance', gen: stale }), s);
  for (let i = 0; i < stepsOf('browser:ads').length; i++) s = demoReducer(s, { type: 'advance', gen: s.gen });
  assert.equal(s.track, 'browser:ads', 'no automatic switching to another mission');
  assert.equal(s.ended, true);
  assert.equal(browserPhase(s, true), 'approval-pending');
});

test('mission selectors sit above the computer; no replay or player controls; steps are inspectable', () => {
  const picker = SHELL.indexOf('aria-label="Choose a browser mission"');
  assert.ok(picker > 0 && picker < SHELL.indexOf('<Theater '), 'the selector row is rendered before the computer');
  assert.doesNotMatch(SHELL + THEATER, /Replay|replay|>Pause<|scrubber|progress bar/);
  assert.match(THEATER, /COPY\.inspect/);
  assert.match(THEATER, /aria-expanded=\{open\}/);
});

/* =========================================================================================== AI employees */
test('six employees with different jobs, tools, schedules, accents and computers', () => {
  assert.deepEqual(
    EMPLOYEES.map((e) => e.role),
    ['SEO & Search Researcher', 'Trading Strategy Researcher', 'Client Intake & Pre-Meeting Analyst', 'Software Reliability Engineer', 'Growth & Market Scout', 'Data & Operations Steward'],
  );
  for (const key of ['art', 'accent', 'job', 'cadence'] as const) assert.equal(new Set(EMPLOYEES.map((e) => e[key])).size, 6, `${key} is distinct`);
  assert.equal(new Set(EMPLOYEES.flatMap((e) => e.computer.tabs)).size, 24, 'no two computers share a tool');
  for (const e of EMPLOYEES) {
    assert.ok(e.script.some((b) => b.t === 'emp' && b.card?.kind === 'assignment'), `${e.id} accepts with an assignment card`);
    assert.ok(e.script.some((b) => b.t === 'skip'), `${e.id} time passes`);
    assert.ok(e.script.some((b) => b.t === 'emp' && b.card?.kind === 'report'), `${e.id} reports back`);
    assert.ok(e.followups.length >= 3, `${e.id} continues after a follow-up`);
    assert.match(DESK_SRC, new RegExp(`function ${{ seo: 'Seo', trading: 'Trading', intake: 'Intake', reliability: 'Reliability', scout: 'Scout', data: 'Data' }[e.id]}\\(`));
  }
  assert.match(employeeOf('intake').cadence, /When someone books/, 'the intake analyst is event-triggered');
  assert.match(COMPANION, /x-\$\{e\.art\}/, 'every employee wears the Xroga X character');
});

test('a full conversation: assign → clarify → assignment → work → time skip → report → follow-up', () => {
  let s = initialWorkforce();
  assert.equal(s.view, 'intro');
  s = run(s, { type: 'intro-done' });
  assert.equal(s.selected, FIRST_EMPLOYEE);
  const g = gateOf('seo', s.threads.seo)!;
  s = run(s, { type: 'draft', id: 'seo', text: g.text }, { type: 'send', id: 'seo' });
  assert.equal(s.threads.seo.msgs[0].from, 'user');
  assert.equal(s.threads.seo.state, 'thinking');
  s = drain(s, 'seo');
  assert.equal(s.threads.seo.state, 'waiting', 'the employee asks before it starts');
  s = drain(run(s, { type: 'send', id: 'seo', text: gateOf('seo', s.threads.seo)!.chip }), 'seo');
  const t = s.threads.seo;
  assert.ok(t.msgs.some((m) => m.card?.kind === 'assignment'));
  assert.ok(t.msgs.some((m) => m.from === 'skip'));
  assert.equal(t.msgs.at(-1)!.card?.kind, 'report');
  assert.equal(t.ws, 4);
  assert.equal(followupsOf('seo', t).length, 3);
  s = drain(run(s, { type: 'send', id: 'seo', text: 'show me the TOP 3' }), 'seo');
  assert.equal(s.threads.seo.ws, 5, 'typed follow-ups match loosely');
  assert.equal(followupsOf('seo', s.threads.seo).length, 2);
});

test('the composer is honest: unscripted text gets a sample-flow reply and does not advance the story', () => {
  let s = run(initialWorkforce(), { type: 'select', id: 'scout' });
  s = drain(run(s, { type: 'send', id: 'scout', text: 'Write me a poem', manual: true }), 'scout');
  const t = s.threads.scout;
  assert.equal(t.msgs.length, 2);
  assert.match(t.msgs[1].text, /sample conversation/i);
  assert.match(t.msgs[1].text, /start in Xroga/i);
  assert.equal(t.pos, 0, 'the scripted story has not moved');
  assert.deepEqual(run(s, { type: 'send', id: 'scout', text: '   ' }), s, 'empty messages are ignored');
});

test('refusals and approvals: no trading, no deploy without review, every external change asks first', () => {
  let s = story(initialWorkforce(), 'trading');
  s = drain(run(s, { type: 'send', id: 'trading', text: 'Place the trade for me' }), 'trading');
  assert.equal(s.threads.trading.state, 'blocked');
  assert.equal(s.threads.trading.msgs.at(-1)!.card?.kind, 'blocked');
  s = story(s, 'reliability');
  s = drain(run(s, { type: 'send', id: 'reliability', text: 'Just deploy it now' }), 'reliability');
  assert.equal(s.threads.reliability.state, 'blocked');
  s = story(s, 'seo');
  s = drain(run(s, { type: 'send', id: 'seo', text: 'Update the Invisalign page' }), 'seo');
  const gate = s.threads.seo.msgs.at(-1)!.card!;
  assert.equal(gate.kind, 'gate');
  s = run(s, { type: 'decide', id: 'seo', key: (gate as { question: string }).question, value: 'approved' });
  assert.equal(Object.values(s.threads.seo.decisions)[0], 'approved');
  assert.match(WORKFORCE_SRC, /Approved in this preview\. Nothing real was changed\./);
  for (const e of EMPLOYEES) {
    const a = e.script.find((b) => b.t === 'emp' && b.card?.kind === 'assignment');
    const rows = a && a.t === 'emp' && a.card?.kind === 'assignment' ? a.card.rows.map(([k]) => k) : [];
    assert.ok(rows.includes('Asks before') || rows.includes('Never'), `${e.id} states a permission boundary`);
  }
});

test('state persists across employees and modes; the entrance never replays; timers only touch their own thread', () => {
  let s = run(initialWorkforce(), { type: 'intro-done' });
  s = run(s, { type: 'send', id: 'seo', text: gateOf('seo', s.threads.seo)!.text });
  const genSeo = s.threads.seo.gen;
  s = run(s, { type: 'select', id: 'data' }, { type: 'draft', id: 'data', text: 'half-typed', manual: true });
  assert.equal(s.auto, false, 'a deliberate choice stops the example autoplay');
  s = run(s, { type: 'tick', id: 'seo', gen: genSeo });
  assert.equal(s.threads.seo.msgs.length, 2, 'an employee keeps working while another chat is open');
  assert.equal(run(s, { type: 'tick', id: 'seo', gen: genSeo }), s, 'a stale timer is ignored');
  s = run(s, { type: 'select', id: 'seo' }, { type: 'select', id: 'data' });
  assert.equal(s.view, 'chat');
  assert.equal(s.threads.data.draft, 'half-typed');
  assert.equal(norm('Yes, ask before editing!'), 'yes ask before editing');
});

test('every employee story completes and its computer reaches the report stage', () => {
  let s = initialWorkforce();
  for (const e of EMPLOYEES) {
    s = story(s, e.id);
    assert.equal(s.threads[e.id].ws, 4, `${e.id} computer shows the report`);
    for (const f of e.followups) s = drain(run(s, { type: 'send', id: e.id, text: f.chip }), e.id);
    assert.equal(followupsOf(e.id, s.threads[e.id]).length, 0);
  }
});

/* ================================================================================ shared quality bars */
test('clocks run only on screen and visible; nothing moves the page', () => {
  assert.match(CLOCK, /IntersectionObserver/);
  assert.match(CLOCK, /visibilitychange|document\.hidden/);
  assert.match(SHELL, /const live = mode === 'workforce' && onScreen && !hidden/);
  assert.doesNotMatch(SHELL + THEATER + MOTION + WORKFORCE_SRC, /scrollIntoView|window\.scroll/);
  assert.match(SHELL, /preventScroll: true/);
  for (const [i, css] of CSS.entries()) if (/animation|transition/.test(css)) assert.match(css, /prefers-reduced-motion: reduce/, CSS_FILES[i]);
});

test('one compact section: heading, one disclosure, one CTA, no video', () => {
  assert.equal(COPY.eyebrow, 'Xroga in action');
  assert.equal(COPY.title, 'Give Xroga a task. Or give an AI Employee a job.');
  assert.equal(COPY.disclosure, 'Illustrative examples · sample data');
  assert.equal((SHELL.match(/COPY\.disclosure/g) ?? []).length, 1);
  assert.equal((SHELL.match(/<Link /g) ?? []).length, 1);
  assert.match(SHELL, /'\/workspace' : '\/auth\/signup'/);
  assert.doesNotMatch(ALL_COPY, /<video|autoPlay/);
  assert.match(PAGE, /<S02Work loggedIn=\{loggedIn\} \/>/);
});

test('truthful copy: coming soon, sample data, fictional domains, no live-autonomy claims', () => {
  assert.doesNotMatch(ALL_COPY, /24\/7|fully autonomous|guarantee|100% accurate|replaces your team|no human needed|always on|live now/i);
  const domains = ALL_COPY.match(/\b[a-z0-9-]+\.(com|io|net|org|co|ai)\b/gi) ?? [];
  assert.deepEqual(domains, [], `only .example domains appear: ${domains.join(', ')}`);
  assert.match(WORKFORCE_SRC, /AI Employees are coming soon to Xroga/);
  assert.equal(COPY.conceptTag, 'Concept preview');
});

test('accessibility: tabs, pressed selectors, labelled chat and composer, decorative companions', () => {
  assert.match(SHELL, /role="tablist"/);
  assert.match(SHELL, /aria-selected=/);
  assert.match(SHELL, /aria-pressed=/);
  assert.match(WORKFORCE_SRC, /role="log"/);
  assert.match(WORKFORCE_SRC, /aria-label=\{`Message your/);
  assert.match(WORKFORCE_SRC, /<form/);
  assert.match(COMPANION, /aria-hidden="true"/);
  for (const css of CSS) assert.doesNotMatch(css, /outline:\s*none/);
});
