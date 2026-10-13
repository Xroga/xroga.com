/**
 * S02 script (V7): the single source of truth for the stage. Four browser missions and six AI Employees, each a
 * short deterministic sequence of causal steps that settles on an inspectable result. Every step names the element
 * the pointer acts on and what changes because of it; components render only what the current and earlier steps
 * say happened. All data is fictional sample data; nothing describes a real account or a real action.
 */

export type Mode = 'browser' | 'employees';
export type MissionId = 'bug' | 'ads' | 'article' | 'extension';
export type EmployeeId = 'engineer' | 'research' | 'acquisition' | 'creative' | 'data' | 'ops';
export type TrackId = `browser:${MissionId}` | `emp:${EmployeeId}` | 'emp:team';
export type Action = 'none' | 'move' | 'click' | 'type' | 'check';
export type XState = 'ready' | 'assigned' | 'working' | 'handoff' | 'approval' | 'done';

export interface Step {
  stepId: string;
  /** Short, plain label for the action (screen-reader caption). */
  label: string;
  /** Which screen of the app is showing. */
  screen: string;
  /** `data-t` of the element the pointer acts on. */
  target: string | null;
  action: Action;
  typed?: string;
  /** A short callout attached to the element where something was found. */
  note?: { at: string; text: string; kind: 'pass' | 'fail' | 'info' };
  /** Camera framing inside the stage: wide, or a gentle push-in on the action. */
  cam?: 'wide' | 'close';
  ms: number;
}

export interface Result {
  title: string;
  state: 'review' | 'approval';
  lines: { mark: 'pass' | 'fail' | 'wait' | 'note'; text: string }[];
  gate: string;
}

export interface Mission {
  id: MissionId;
  label: string;
  app: string;
  request: string;
  url: (screen: string) => string;
  steps: Step[];
  result: Result;
}

const s = (stepId: string, label: string, screen: string, target: string | null, action: Action, ms: number, extra: Partial<Step> = {}): Step => ({ stepId, label, screen, target, action, ms, ...extra });

