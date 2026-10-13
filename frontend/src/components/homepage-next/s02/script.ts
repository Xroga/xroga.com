/**
 * S02 script (V12), browser half: four Browser Automation missions. Each is ONE bounded task executed inside a
 * browser by Xroga's blue X cursor: a short deterministic chain of causal steps (pointer → control → interface
 * reaction → evidence) that settles on an inspectable result and an approval. The AI Employees half lives in
 * team.ts.
 *
 * Everything is fictional sample data (`.example` domains). Nothing here describes a real account or action;
 * merges, spend, submissions and sends all stop at the visitor's approval.
 */

export type Mode = 'browser' | 'workforce';
export type MissionId = 'bug' | 'ads' | 'extension' | 'outreach';
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
  /** What happened, in plain words, for the "Inspect steps" list. */
  label: string;
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
  lines: { mark: 'pass' | 'fail' | 'wait' | 'note'; label?: string; text: string }[];
  gate: string;
}

export interface Mission {
  id: MissionId;
  label: string;
  /** The visitor's request, shown in the computer's menu bar. */
  request: string;
  steps: Step[];
  outcome: Outcome;
}

const s = (id: string, label: string, ms: number, act: Action = 'none', t?: string, extra: Partial<Step> = {}): Step => ({ id, label, ms, act, t, ...extra });
/** The settled result frame: held until the visitor chooses something else. */
const HOLD = 6000;

