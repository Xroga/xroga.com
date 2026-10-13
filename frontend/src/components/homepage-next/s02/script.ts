/**
 * S02 script (V10): the single source of truth for both halves of S02.
 *
 * Browser Automation is ONE mission executed inside an application: a short deterministic sequence of causal steps
 * (pointer → control → interface reaction → evidence) that settles on a result and an approval.
 *
 * AI Employees are ONGOING responsibilities: each specialist has a standing job, a schedule or trigger, allowed
 * tools, approval boundaries and deliverables. The preview simulates one night away (Mon 17:42 → Tue 18:00) from a
 * fixed reference clock, then shows what each employee delivered and what waits for the visitor.
 *
 * Everything is fictional sample data. Nothing here describes a real account, customer or action, every spend,
 * send, publish, merge or submit stops at the visitor's approval, and persistent employees are a concept preview
 * (they are not live in the product today).
 */

export type Mode = 'browser' | 'workforce';
export type MissionId = 'bug' | 'ads' | 'extension' | 'article';
export type EmployeeId = 'builder' | 'growth' | 'research' | 'creative' | 'data' | 'ops';
export type TrackId = `browser:${MissionId}`;
export type Action = 'none' | 'move' | 'click' | 'type' | 'drag';

export interface Pin {
  /** `data-t` of the element the finding belongs to. */
  at: string;
  text: string;
  kind: 'fail' | 'pass' | 'info';
  /** The step that resolves the finding; the pin leaves when it is reached. */
  until?: string;
}

export interface Step {
  id: string;
  ms: number;
  /** `data-t` of the element the pointer acts on. */
  t?: string;
  act: Action;
  typed?: string;
  pin?: Pin;
  /** A short push toward the element (scale ≤ 1.06), then back to the full frame. */
  push?: boolean;
}

export interface Outcome {
  title: string;
  state: 'review' | 'approval';
  lines: { mark: 'pass' | 'fail' | 'wait' | 'note'; text: string }[];
  gate: string;
}

export interface Mission {
  id: MissionId;
  label: string;
  request: string;
  steps: Step[];
  outcome: Outcome;
}

const s = (id: string, ms: number, act: Action = 'none', t?: string, extra: Partial<Step> = {}): Step => ({ id, ms, act, t, ...extra });
/** The settled result frame: held until the visitor chooses something else. */
const HOLD = 5200;

