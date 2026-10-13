/**
 * S02 script (V9): the single source of truth for the computer on stage. Four browser missions and six AI
 * Employees, each a short deterministic sequence of causal steps that settles on an inspectable result, plus the
 * team entrance. Every step names the element the pointer acts on (`data-t`) and the apps render only what the
 * current and earlier steps say happened. All data is fictional sample data; nothing describes a real account,
 * a real customer or a real action, and every spend, send, publish or submit stops at the visitor's approval.
 */

export type Mode = 'browser' | 'employees';
export type MissionId = 'bug' | 'ads' | 'extension' | 'article';
export type EmployeeId = 'builder' | 'growth' | 'research' | 'creative' | 'data' | 'ops';
export type TrackId = `browser:${MissionId}` | `emp:${EmployeeId}` | 'emp:team';
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
  /** A short push toward the element (scale ≤ 1.08), then back to the full frame. */
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
  /** The app the pointer works in (window title). */
  app: string;
  request: string;
  steps: Step[];
  outcome: Outcome;
}

export interface Employee {
  id: EmployeeId;
  name: string;
  /** Dock label. */
  short: string;
  /** Role colour: rim light, tie stitch, pointer and pedestal. */
  accent: string;
  tie: 'slim' | 'striped' | 'bow' | 'dotted' | 'knit' | 'clip';
  /** One idle signature each. */
  idle: 'nod' | 'sway' | 'tilt' | 'settle' | 'breathe' | 'bob';
  app: string;
  request: string;
  steps: Step[];
  outcome: Outcome;
}

const s = (id: string, ms: number, act: Action = 'none', t?: string, extra: Partial<Step> = {}): Step => ({ id, ms, act, t, ...extra });
/** The settled result frame: held until the visitor chooses something else. */
const HOLD = 5200;