export const MISSIONS: Mission[] = [
  {
    id: 'bug',
    label: 'Find a website bug',
    app: 'Northwind HQ',
    request: 'Test my app’s team invitation flow like a customer and show me anything broken.',
    url: (sc) => (sc === 'team' || sc === 'invite' || sc === 'error' ? 'app.northwind.example/settings/team' : 'app.northwind.example/dashboard'),
    steps: [
      s('open', 'Open the app', 'home', null, 'none', 900),
      s('team', 'Go to Team settings', 'home', 'nav.team', 'click', 1000),
      s('team-page', 'Team page opens', 'team', null, 'none', 650),
      s('invite', 'Open the invite dialog', 'team', 'team.invite', 'click', 950),
      s('email', 'Enter a sample teammate', 'invite', 'inv.email', 'type', 1300, { typed: 'sam.lee@example.com', cam: 'close' }),
      s('role', 'Choose the Editor role', 'invite', 'inv.role', 'click', 850, { cam: 'close' }),
      s('send', 'Send the invite', 'invite', 'inv.send', 'click', 900, { cam: 'close' }),
      s('fail', 'The invite fails', 'error', 'inv.send', 'check', 1300, { note: { at: 'inv.send', text: 'Invite blocked for a valid Editor role', kind: 'fail' }, cam: 'close' }),
      s('network', 'Inspect the request', 'error', 'dev.request', 'click', 1500, { note: { at: 'dev.request', text: 'POST /api/invites → 403 role_not_permitted', kind: 'fail' } }),
      s('report', 'Report with reproduction steps', 'error', null, 'none', 4200),
    ],
    result: {
      title: 'Invitation flow blocked',
      state: 'review',
      lines: [
        { mark: 'fail', text: 'Admins cannot invite Editors: POST /api/invites returns 403' },
        { mark: 'note', text: 'Repro: Settings → Team → Invite → Editor → Send' },
        { mark: 'pass', text: 'Owner and Viewer invites work' },
      ],
      gate: 'Nothing was changed in your app',
    },
  },
  {
    id: 'ads',
    label: 'Prepare a Google Ad',
    app: 'Ads campaign builder',
    request: 'Prepare a local Google Ads campaign for my clinic. Let me approve the budget first.',
    url: (sc) => (sc === 'landing' ? 'riverside-physio.example' : 'ads.example/campaigns/new'),
    steps: [
      s('landing', 'Read the clinic’s services', 'landing', 'lp.services', 'move', 1300, { note: { at: 'lp.services', text: 'Main service: sports injury physio', kind: 'info' } }),
      s('builder', 'Open a new campaign', 'builder', null, 'none', 800),
      s('goal', 'Goal: appointment bookings', 'builder', 'ad.goal', 'click', 1000),
      s('location', 'Target nearby patients', 'builder', 'ad.location', 'type', 1200, { typed: 'Within 10 km of Riverside' }),
      s('headline', 'Write the ad from the site', 'builder', 'ad.headline', 'type', 1300, { typed: 'Sports injury physio, same week', cam: 'close' }),
      s('url', 'Check the destination', 'builder', 'ad.url', 'check', 1400, { note: { at: 'ad.url', text: '/book returns 404 → switched to /appointments (loads)', kind: 'fail' } }),
      s('budget', 'Propose a daily budget', 'builder', 'ad.budget', 'type', 1100, { typed: '40' }),
      s('done', 'Draft ready for your approval', 'builder', null, 'none', 4200),
    ],
    result: {
      title: 'Campaign draft ready for approval',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Goal: bookings · within 10 km of Riverside' },
        { mark: 'pass', text: 'Ad copy taken from the clinic’s own services page' },
        { mark: 'note', text: 'Destination fixed in the draft: /appointments' },
        { mark: 'wait', text: 'Budget $40 a day (sample) waits for you' },
      ],
      gate: 'Publish locked · no money spent',
    },
  },
  {
    id: 'article',
    label: 'Publish an article',
    app: 'Site editor',
    request: 'Prepare this article on my website, check the layout, and ask before publishing.',
    url: () => 'cms.riverside-physio.example/posts/42',
    steps: [
      s('open', 'Open the draft', 'editor', null, 'none', 900),
      s('heading', 'Make the section a heading', 'editor', 'cms.h2', 'click', 1000),
      s('alt', 'Describe the image', 'editor', 'cms.alt', 'type', 1400, { typed: 'Physio guiding a seated hamstring stretch', cam: 'close' }),
      s('link', 'Repair a broken link', 'editor', 'cms.link', 'click', 1100, { note: { at: 'cms.link', text: 'Link pointed to a deleted page → now /appointments', kind: 'pass' } }),
      s('phone', 'Check the phone layout', 'editor', 'cms.phone', 'click', 1300),
      s('done', 'Ready for publishing review', 'editor', null, 'none', 4200),
    ],
    result: {
      title: 'Ready for publishing review',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Heading structure fixed · image described' },
        { mark: 'pass', text: '1 broken link repaired' },
        { mark: 'pass', text: 'Phone and desktop previews checked' },
        { mark: 'wait', text: 'Publishing waits for your approval' },
      ],
      gate: 'Draft saved · not published',
    },
  },
  {
    id: 'extension',
    label: 'Publish a Chrome extension',
    app: 'Extension release',
    request: 'Get my Chrome extension ready for the Web Store and prepare the submission for my review.',
    url: (sc) => (sc === 'store' ? 'developer.chrome.example/dashboard/tab-tidy' : 'workspace.xroga.example/tab-tidy'),
    steps: [
      s('open', 'Open the extension project', 'project', 'ext.manifest', 'click', 1000),
      s('perm', 'Review requested permissions', 'project', 'ext.perm', 'check', 1300, { note: { at: 'ext.perm', text: '<all_urls> is broader than the extension needs', kind: 'fail' }, cam: 'close' }),
      s('fix', 'Narrow it to activeTab', 'project', 'ext.perm', 'type', 1200, { typed: '"activeTab"', cam: 'close' }),
      s('build', 'Build and validate the package', 'project', 'ext.build', 'click', 1300, { note: { at: 'ext.build', text: 'tab-tidy-1.4.0.zip · 84 KB · manifest v3 valid', kind: 'pass' } }),
      s('popup', 'Try the popup in Chrome', 'project', 'ext.popup', 'click', 1200),
      s('store', 'Open the store listing', 'store', null, 'none', 800),
      s('privacy', 'Complete the privacy answers', 'store', 'st.privacy', 'type', 1300, { typed: 'No user data collected or sold', cam: 'close' }),
      s('done', 'Submission prepared for your review', 'store', null, 'none', 4200),
    ],
    result: {
      title: 'Submission prepared · needs your approval',
      state: 'approval',
      lines: [
        { mark: 'pass', text: 'Version 1.4.0 built and validated' },
        { mark: 'pass', text: 'Permissions narrowed: <all_urls> → activeTab' },
        { mark: 'pass', text: 'Listing, screenshots and privacy answers complete' },
        { mark: 'note', text: 'Submitting starts Google’s review; it is not publication' },
      ],
      gate: 'Submit for review · waits for you',
    },
  },
];