/* =========================================================================================== browser missions */
export const MISSIONS: Mission[] = [
  {
    id: 'bug',
    label: 'Find a website bug',
    request: 'Test why customers can’t upgrade.',
    steps: [
      s('open', 900),
      s('pick', 950, 'click', 'bug.pro'),
      s('coupon', 1250, 'type', 'bug.coupon', { typed: 'LAUNCH20' }),
      s('apply', 850, 'click', 'bug.apply'),
      s('upgrade', 900, 'click', 'bug.pay'),
      s('loop', 1300, 'move', 'bug.pay', { push: true, pin: { at: 'bug.pay', text: 'Sends you back to checkout once a coupon is applied', kind: 'fail' } }),
      s('network', 1000, 'click', 'bug.netTab'),
      s('inspect', 1300, 'click', 'bug.row', { push: true, pin: { at: 'bug.row', text: '422 · coupon_not_valid_for_plan', kind: 'fail' } }),
      s('result', HOLD),
    ],
    outcome: {
      title: 'Issue reproduced',
      state: 'review',
      lines: [
        { mark: 'fail', text: 'Upgrade to Pro fails after the LAUNCH20 coupon' },
        { mark: 'note', text: 'POST /api/checkout returns 422 coupon_not_valid_for_plan' },
        { mark: 'note', text: 'Repro: Pricing → Pro → coupon → Upgrade' },
        { mark: 'pass', text: 'Upgrades without a coupon work' },
      ],
      gate: 'Nothing in your store was changed',
    },
  },
  {
    id: 'ads',
    label: 'Prepare a Google Ad',
    request: 'Prepare a local campaign for review.',
    steps: [
      s('open', 800),
      s('site', 850, 'click', 'ads.site'),
      s('goal', 800, 'click', 'ads.goal'),
      s('radius', 1050, 'drag', 'ads.radius'),
      s('headline', 1300, 'type', 'ads.headline', { typed: 'Same-week cleanings in Northside' }),
      s('negatives', 1000, 'type', 'ads.negatives', { typed: 'free' }),
      s('budget', 900, 'type', 'ads.budget', { typed: '25' }),
      s('checks', 900, 'move', 'ads.checks', { pin: { at: 'ads.checks', text: 'Landing page loads in 1.4 s on phones', kind: 'pass' } }),
      s('publish', 900, 'click', 'ads.publish', { push: true }),
      s('result', HOLD),
    ],
    outcome: {
      title: 'Campaign draft ready for review',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Bookings goal · 8 km around Northside' },
        { mark: 'pass', text: 'Ad, negative keywords and landing page checked' },
        { mark: 'wait', text: 'Budget $25/day starts only when you approve' },
      ],
      gate: 'Not published · no money spent',
    },
  },
  {
    id: 'extension',
    label: 'Ship a Chrome extension',
    request: 'Get my extension ready to ship.',
    steps: [
      s('open', 900),
      s('manifest', 900, 'click', 'ext.manifest'),
      s('perm', 1200, 'click', 'ext.perm', { pin: { at: 'ext.perm', text: 'Access narrowed from every site to 2 sites', kind: 'info', until: 'listing' } }),
      s('smoke', 1250, 'click', 'ext.run', { push: true }),
      s('listing', 1000, 'click', 'ext.listingTab'),
      s('check', 1000, 'move', 'ext.checklist'),
      s('submit', 950, 'click', 'ext.submit'),
      s('result', HOLD),
    ],
    outcome: {
      title: 'Release validated',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Package 1.4.0 built and smoke-tested' },
        { mark: 'pass', text: 'Permissions reduced to what the features use' },
        { mark: 'pass', text: 'Listing, screenshots and privacy answers ready' },
        { mark: 'wait', text: 'Store review is decided by Google after you submit' },
      ],
      gate: 'Submission waits for you',
    },
  },
  {
    id: 'article',
    label: 'Prepare an article',
    request: 'Prepare and check my article.',
    steps: [
      s('open', 900),
      s('image', 900, 'click', 'art.image'),
      s('alt', 1250, 'type', 'art.alt', { typed: 'Team reviewing an onboarding checklist' }),
      s('slug', 900, 'click', 'art.slug'),
      s('phone', 1000, 'click', 'art.phone', { pin: { at: 'art.table', text: 'Table runs off the screen on phones', kind: 'fail', until: 'fix' } }),
      s('fix', 1050, 'click', 'art.stack', { push: true }),
      s('publish', 900, 'click', 'art.publish'),
      s('result', HOLD),
    ],
    outcome: {
      title: 'Article verified',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Image alt text, slug and meta description set' },
        { mark: 'pass', text: 'Pricing table now stacks on phones' },
        { mark: 'pass', text: 'Desktop and phone previews checked' },
      ],
      gate: 'Publishing waits for you',
    },
  },
];

/* ============================================================================================ AI workforce */
/** Hours on the away timeline, counted from Mon 18:00 (0) to Tue 18:00 (24). */
export interface Block {
  at: number;
  len: number;
  label: string;
  /** run: work in progress · arrive: new input · deliver: artifact saved · decision: waits for you · handoff: sent to a colleague */
  kind: 'run' | 'arrive' | 'deliver' | 'decision' | 'handoff';
}

export interface Assignment {
  goal: string;
  triggers: string[];
  tools: { label: string; on: boolean }[];
  approvals: { label: string; on: boolean }[];
  deliver: string;
}

export interface Return {
  delivered: number;
  decisions: number;
  next: string;
  /** What changed since the last check, in the employee's own terms. */
  changed: string[];
  /** One line for the roster while another employee is open. */
  status: string;
  artifact: { title: string; meta: string };
  decision: { question: string; approve: string; hold: string };
}

export interface Employee {
  id: EmployeeId;
  name: string;
  short: string;
  /** The standing responsibility, in four or five words. */
  role: string;
  accent: string;
  tie: 'slim' | 'striped' | 'bow' | 'dotted' | 'knit' | 'clip';
  idle: 'nod' | 'sway' | 'tilt' | 'settle' | 'breathe' | 'bob';
  assignment: Assignment;
  /** What the employee does overnight (Mon 18:00 → Tue 18:00). */
  away: Block[];
  ret: Return;
}

const tools = (...xs: [string, boolean][]) => xs.map(([label, on]) => ({ label, on }));