export const MISSIONS: Mission[] = [
  {
    id: 'bug',
    label: 'Find a website bug',
    app: 'Lattice',
    request: 'Visit my store like a customer. Find why upgrades fail, and show me what breaks.',
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
      title: 'Issue located',
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
    app: 'Ads campaign editor',
    request: 'Prepare an ad campaign for my clinic. Show me the targeting and budget before anything goes live.',
    steps: [
      s('open', 900),
      s('site', 900, 'click', 'ads.site'),
      s('goal', 850, 'click', 'ads.goal'),
      s('radius', 1150, 'drag', 'ads.radius'),
      s('headline', 1350, 'type', 'ads.headline', { typed: 'Same-week cleanings in Northside' }),
      s('budget', 950, 'type', 'ads.budget', { typed: '25' }),
      s('publish', 950, 'click', 'ads.publish', { push: true }),
      s('result', HOLD),
    ],
    outcome: {
      title: 'Draft ready for approval',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Goal: appointment bookings · 8 km around Northside' },
        { mark: 'pass', text: 'Ad and booking page checked on desktop and phone' },
        { mark: 'wait', text: 'Budget $25/day, starts only when you approve' },
      ],
      gate: 'Not published · no money spent',
    },
  },
  {
    id: 'extension',
    label: 'Publish a Chrome extension',
    app: 'Release console',
    request: 'Get my browser extension ready for the Chrome Web Store. Check its package and listing before submission.',
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
      title: 'Extension release prepared',
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
    app: 'Folio CMS',
    request: 'Make this article ready for my website and check it on desktop and phone. Ask before publishing.',
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
      title: 'Article checked',
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

export const EMPLOYEES: Employee[] = [
  {
    id: 'builder',
    name: 'Software Builder',
    short: 'Builder',
    accent: '#4f86ff',
    tie: 'slim',
    idle: 'nod',
    app: 'dashboard-app',
    request: 'Fix why our customer dashboard logs users out when switching projects.',
    steps: [
      s('assign', 900),
      s('open', 900, 'click', 'b.file'),
      s('find', 1150, 'move', 'b.bug', { pin: { at: 'b.bug', text: 'Signs the user out on every project switch', kind: 'fail', until: 'edit' } }),
      s('edit', 1250, 'type', 'b.edit', { typed: 'await session.switchProject(projectId);' }),
      s('test', 1100, 'click', 'b.run'),
      s('pass', 1000, 'move', 'b.result', { push: true }),
      s('done', HOLD),
    ],
    outcome: {
      title: 'Patch ready for review',
      state: 'review',
      lines: [
        { mark: 'pass', text: '18 tests passed, including a new project-switch test' },
        { mark: 'note', text: '1 file changed · +6 −2' },
      ],
      gate: 'Merging waits for your review',
    },
  },
  {
    id: 'growth',
    name: 'Growth Strategist',
    short: 'Growth',
    accent: '#ff7d5c',
    tie: 'striped',
    idle: 'bob',
    app: 'Prospect board',
    request: 'Find the best new clients for my service and draft a targeted outreach plan.',
    steps: [
      s('brief', 1000, 'move', 'g.brief'),
      s('segment', 900, 'click', 'g.segment'),
      s('shortlist', 1200, 'click', 'g.pick'),
      s('pitch', 1150, 'click', 'g.pitch'),
      s('pipeline', 1150, 'move', 'g.ready', { push: true }),
      s('done', HOLD),
    ],
    outcome: {
      title: 'Prospects prioritized',
      state: 'approval',
      lines: [
        { mark: 'pass', text: '3 best-fit clinics shortlisted from the research brief' },
        { mark: 'pass', text: 'One outreach angle per prospect, drafted' },
      ],
      gate: 'Nothing is sent until you approve',
    },
  },
  {
    id: 'research',
    name: 'Research Analyst',
    short: 'Research',
    accent: '#9b7bff',
    tie: 'bow',
    idle: 'tilt',
    app: 'Evidence canvas',
    request: 'Compare three ways to enter this market and give me a recommendation with sources.',
    steps: [
      s('assign', 800),
      s('sources', 1100, 'move', 'r.sources'),
      s('score', 1300, 'move', 'r.matrix'),
      s('risk', 1000, 'click', 'r.risk', { pin: { at: 'r.risk', text: 'Only 2 sources on partner margins', kind: 'info' } }),
      s('recommend', 1100, 'move', 'r.rec', { push: true }),
      s('handoff', 1000, 'click', 'r.send'),
      s('done', HOLD),
    ],
    outcome: {
      title: 'Brief delivered',
      state: 'review',
      lines: [
        { mark: 'pass', text: 'Recommendation: partner-led entry, medium confidence' },
        { mark: 'note', text: '7 sources compared, uncertainty stated' },
      ],
      gate: 'Brief shared with the Growth Strategist',
    },
  },
  {
    id: 'creative',
    name: 'Creative Producer',
    short: 'Creative',
    accent: '#f06aa8',
    tie: 'dotted',
    idle: 'sway',
    app: 'Campaign board',
    request: 'Turn this product launch into a short campaign for web and social.',
    steps: [
      s('assign', 800),
      s('frames', 1200, 'click', 'c.frame'),
      s('formats', 1200, 'click', 'c.formats'),
      s('review', 1100, 'move', 'c.note', { pin: { at: 'c.note', text: 'Headline crops on the story format', kind: 'info', until: 'fix' } }),
      s('fix', 1050, 'click', 'c.swap', { push: true }),
      s('done', HOLD),
    ],
    outcome: {
      title: 'Assets ready',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Web hero, square post and story, one look' },
        { mark: 'pass', text: 'Story headline re-set so nothing crops' },
      ],
      gate: 'Nothing is posted until you approve',
    },
  },
  {
    id: 'data',
    name: 'Data Specialist',
    short: 'Data',
    accent: '#3fd6c6',
    tie: 'knit',
    idle: 'settle',
    app: 'customers.xlsx',
    request: 'Clean the messy customer spreadsheet without deleting questionable records.',
    steps: [
      s('import', 900),
      s('dupes', 1200, 'move', 'd.dupe'),
      s('invalid', 1100, 'move', 'd.email', { pin: { at: 'd.email', text: 'Fixable email format', kind: 'info', until: 'normalize' } }),
      s('normalize', 1100, 'click', 'd.apply'),
      s('hold', 1050, 'move', 'd.hold', { push: true }),
      s('done', HOLD),
    ],
    outcome: {
      title: 'Records reconciled',
      state: 'review',
      lines: [
        { mark: 'pass', text: '2 duplicates merged, 3 values normalized' },
        { mark: 'wait', text: '2 rows held for you, nothing deleted' },
      ],
      gate: 'Original sheet kept unchanged',
    },
  },
  {
    id: 'ops',
    name: 'Operations Manager',
    short: 'Ops',
    accent: '#e4b650',
    tie: 'clip',
    idle: 'breathe',
    app: 'Operations',
    request: 'Keep requests and appointments moving, and draft the follow-ups I should approve.',
    steps: [
      s('request', 900),
      s('open', 900, 'click', 'o.req'),
      s('conflict', 1150, 'move', 'o.clash', { pin: { at: 'o.clash', text: 'Overlaps an existing visit', kind: 'fail', until: 'reslot' } }),
      s('reslot', 1000, 'click', 'o.alt'),
      s('crm', 1000, 'move', 'o.crm'),
      s('draft', 1100, 'move', 'o.draft', { push: true }),
      s('done', HOLD),
    ],
    outcome: {
      title: 'Follow-up waiting for you',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Visit moved to Thu 10:30, no conflict' },
        { mark: 'pass', text: 'Client record updated' },
      ],
      gate: 'Reply sends only when you approve',
    },
  },
];

/** The team entrance: under two seconds, then the featured employee takes the screen. */
export const TEAM_STEPS: Step[] = [s('glow', 280), s('emerge', 560), s('settle', 620), s('feature', 600)];
/** After the entrance the Software Builder opens its computer; the rest wait in the dock. */
export const FEATURED: EmployeeId = 'builder';

export const COPY = {
  eyebrow: 'Xroga in action',
  title: 'Give the work to Xroga. Watch it happen.',
  lede: 'See work move through real tools, or meet a team of specialist AI Employees.',
  modes: { browser: 'Browser Automation', employees: 'AI Employees' },
  disclosure: 'Illustrative experience · sample data',
  watchAgain: 'Watch again',
  team: 'Team',
  cta: 'Start with Xroga',
};

export const modeOf = (t: TrackId): Mode => (t.startsWith('browser:') ? 'browser' : 'employees');
export const missionOf = (t: TrackId) => MISSIONS.find((m) => `browser:${m.id}` === t);
export const employeeOf = (t: TrackId) => EMPLOYEES.find((e) => `emp:${e.id}` === t);

export function stepsOf(t: TrackId): Step[] {
  if (t === 'emp:team') return TEAM_STEPS;
  return (missionOf(t) ?? employeeOf(t))!.steps;
}
export const stepDurations = (t: TrackId) => stepsOf(t).map((x) => x.ms);
/** A track that hands over to another when it ends (the team entrance opens the featured employee). */
export const THEN: Partial<Record<TrackId, TrackId>> = { 'emp:team': `emp:${FEATURED}` };
/** The first scene when the section is reached. Nothing else plays on its own. */
export const AUTO_ORDER: TrackId[] = ['browser:bug'];