/* ------------------------------------------------------------------------------------------------ AI Employees */

export interface Employee {
  id: EmployeeId;
  name: string;
  /** One readable line: what this employee owns. */
  role: string;
  assignment: string;
  app: string;
  steps: Step[];
  /** An artifact this employee receives at the start or hands on at the end. */
  receives?: string;
  sends?: { title: string; to: EmployeeId };
  deliverable: Result;
}

export const EMPLOYEES: Employee[] = [
  {
    id: 'engineer',
    name: 'Product Engineer',
    role: 'Fixes and ships software changes',
    assignment: 'Repair the broken team-invite flow, run the tests, and prepare a reviewable fix.',
    app: 'Code workspace',
    steps: [
      s('assign', 'Assignment received', 'code', null, 'none', 1700),
      s('open', 'Open the invite handler', 'code', 'eng.file', 'click', 1100),
      s('edit', 'Change the permission check', 'code', 'eng.line', 'type', 1600, { typed: 'if (!canInvite(user, role)) return forbidden()', cam: 'close' }),
      s('test', 'Run the tests', 'code', 'eng.run', 'click', 1500, { note: { at: 'eng.run', text: '3 of 3 tests pass', kind: 'pass' } }),
      s('preview', 'Try the invite in the app', 'code', 'eng.preview', 'move', 1300),
      s('deliver', 'Fix ready for review', 'code', null, 'none', 4200),
    ],
    deliverable: { title: 'Proposed fix · ready for review', state: 'review', lines: [{ mark: 'pass', text: 'invites.ts: role check uses canInvite()' }, { mark: 'pass', text: '3 of 3 tests pass · invite works in preview' }, { mark: 'note', text: 'Pull request opened as a draft' }], gate: 'Merge waits for your review' },
  },
  {
    id: 'research',
    name: 'Research Analyst',
    role: 'Compares sources and recommends',
    assignment: 'Compare three local markets for my physio clinic and recommend where to grow first.',
    app: 'Research desk',
    steps: [
      s('assign', 'Assignment received', 'desk', null, 'none', 1700),
      s('sources', 'Open three sources', 'desk', 'rs.src', 'click', 1200),
      s('compare', 'Compare the markets', 'desk', 'rs.grid', 'move', 1400),
      s('conflict', 'Flag a weak source', 'desk', 'rs.weak', 'check', 1300, { note: { at: 'rs.weak', text: 'Outdated 2019 directory · excluded', kind: 'fail' } }),
      s('rank', 'Rank the options', 'desk', 'rs.top', 'click', 1100),
      s('deliver', 'Brief delivered · shared with Client Acquisition', 'desk', null, 'none', 4200),
    ],
    sends: { title: 'Opportunity brief', to: 'acquisition' },
    deliverable: { title: 'Sourced recommendation', state: 'review', lines: [{ mark: 'pass', text: '1 · Harbor district: most demand, 2 competitors (sample)' }, { mark: 'pass', text: '2 · Old Town  ·  3 · Westfield' }, { mark: 'note', text: 'Opportunity brief handed to the Client Acquisition Specialist' }], gate: 'Sources attached · sample data' },
  },
  {
    id: 'acquisition',
    name: 'Client Acquisition',
    role: 'Finds and qualifies new clients',
    assignment: 'Find businesses that fit my service, qualify them, and prepare outreach for approval.',
    app: 'Prospect board',
    receives: 'Opportunity brief',
    steps: [
      s('assign', 'Opportunity brief received from Research', 'board', null, 'none', 1900),
      s('open', 'Check a company’s website', 'board', 'acq.lead', 'click', 1300),
      s('reject', 'Reject a poor fit', 'board', 'acq.reject', 'click', 1100, { note: { at: 'acq.reject', text: 'Hospital chain · outside your service area', kind: 'fail' } }),
      s('draft', 'Draft a personal note', 'board', 'acq.draft', 'type', 1800, { typed: 'Hi Dana, I saw Harbor Rowing trains 6 days a week…', cam: 'close' }),
      s('review', 'Move it to Review', 'board', 'acq.col', 'click', 1100),
      s('deliver', 'Shortlist and draft ready', 'board', null, 'none', 4200),
    ],
    deliverable: { title: '3 qualified leads · 1 draft for approval', state: 'approval', lines: [{ mark: 'pass', text: 'Based on the Harbor district brief' }, { mark: 'pass', text: '1 poor fit removed with the reason' }, { mark: 'wait', text: 'Outreach to Harbor Rowing waits for you' }], gate: 'Nothing sent' },
  },
  {
    id: 'creative',
    name: 'Creative Producer',
    role: 'Turns briefs into campaign assets',
    assignment: 'Turn my product brief into a launch concept and editable content assets.',
    app: 'Creative canvas',
    steps: [
      s('assign', 'Assignment received', 'canvas', null, 'none', 1700),
      s('frames', 'Lay out the story frames', 'canvas', 'cr.frames', 'move', 1300),
      s('direction', 'Pick direction B', 'canvas', 'cr.dirB', 'click', 1100),
      s('crop', 'Check the phone crop', 'canvas', 'cr.phone', 'check', 1300, { note: { at: 'cr.phone', text: 'Headline clears the safe area', kind: 'pass' } }),
      s('caption', 'Write the caption', 'canvas', 'cr.caption', 'type', 1500, { typed: 'Back on the court, sooner.', cam: 'close' }),
      s('deliver', 'Creative pack ready', 'canvas', null, 'none', 4200),
    ],
    deliverable: { title: 'Launch creative pack', state: 'review', lines: [{ mark: 'pass', text: '3 story frames · direction B' }, { mark: 'pass', text: 'Feed, story and phone crops checked' }, { mark: 'note', text: 'Editable layouts, nothing posted' }], gate: 'Ready for your review' },
  },
  {
    id: 'data',
    name: 'Data & Finance',
    role: 'Reconciles numbers you can trust',
    assignment: 'Reconcile March invoices against payments, flag anything off, and summarise.',
    app: 'Ledger',
    steps: [
      s('assign', 'Assignment received', 'sheet', null, 'none', 1700),
      s('map', 'Match the columns', 'sheet', 'dt.map', 'click', 1200),
      s('match', 'Match invoices to payments', 'sheet', 'dt.rows', 'move', 1400),
      s('flag', 'Flag a mismatch', 'sheet', 'dt.flag', 'check', 1400, { note: { at: 'dt.flag', text: 'INV-2214 paid $1,240 vs billed $1,420', kind: 'fail' } }),
      s('summary', 'Write the summary', 'sheet', 'dt.sum', 'move', 1200),
      s('deliver', 'Reconciliation ready', 'sheet', null, 'none', 4200),
    ],
    deliverable: { title: 'March reconciliation', state: 'review', lines: [{ mark: 'pass', text: '46 of 48 invoices matched (sample data)' }, { mark: 'fail', text: '2 flagged: short payment, duplicate charge' }, { mark: 'note', text: 'Audit trail of every match attached' }], gate: 'No records changed' },
  },
  {
    id: 'ops',
    name: 'Operations Manager',
    role: 'Keeps bookings and requests moving',
    assignment: 'Handle new booking requests, check the calendar, update the CRM, and draft replies I approve.',
    app: 'Operations desk',
    steps: [
      s('assign', 'Assignment received', 'ops', null, 'none', 1700),
      s('classify', 'Read a new request', 'ops', 'op.msg', 'click', 1200),
      s('slot', 'Find a free slot', 'ops', 'op.slot', 'click', 1200),
      s('crm', 'Update the client record', 'ops', 'op.crm', 'click', 1100),
      s('reply', 'Draft the reply', 'ops', 'op.reply', 'type', 1700, { typed: 'Hi Maria, Thursday 10:30 is free. Shall I book it?', cam: 'close' }),
      s('deliver', 'Waiting for your OK', 'ops', null, 'none', 4200),
    ],
    deliverable: { title: 'Booking held · reply ready', state: 'approval', lines: [{ mark: 'pass', text: 'Thu 10:30 held for Maria Ortiz' }, { mark: 'pass', text: 'CRM: status Slot proposed' }, { mark: 'wait', text: 'Reply waits for your approval' }], gate: 'Nothing sent' },
  },
];