export const EMPLOYEES: Employee[] = [
  {
    id: 'builder',
    name: 'Software Builder',
    short: 'Builder',
    role: 'Owns the bug queue',
    accent: '#4f86ff',
    tie: 'slim',
    idle: 'nod',
    assignment: {
      goal: 'Own our customer dashboard bug queue. Each morning, find new regressions, prepare fixes and run the tests.',
      triggers: ['Every weekday · 07:00', 'When a new issue is filed', 'Every Monday · 09:00'],
      tools: tools(['Repository', true], ['Issue tracker', true], ['CI pipeline', true], ['Browser checks', true], ['Production deploys', false]),
      approvals: tools(['Merging to main', true], ['Deploying', true], ['Closing customer issues', false]),
      deliver: 'One pull request per fix, with test evidence',
    },
    away: [
      { at: 13, len: 0.8, label: 'Triage 3 new issues', kind: 'arrive' },
      { at: 13.9, len: 1.6, label: 'Fix #487 · session switch', kind: 'run' },
      { at: 15.6, len: 0.6, label: 'PR #212 · 18 tests pass', kind: 'deliver' },
      { at: 16.3, len: 1.4, label: 'Fix #489 · CSV export', kind: 'run' },
      { at: 17.8, len: 0.5, label: 'Flaky test: your call', kind: 'decision' },
      { at: 21.3, len: 0.6, label: 'New issue #491', kind: 'arrive' },
    ],
    ret: {
      delivered: 2,
      decisions: 1,
      next: 'Wed 07:00',
      changed: ['2 regressions fixed, each with tests', 'PR #212 waits for your merge', 'New issue #491 queued for Wednesday'],
      status: 'PR #212 awaits your merge',
      artifact: { title: 'PR #212 · Keep session on project switch', meta: '+6 −2 · 18 of 18 tests passed' },
      decision: { question: 'Merge PR #212 into main?', approve: 'Approve merge', hold: 'Hold' },
    },
  },
  {
    id: 'growth',
    name: 'Growth Strategist',
    short: 'Growth',
    role: 'Builds the prospect pipeline',
    accent: '#ff7d5c',
    tie: 'striped',
    idle: 'bob',
    assignment: {
      goal: 'Keep a pipeline of best-fit dental clinics. Re-rank prospects when Research updates the brief and draft outreach for my approval.',
      triggers: ['When Research delivers a brief', 'Every Tuesday · 10:00', 'Every weekday · 08:00'],
      tools: tools(['CRM', true], ['Research briefs', true], ['Email drafts', true], ['Browser research', true], ['Ads account', false]),
      approvals: tools(['Sending any email', true], ['Adding contacts to sequences', true], ['Spending budget', true]),
      deliver: 'Ranked prospects and outreach drafts',
    },
    away: [
      { at: 12.3, len: 0.4, label: 'Brief #7 received', kind: 'arrive' },
      { at: 12.8, len: 1.4, label: 'Re-rank 24 prospects', kind: 'run' },
      { at: 14.3, len: 0.5, label: 'Prospect list v4', kind: 'deliver' },
      { at: 15, len: 1.6, label: 'Draft 3 outreach emails', kind: 'run' },
      { at: 16.7, len: 0.6, label: '3 drafts await approval', kind: 'decision' },
    ],
    ret: {
      delivered: 2,
      decisions: 1,
      next: 'Research’s next brief',
      changed: ['Brief #7 from Research applied at 06:20', 'Harbor Smiles moved to #1 (fit 92)', '3 outreach drafts ready, none sent'],
      status: '3 drafts await approval',
      artifact: { title: 'Prospect list v4 · 24 clinics', meta: 'Re-ranked Tue 08:10 · source: Brief #7' },
      decision: { question: 'Send the 3 outreach emails?', approve: 'Approve drafts', hold: 'Edit first' },
    },
  },
  {
    id: 'research',
    name: 'Research Analyst',
    short: 'Research',
    role: 'Tracks the market question',
    accent: '#9b7bff',
    tie: 'bow',
    idle: 'tilt',
    assignment: {
      goal: 'Track how mid-size clinics adopt booking software. Update the decision brief when sources change and hand findings to Growth.',
      triggers: ['Every night · 02:00', 'When a tracked source changes', 'Every Friday · 16:00'],
      tools: tools(['Web research', true], ['Documents', true], ['Source ledger', true], ['Browser', true], ['Paid reports', false]),
      approvals: tools(['Buying paid reports', true], ['Publishing the brief outside the team', true]),
      deliver: 'A dated decision brief with sources',
    },
    away: [
      { at: 8, len: 1.5, label: 'Scan 41 tracked sources', kind: 'run' },
      { at: 9.6, len: 0.4, label: '3 sources changed', kind: 'arrive' },
      { at: 10.1, len: 1.9, label: 'Update decision brief', kind: 'run' },
      { at: 12.1, len: 0.5, label: 'Brief #7 → Growth', kind: 'handoff' },
      { at: 15.4, len: 0.5, label: 'Paid report: your call', kind: 'decision' },
    ],
    ret: {
      delivered: 1,
      decisions: 1,
      next: 'Wed 02:00',
      changed: ['3 of 41 sources changed overnight', 'Confidence in partner-led entry: medium → high', 'Brief #7 handed to Growth at 06:10'],
      status: 'Brief #7 delivered to Growth',
      artifact: { title: 'Decision brief #7 · Market entry', meta: '7 sources cited · confidence high' },
      decision: { question: 'Buy the $49 clinic survey report?', approve: 'Approve purchase', hold: 'Not now' },
    },
  },
  {
    id: 'creative',
    name: 'Creative Producer',
    short: 'Creative',
    role: 'Runs the content calendar',
    accent: '#f06aa8',
    tie: 'dotted',
    idle: 'sway',
    assignment: {
      goal: 'Keep the launch campaign stocked: three posts a week in every format, on brand, scheduled ahead.',
      triggers: ['Every weekday · 08:00', 'When a product update ships', 'First Monday of the month'],
      tools: tools(['Brand kit', true], ['Asset library', true], ['Image editor', true], ['Social scheduler', true], ['Paid stock', false]),
      approvals: tools(['Publishing any post', true], ['Using paid stock images', true]),
      deliver: 'Ready-to-post assets in the calendar',
    },
    away: [
      { at: 14, len: 2, label: 'Draft Wed + Fri posts', kind: 'run' },
      { at: 16.1, len: 1, label: 'Square, story, web sizes', kind: 'run' },
      { at: 17.2, len: 0.5, label: '3 assets saved', kind: 'deliver' },
      { at: 17.8, len: 0.6, label: 'Wed post: your OK', kind: 'decision' },
    ],
    ret: {
      delivered: 3,
      decisions: 1,
      next: 'Wed 08:00',
      changed: ['Wed and Fri posts drafted in 3 formats', 'Story headline re-set so nothing crops', 'Nothing posted yet'],
      status: 'Wed post awaits your OK',
      artifact: { title: 'Launch week · post 4 of 9', meta: 'Square, story and web · on brand' },
      decision: { question: 'Schedule Wednesday’s 10:00 post?', approve: 'Approve post', hold: 'Hold' },
    },
  },
  {
    id: 'data',
    name: 'Data Specialist',
    short: 'Data',
    role: 'Reconciles records nightly',
    accent: '#3fd6c6',
    tie: 'knit',
    idle: 'settle',
    assignment: {
      goal: 'Reconcile billing, CRM and the customer sheet every night. Fix what is safe, hold anything ambiguous, never delete.',
      triggers: ['Every night · 01:00', 'When a new export lands', 'Every Sunday · 22:00'],
      tools: tools(['Billing export', true], ['CRM', true], ['Customer sheet', true], ['SQL warehouse', true], ['Email', false]),
      approvals: tools(['Merging or deleting customers', true], ['Writing back to the CRM', true]),
      deliver: 'Clean sheet, change log and held rows',
    },
    away: [
      { at: 7, len: 0.6, label: 'Import 3 sources · 4,812 rows', kind: 'arrive' },
      { at: 7.7, len: 1.4, label: 'Match and validate', kind: 'run' },
      { at: 9.2, len: 0.5, label: '37 safe fixes saved', kind: 'deliver' },
      { at: 9.8, len: 0.5, label: '4 rows held for you', kind: 'decision' },
    ],
    ret: {
      delivered: 1,
      decisions: 1,
      next: 'Wed 01:00',
      changed: ['4,812 rows checked across 3 sources', '37 safe fixes, every one reversible', '4 ambiguous rows held, nothing deleted'],
      status: '4 rows held for you',
      artifact: { title: 'customers_clean.csv', meta: '37 changes · change log saved' },
      decision: { question: 'Merge the 2 duplicate customers?', approve: 'Approve merge', hold: 'Keep separate' },
    },
  },
  {
    id: 'ops',
    name: 'Operations Manager',
    short: 'Ops',
    role: 'Triages requests and bookings',
    accent: '#e4b650',
    tie: 'clip',
    idle: 'breathe',
    assignment: {
      goal: 'Handle new appointment requests every weekday. Check available slots, keep the CRM accurate and draft follow-ups in my tone.',
      triggers: ['Every weekday · 09:00', 'When a request arrives', 'Twice a day · 09:00 and 15:00'],
      tools: tools(['Inbox', true], ['Calendar', true], ['CRM', true], ['Email drafts', true], ['Phone calls', false]),
      approvals: tools(['Sending replies', true], ['Changing confirmed bookings', true], ['Cancelling visits', true]),
      deliver: 'Triaged inbox, held slots and reply drafts',
    },
    away: [
      { at: 14.3, len: 0.5, label: '3 requests arrived', kind: 'arrive' },
      { at: 15, len: 0.8, label: 'Triage 3 requests', kind: 'run' },
      { at: 15.9, len: 0.9, label: 'Check calendar + CRM', kind: 'run' },
      { at: 16.9, len: 0.5, label: '2 slots held, 2 replies', kind: 'deliver' },
      { at: 17.5, len: 0.5, label: 'Luis: two dates?', kind: 'decision' },
    ],
    ret: {
      delivered: 2,
      decisions: 1,
      next: 'Wed 09:00',
      changed: ['3 requests triaged', '2 replies drafted, 2 slots held', '1 decision needed: Luis asked for two dates'],
      status: '1 decision needed',
      artifact: { title: 'Reply to Maya Chen · Thu 10:30', meta: 'Drafted in your tone · slot held' },
      decision: { question: 'Send the 2 drafted replies?', approve: 'Approve & send', hold: 'Hold' },
    },
  },
];