export const MISSIONS: Mission[] = [
  {
    id: 'bug',
    label: 'Find a Website Bug',
    request: 'My customers can’t upgrade their plans. Visit my site like a customer, find what’s broken, and fix it if you can.',
    steps: [
      s('open', 'Opened the store as a signed-in test customer', 1000),
      s('pick', 'Chose the Pro plan', 950, 'click', 'bug.pro'),
      s('coupon', 'Entered the LAUNCH20 promotion', 1250, 'type', 'bug.coupon', { typed: 'LAUNCH20' }),
      s('apply', 'Applied it: price dropped to $19.20', 850, 'click', 'bug.apply'),
      s('upgrade', 'Pressed Upgrade to Pro', 950, 'click', 'bug.pay'),
      s('bounced', 'Upgrade failed: the account stayed on Starter', 1600, 'move', 'bug.plan', { push: true, pin: { at: 'bug.plan', text: 'Still on Starter after paying', kind: 'fail', until: 'retest' } }),
      s('network', 'Opened the network panel', 1000, 'click', 'bug.netTab'),
      s('inspect', 'Found POST /api/checkout → 422 coupon_not_valid_for_plan', 1600, 'click', 'bug.row', { push: true, pin: { at: 'bug.row', text: '422 · coupon_not_valid_for_plan', kind: 'fail', until: 'repo' } }),
      s('repo', 'Opened the authorized repository', 1050, 'click', 'bug.repoTab'),
      s('cause', 'Cause: LAUNCH20 only lists Starter as an eligible plan', 1600, 'move', 'bug.cause', { push: true, pin: { at: 'bug.cause', text: 'Pro is missing from eligible plans', kind: 'info', until: 'fix' } }),
      s('fix', 'Fixed the eligible plans on a branch', 1500, 'type', 'bug.fix', { typed: "eligiblePlans: ['starter', 'pro']," }),
      s('tests', 'Ran unit, integration and browser tests', 1900, 'click', 'bug.runTests'),
      s('back', 'Went back to the store', 900, 'click', 'bug.storeTab'),
      s('retest', 'Repeated the exact upgrade with LAUNCH20', 1400, 'click', 'bug.pay', { pin: { at: 'bug.plan', text: 'Upgrade works with LAUNCH20', kind: 'pass' } }),
      s('result', 'Prepared the review', HOLD),
    ],
    outcome: {
      title: 'Bug fixed on a branch, ready for review',
      state: 'review',
      lines: [
        { mark: 'fail', label: 'Before', text: 'Upgrading with LAUNCH20 left customers on Starter' },
        { mark: 'note', label: 'Cause', text: 'The coupon’s eligible plans did not include Pro (422 from /api/checkout)' },
        { mark: 'note', label: 'Fix', text: 'PR #318 adds Pro to eligible plans, plus a regression test' },
        { mark: 'pass', label: 'After', text: 'The same upgrade now completes on Pro' },
        { mark: 'pass', label: 'Tests', text: '24 unit, 6 integration and 1 browser journey passed' },
      ],
      gate: 'Merging and deploying wait for you',
    },
  },
  {
    id: 'ads',
    label: 'Prepare a Google Ad',
    request: 'Help my clinic get more bookings. Research the opportunity and prepare a campaign for my approval.',
    steps: [
      s('open', 'Opened the campaign workspace', 900),
      s('brief', 'Confirmed the clinic, area, goal and budget range', 1400, 'move', 'ads.brief'),
      s('landing', 'Checked the booking page: form, phone and load time', 1400, 'click', 'ads.landing', { pin: { at: 'ads.landing', text: 'Booking form works · loads in 1.4 s on phones', kind: 'pass', until: 'campaign' } }),
      s('research', 'Researched search terms', 1100, 'click', 'ads.researchTab'),
      s('keep', 'Kept high booking-intent terms', 1300, 'click', 'ads.kw1'),
      s('exclude', 'Excluded an informational term', 1300, 'click', 'ads.kw3', { pin: { at: 'ads.kw3', text: 'Informational: people researching, not booking', kind: 'info', until: 'campaign' } }),
      s('negatives', 'Added negative keywords', 1200, 'type', 'ads.negatives', { typed: 'free' }),
      s('campaign', 'Moved to campaign setup', 950, 'click', 'ads.campaignTab'),
      s('radius', 'Set the area to 8 km around the clinic', 1400, 'drag', 'ads.radius'),
      s('headline', 'Wrote the first headline within 30 characters', 1500, 'type', 'ads.h1', { typed: 'Same-Week Dental Visits' }),
      s('headlines', 'Added two more headlines and a description', 1100, 'move', 'ads.h2'),
      s('budget', 'Set $25 a day with a monthly cap', 1100, 'type', 'ads.budget', { typed: '25' }),
      s('checks', 'Checked policy, landing page and booking tracking', 1400, 'move', 'ads.checks', { push: true }),
      s('submit', 'Sent the campaign for your approval', 1000, 'click', 'ads.submit'),
      s('result', 'Prepared the review', HOLD),
    ],
    outcome: {
      title: 'Campaign ready for approval',
      state: 'approval',
      lines: [
        { mark: 'pass', label: 'Goal', text: 'Booked appointments, tracked on the confirmation page' },
        { mark: 'pass', label: 'Audience', text: '8 km around Northside Dental' },
        { mark: 'pass', label: 'Keywords', text: '6 booking-intent terms kept, 3 excluded, 4 negatives' },
        { mark: 'pass', label: 'Ads', text: '3 headlines and 2 descriptions within limits' },
        { mark: 'wait', label: 'Budget', text: '$25/day, about $760/month at most, only after you approve' },
      ],
      gate: 'Not published · no money spent',
    },
  },
  {
    id: 'extension',
    label: 'Ship a Chrome Extension',
    request: 'Get my browser extension ready for release. Test it, check permissions and prepare the store submission.',
    steps: [
      s('open', 'Opened the extension project', 900),
      s('manifest', 'Opened manifest.json', 950, 'click', 'ext.manifest'),
      s('perms', 'Flagged permissions broader than the features need', 1500, 'move', 'ext.perm', { pin: { at: 'ext.perm', text: '<all_urls> and history are broader than needed', kind: 'info', until: 'narrow' } }),
      s('narrow', 'Removed history and limited site access', 1300, 'click', 'ext.narrow'),
      s('build', 'Built and packaged version 1.4.0', 1500, 'click', 'ext.build'),
      s('smoke', 'Ran smoke tests in a test browser', 1500, 'click', 'ext.run', { push: true, pin: { at: 'ext.t3', text: 'Fails: can’t read docs.example tabs', kind: 'fail', until: 'repair' } }),
      s('repair', 'Restored access to docs.example only', 1300, 'click', 'ext.repair'),
      s('retest', 'Re-ran the tests: all three pass', 1400, 'click', 'ext.run'),
      s('listing', 'Opened the store listing', 1000, 'click', 'ext.listingTab'),
      s('assets', 'Checked icon, screenshots, privacy answers and size', 1400, 'move', 'ext.checklist'),
      s('submit', 'Prepared the submission for your approval', 1000, 'click', 'ext.submit'),
      s('result', 'Prepared the review', HOLD),
    ],
    outcome: {
      title: 'Release package validated',
      state: 'approval',
      lines: [
        { mark: 'pass', label: 'Package', text: 'TabTidy 1.4.0 built, 412 KB' },
        { mark: 'pass', label: 'Permissions', text: 'history removed; site access limited to 2 domains' },
        { mark: 'pass', label: 'Tests', text: '3 of 3 smoke tests pass after one targeted fix' },
        { mark: 'pass', label: 'Listing', text: 'Icon, screenshots, description and privacy answers ready' },
        { mark: 'wait', label: 'Review', text: 'Store review is decided by Google after you submit' },
      ],
      gate: 'Submission awaits you',
    },
  },
  {
    id: 'outreach',
    label: 'Find Clients & Prepare Outreach',
    request: 'These are my software services. Find suitable businesses and prepare relevant outreach from my connected business account.',
    steps: [
      s('open', 'Read your service description', 900),
      s('brief', 'Set the ideal customer and outreach rules', 1500, 'move', 'out.brief'),
      s('search', 'Searched public business listings', 1300, 'type', 'out.search', { typed: 'dental clinic Northside' }),
      s('visit1', 'Opened Harbor Smiles’ public website', 1300, 'click', 'out.r1'),
      s('qualify', 'Qualified it: phone-only booking, 14 staff', 1400, 'move', 'out.sig1', { pin: { at: 'out.sig1', text: 'Fits: books by phone only', kind: 'pass', until: 'visit2' } }),
      s('visit2', 'Opened Brightway Clinic’s website', 1100, 'click', 'out.r2tab'),
      s('reject', 'Rejected it: already books online', 1400, 'move', 'out.sig2', { pin: { at: 'out.sig2', text: 'Not a fit: already books online', kind: 'fail', until: 'crm' } }),
      s('crm', 'Added qualified businesses to the CRM with sources', 1300, 'click', 'out.crmTab'),
      s('drafts', 'Drafted a different message for each business', 1200, 'click', 'out.mailTab'),
      s('draft1', 'Opened the Harbor Smiles draft', 1300, 'click', 'out.d1'),
      s('queue', 'Queued the drafts for your review', 1100, 'click', 'out.queue'),
      s('result', 'Prepared the review', HOLD),
    ],
    outcome: {
      title: 'Prospects and drafts ready for review',
      state: 'approval',
      lines: [
        { mark: 'pass', label: 'Reviewed', text: '5 public business sites against your criteria' },
        { mark: 'pass', label: 'Qualified', text: '3 clinics, each with a reason and a source link' },
        { mark: 'note', label: 'Rejected', text: 'Brightway Clinic already books online; 1 unclear, held' },
        { mark: 'pass', label: 'Drafts', text: '3 personalised emails with an opt-out line' },
        { mark: 'wait', label: 'Sending', text: 'No mailbox connected in this example; nothing sends without you' },
      ],
      gate: 'Nothing sent · waiting for your review',
    },
  },
];

export const COPY = {
  eyebrow: 'Xroga in action',
  title: 'Give Xroga a task. Or give an AI Employee a job.',
  lede: {
    browser: 'Watch Xroga work through sites and apps, check what happened, and bring back a result you can inspect.',
    workforce: 'Give an AI Employee a responsibility. Stay in the conversation while it works and brings back updates.',
  },
  modes: { browser: 'Browser Automation', workforce: 'AI Employees' },
  disclosure: 'Illustrative examples · sample data',
  conceptTag: 'Concept preview',
  cta: 'Start in Xroga',
  inspect: 'Inspect steps',
};

export const missionOf = (t: TrackId) => MISSIONS.find((m) => `browser:${m.id}` === t);
export const stepsOf = (t: TrackId): Step[] => missionOf(t)!.steps;
export const stepDurations = (t: TrackId) => stepsOf(t).map((x) => x.ms);
/** The first mission when the section is reached. Nothing else plays on its own. */
export const FIRST: TrackId = 'browser:bug';