/* ------------------------------------------------------------------------------------------------ tracks */

export const missionOf = (t: TrackId) => MISSIONS.find((m) => `browser:${m.id}` === t);
export const employeeOf = (t: TrackId) => EMPLOYEES.find((e) => `emp:${e.id}` === t);
export const modeOf = (t: TrackId): Mode => (t.startsWith('browser:') ? 'browser' : 'employees');
/** Entering AI Employees: the orb energizes and the six companions take formation, then the visitor chooses. */
export const TEAM_STEPS: Step[] = [s('formation', 'Your AI Employees take formation', 'team', null, 'none', 2200)];
export const stepsOf = (t: TrackId): Step[] => (t === 'emp:team' ? TEAM_STEPS : (missionOf(t)?.steps ?? employeeOf(t)?.steps ?? []));
export const stepDurations = (t: TrackId): number[] => stepsOf(t).map((x) => x.ms);
/** Nothing chains from one track to the next; kept for the reducer's type. */
export const AUTO_ORDER: TrackId[] = ['browser:bug'];

export const COPY = {
  eyebrow: 'XROGA IN ACTION',
  title: 'Give the work to Xroga. Watch it happen.',
  support: 'See Xroga work through websites, or explore specialized AI Employees taking on different responsibilities.',
  modes: { browser: 'Browser Automation', employees: 'AI Employees' } as Record<Mode, string>,
  illustrative: 'Illustrative experience · sample data',
  availability: 'Today Xroga runs browser checks on websites it builds. Broader browser automation and AI Employees are in development.',
  cta: 'Start in Xroga',
};

/** Words a scripted illustration must never use to describe its own outcome. */
export const FORBIDDEN_CLAIMS = /\b(Live|Published|Sent|24\/7|Merged|Deployed|Launched)\b/;