/**
 * The night away: a playhead crosses Mon 18:00 → Tue 18:00 in a few beats. Each beat names the hour and what
 * the team is doing, so the time-lapse reads as work happening, not as a clock spinning.
 */
export const AWAY_BEATS: { hour: number; clock: string; caption: string }[] = [
  { hour: 0, clock: 'Mon 17:42', caption: 'You close your laptop' },
  { hour: 8, clock: 'Tue 02:00', caption: 'Data reconciles, Research scans sources' },
  { hour: 12.2, clock: 'Tue 06:10', caption: 'Research hands brief #7 to Growth' },
  { hour: 15.6, clock: 'Tue 09:35', caption: 'Morning runs: Builder, Ops, Growth' },
  { hour: 18, clock: 'Tue 12:00', caption: 'Drafts and patches saved for review' },
  { hour: 24, clock: 'Tue 18:00', caption: 'You’re back' },
];
export const AWAY_BEAT_MS = 820;
/** The team entrance, once per visit: the parent orb, then the six arrive. */
export const INTRO_MS = 2200;
export const REFERENCE = { assigned: 'Mon 17:42', back: 'Tue 18:00' };

export const COPY = {
  eyebrow: 'Xroga in action',
  title: 'One task in motion. Or a team on the job.',
  lede: {
    browser: 'Xroga works inside websites and apps, then waits for your approval.',
    workforce: 'Give each specialist a responsibility. Come back to what they delivered.',
  },
  modes: { browser: 'Browser Automation', workforce: 'AI Employees' },
  disclosure: 'Illustrative experience · sample data',
  conceptTag: 'Concept preview',
  replay: 'Replay demo',
  team: 'Your AI workforce',
  cta: 'Start with Xroga',
};

export const missionOf = (t: TrackId) => MISSIONS.find((m) => `browser:${m.id}` === t);
export const employeeOf = (id: EmployeeId) => EMPLOYEES.find((e) => e.id === id)!;
export const stepsOf = (t: TrackId): Step[] => missionOf(t)!.steps;
export const stepDurations = (t: TrackId) => stepsOf(t).map((x) => x.ms);
/** The first mission when the section is reached. Nothing else plays on its own. */
export const FIRST: TrackId = 'browser:bug';
