/**
 * S02 script (V12), AI Employees half: six example specialists, each owning an ongoing responsibility, reached
 * through its OWN conversation and backed by its OWN computer. The visitor assigns the job in chat, the employee
 * clarifies scope or permissions, accepts with a visible assignment card, works (its computer changes beat by
 * beat), comes back after a time skip with a report in the same chat, and answers follow-ups (including refusing
 * actions it isn't allowed to take, and asking before anything external or destructive).
 *
 * These are deterministic sample conversations, not a live model: the composer only continues the sample script.
 * AI Employees are a coming-soon Xroga capability; nothing here runs on a schedule, contacts a service, trades,
 * merges, sends or edits anything. All names, companies and figures are fictional.
 */

export type EmployeeId = 'seo' | 'trading' | 'intake' | 'reliability' | 'scout' | 'data';
/** Which of the six tinted glass-X character images the employee wears. */
export type Art = 'research' | 'ops' | 'growth' | 'builder' | 'creative' | 'data';
export type ThreadState = 'ready' | 'thinking' | 'working' | 'waiting' | 'report' | 'decision' | 'blocked';

export type Card =
  | { kind: 'assignment'; rows: [string, string][] }
  | { kind: 'report'; title: string; meta: string; cta: string }
  | { kind: 'gate'; question: string }
  | { kind: 'blocked'; text: string }
  | { kind: 'done'; text: string };

/** A message the user sends; the script waits here until the visitor sends it (or picks the suggestion). */
export interface UserBeat {
  t: 'user';
  text: string;
  /** Short label on the suggestion chip. */
  chip: string;
  at: string;
}
/** An employee reply, posted after a short delay with a typing cue. */
export interface EmpBeat {
  t: 'emp';
  text: string;
  at: string;
  card?: Card;
  /** The employee's computer moves to this stage when the message lands. */
  ws?: number;
  state?: ThreadState;
  delay?: number;
}
/** Visible work on the employee's computer, with one status line in the chat header. */
export interface WorkBeat {
  t: 'work';
  status: string;
  ws: number;
  delay?: number;
}
/** Time passes: a divider in the chat, the clock moves on. */
export interface SkipBeat {
  t: 'skip';
  label: string;
  at: string;
  delay?: number;
}
export type Beat = UserBeat | EmpBeat | WorkBeat | SkipBeat;

export interface Followup {
  id: string;
  chip: string;
  text: string;
  /** Extra words that also select this follow-up when typed. */
  keys: string[];
  reply: EmpBeat[];
}

export interface Employee {
  id: EmployeeId;
  role: string;
  short: string;
  art: Art;
  accent: string;
  idle: 'nod' | 'sway' | 'tilt' | 'settle' | 'breathe' | 'bob';
  /** The standing responsibility, in a few words, for the selector. */
  job: string;
  /** When it works (schedule or trigger). */
  cadence: string;
  /** The employee's computer: window title and its app tabs. */
  computer: { title: string; tabs: string[] };
  script: Beat[];
  followups: Followup[];
}

const u = (text: string, chip: string, at: string): UserBeat => ({ t: 'user', text, chip, at });
const e = (text: string, at: string, extra: Partial<EmpBeat> = {}): EmpBeat => ({ t: 'emp', text, at, ...extra });
const w = (status: string, ws: number, delay = 1500): WorkBeat => ({ t: 'work', status, ws, delay });
const skip = (label: string, at: string): SkipBeat => ({ t: 'skip', label, at, delay: 900 });

export const EMPLOYEES: Employee[] = [
  {
    id: 'seo',
    role: 'SEO & Search Researcher',
    short: 'SEO Researcher',
    art: 'research',
    accent: '#9b7bff',
    idle: 'tilt',
    job: 'Weekly keyword brief',
    cadence: 'Every Monday · 09:00',
    computer: { title: 'SEO Researcher’s computer', tabs: ['Search Console', 'Competitor pages', 'Keyword clusters', 'Brief'] },
    script: [
      u('Every Monday, find low-competition local keywords for my dental clinic in Dubai, compare competing pages, and send me a prioritized SEO brief.', 'Assign the weekly brief', 'Mon 08:58'),
      e('I can do that. I’ll compare search intent, competing pages and your site. Can I use your connected Search Console and the public websites you approve?', 'Mon 08:58', { state: 'waiting' }),
      u('Yes. Send the brief every Monday, and ask before editing the site.', 'Yes, ask before editing', 'Mon 08:59'),
      e('Assigned. First scan started. I’ll save the evidence and come back here with ranked opportunities.', 'Mon 09:00', {
        card: { kind: 'assignment', rows: [['Responsibility', 'Weekly local SEO brief'], ['When', 'Every Monday · 09:00'], ['Can use', 'Search Console (read), sites you approve'], ['Asks before', 'Editing your website'], ['Delivers', 'Ranked keyword brief with evidence']] },
        state: 'working',
        ws: 1,
      }),
      w('Reading Search Console · last 28 days', 1, 1700),
      w('Comparing 12 competing pages for “emergency dentist”', 2, 1700),
      w('Grouping 46 search terms into 7 clusters', 3, 1700),
      skip('2 h 38 min later', 'Mon 11:38'),
      e('First brief ready: 7 promising local keywords, 3 pages to improve and 2 issues worth fixing.', 'Mon 11:38', {
        card: { kind: 'report', title: 'SEO brief · week 1', meta: '7 keywords · 3 page fixes · sources attached', cta: 'Open report' },
        state: 'report',
        ws: 4,
      }),
    ],
    followups: [
      {
        id: 'top3',
        chip: 'Show me the top three',
        text: 'Show me the top three.',
        keys: ['top three', 'top 3'],
        reply: [e('Top three: “emergency dentist Al Barsha” (competitor pages are thin), “kids dentist JLT” (you have no page for it yet) and “Invisalign cost Dubai” (your price page could answer it). Action plan is on my screen.', 'Mon 11:41', { ws: 5, state: 'report' })],
      },
      {
        id: 'edit',
        chip: 'Update the Invisalign page',
        text: 'Go ahead and update the Invisalign page.',
        keys: ['invisalign', 'update the page', 'edit'],
        reply: [e('You asked me to check before editing, so I’ve drafted the change instead: a price range, an FAQ and a booking link. Publish it?', 'Mon 11:44', { ws: 6, state: 'decision', card: { kind: 'gate', question: 'Publish the Invisalign page update?' } })],
      },
      {
        id: 'next',
        chip: 'What happens next week?',
        text: 'What happens next week?',
        keys: ['next week', 'next monday', 'what changed'],
        reply: [e('Next Monday at 09:00 I’ll compare rankings against this baseline and tell you what moved, what’s new and what to fix first.', 'Mon 11:45', { state: 'report' })],
      },
    ],
  },
  {
    id: 'trading',
    role: 'Trading Strategy Researcher',
    short: 'Trading Researcher',
    art: 'ops',
    accent: '#e4b650',
    idle: 'breathe',
    job: 'Options strategy research',
    cadence: 'Weekdays after market close',
    computer: { title: 'Trading Researcher’s computer', tabs: ['Notebook', 'Backtest', 'Costs & risk', 'Watchlist'] },
    script: [
      u('Research defined-risk option strategies for liquid stocks, compare historical outcomes across market regimes, and update me when the evidence changes. Do not place trades.', 'Assign the research', 'Mon 16:30'),
      e('Understood: research only, no trading. Which instruments and horizon? I suggest large-cap US stocks and ETFs, 30–45 day options, using 2015–2025 history.', 'Mon 16:31', { state: 'waiting' }),
      u('Use that. Include fees and slippage, and keep everything as paper results.', 'Use that, include costs', 'Mon 16:32'),
      e('Assigned. I’ll test three strategies and report back with risks, not predictions.', 'Mon 16:33', {
        card: { kind: 'assignment', rows: [['Responsibility', 'Options strategy research'], ['When', 'Weekdays after close, and when results change'], ['Can use', 'Historical price and options data, research notebook'], ['Never', 'Places trades or connects to a broker'], ['Delivers', 'Research memo with costs and drawdowns']] },
        state: 'working',
        ws: 1,
      }),
      w('Loading option chains for 40 liquid tickers', 1, 1700),
      w('Backtesting 3 strategies across calm, trending and stressed markets', 2, 1700),
      w('Applying fees and slippage', 3, 1700),
      skip('next day, after close', 'Tue 17:10'),
      e('Research note ready. Iron condors did well in calm markets but lost most gains after costs in stressed periods. ETF put credit spreads were steadier. This is paper research, not a prediction.', 'Tue 17:10', {
        card: { kind: 'report', title: 'Research memo · 3 strategies', meta: '2015–2025 · costs included · out-of-sample flagged', cta: 'Open memo' },
        state: 'report',
        ws: 4,
      }),
    ],
    followups: [
      {
        id: 'stress',
        chip: 'Stress test the spreads',
        text: 'Stress test the ETF spreads.',
        keys: ['stress'],
        reply: [e('Done. In the 2020 and 2022 sell-offs the spreads lost up to 9% of allocated risk in a month before recovering. Out-of-sample results are weaker than in-sample; I’ve flagged that in the memo.', 'Tue 17:16', { ws: 5, state: 'report' })],
      },
      {
        id: 'trade',
        chip: 'Place the trade for me',
        text: 'Looks good. Place the trade for me.',
        keys: ['place', 'trade', 'buy', 'execute'],
        reply: [e('I can’t do that. You told me not to trade, and I’m not connected to any broker. I can prepare a checklist to review with your broker instead.', 'Tue 17:18', { state: 'blocked', card: { kind: 'blocked', text: 'Trading is not permitted for this employee' } })],
      },
      {
        id: 'why',
        chip: 'Why drop the condor?',
        text: 'Why did you drop the iron condor?',
        keys: ['condor', 'why'],
        reply: [e('After fees and slippage its edge disappears in volatile periods, and its worst month was three times larger. It stays on the watchlist for a re-test next quarter.', 'Tue 17:20', { ws: 6, state: 'report' })],
      },
    ],
  },
  {
    id: 'intake',
    role: 'Client Intake & Pre-Meeting Analyst',
    short: 'Intake Analyst',
    art: 'growth',
    accent: '#ff7d5c',
    idle: 'bob',
    job: 'Meeting briefs for new bookings',
    cadence: 'When someone books a call',
    computer: { title: 'Intake Analyst’s computer', tabs: ['Bookings', 'Company site', 'CRM', 'Meeting brief'] },
    script: [
      u('Whenever someone books a consultation or orders a service, review their public company site and what they submitted, update my CRM, and prepare my meeting brief.', 'Assign meeting prep', 'Wed 09:10'),
      e('Happy to. I’ll only use what they submit plus their public website. Should I write to your CRM directly, or show you each update first?', 'Wed 09:10', { state: 'waiting' }),
      u('Show me each CRM update first, and brief me an hour before the call.', 'Show me first', 'Wed 09:11'),
      e('Assigned. I’m watching your booking form now. Nothing to do until someone books.', 'Wed 09:12', {
        card: { kind: 'assignment', rows: [['Responsibility', 'Prepare for every new client meeting'], ['When', 'Each new booking or order'], ['Can use', 'Booking form, public company site, CRM'], ['Asks before', 'Changing any CRM record'], ['Delivers', 'One-page brief an hour before the call']] },
        state: 'waiting',
        ws: 1,
      }),
      skip('new booking received', 'Wed 14:05'),
      e('New booking: River Dental, Thursday 10:00 with Dr. Amira Haddad. Reviewing their form and website now.', 'Wed 14:05', { ws: 2, state: 'working' }),
      w('Reading riverdental.example · services, locations, booking', 3, 1700),
      e('Brief ready for Thursday’s call: 3 clinics, booking by phone only, and their form mentions no-shows twice. 3 questions worth asking. The CRM update is waiting for you.', 'Wed 14:11', {
        card: { kind: 'report', title: 'Meeting brief · River Dental', meta: 'Thu 10:00 · sources linked · CRM update pending', cta: 'Open brief' },
        state: 'decision',
        ws: 4,
      }),
    ],
    followups: [
      {
        id: 'correct',
        chip: 'They have 2 clinics, not 3',
        text: 'Correction: they have 2 clinics. The third one closed.',
        keys: ['2 clinics', 'two clinics', 'correction', 'closed'],
        reply: [e('Updated. The brief and CRM draft now say 2 clinics, and I noted the closed location as a conflicting source.', 'Wed 14:14', { ws: 5, state: 'decision' })],
      },
      {
        id: 'crm',
        chip: 'Approve the CRM update',
        text: 'Approve the CRM update.',
        keys: ['approve', 'crm'],
        reply: [e('Saved in this preview: company, contact, booking source and meeting date. Nothing else changed.', 'Wed 14:16', { ws: 6, state: 'report', card: { kind: 'done', text: 'CRM update approved (sample)' } })],
      },
      {
        id: 'ask',
        chip: 'What should I ask first?',
        text: 'What should I ask first?',
        keys: ['ask first', 'question'],
        reply: [e('Start with no-shows: their form mentions missed appointments twice. Then ask how they handle bookings across their clinics today.', 'Wed 14:17', { ws: 4, state: 'report' })],
      },
    ],
  },
  {
    id: 'reliability',
    role: 'Software Reliability Engineer',
    short: 'Reliability Engineer',
    art: 'builder',
    accent: '#4f86ff',
    idle: 'nod',
    job: 'Critical bug queue',
    cadence: 'Weekdays 08:00 · and when CI fails',
    computer: { title: 'Reliability Engineer’s computer', tabs: ['Issues', 'Reproduce', 'Diff & CI', 'Pull request'] },
    script: [
      u('Own the customer dashboard’s critical bug queue. Reproduce issues, write tests, open reviewable fixes, and ask before merging or deploying.', 'Assign the bug queue', 'Mon 08:40'),
      e('I’ll take it. Can I use the dashboard repository, CI and a staging browser? I won’t touch production.', 'Mon 08:40', { state: 'waiting' }),
      u('Yes: repo, CI and staging only. Daily digest at 9.', 'Yes, staging only', 'Mon 08:41'),
      e('Assigned. Triaging the queue now.', 'Mon 08:42', {
        card: { kind: 'assignment', rows: [['Responsibility', 'Critical bug queue for the dashboard'], ['When', 'Weekdays 08:00, and when CI fails'], ['Can use', 'Repository branches, CI, staging browser'], ['Asks before', 'Merging or deploying'], ['Delivers', 'Tested pull requests and a daily digest']] },
        state: 'working',
        ws: 1,
      }),
      w('Triaging 3 new critical issues', 1, 1600),
      w('Reproducing #487 in staging with a browser test', 2, 1800),
      w('Writing a failing test, then the fix', 3, 1800),
      skip('next morning, daily digest', 'Tue 09:00'),
      e('Daily digest: #487 reproduced and fixed in PR #212 (18 tests pass, including a new one). #489 needs a product decision. Nothing merged.', 'Tue 09:00', {
        card: { kind: 'report', title: 'PR #212 · Keep session on project switch', meta: '+6 −2 · 18 of 18 tests · staging verified', cta: 'Review change' },
        state: 'decision',
        ws: 4,
      }),
    ],
    followups: [
      {
        id: 'what',
        chip: 'What broke?',
        text: 'What broke?',
        keys: ['what broke', 'why', 'cause'],
        reply: [e('Switching projects called signOut(), which cleared the session. The fix switches the project context instead, and a new test covers it.', 'Tue 09:04', { ws: 5, state: 'decision' })],
      },
      {
        id: 'merge',
        chip: 'Approve the merge',
        text: 'Reviewed. Approve the merge.',
        keys: ['approve', 'merge'],
        reply: [e('Approved in this preview: PR #212 would merge to main. Deploying still waits for your go-ahead.', 'Tue 09:06', { ws: 6, state: 'decision', card: { kind: 'gate', question: 'Deploy to production?' } })],
      },
      {
        id: 'deploy',
        chip: 'Just deploy it now',
        text: 'Skip review and deploy it now.',
        keys: ['deploy', 'ship'],
        reply: [e('I’ll wait. Deploying needs your approval after review, and #212 hasn’t been reviewed yet. Staging checks are 4 of 4 green when you’re ready.', 'Tue 09:07', { state: 'blocked', card: { kind: 'blocked', text: 'Deploying needs a reviewed, approved change' } })],
      },
    ],
  },
  {
    id: 'scout',
    role: 'Growth & Market Scout',
    short: 'Market Scout',
    art: 'creative',
    accent: '#f06aa8',
    idle: 'sway',
    job: 'Weekly opportunity note',
    cadence: 'Every Friday · 10:00',
    computer: { title: 'Market Scout’s computer', tabs: ['Competitors', 'Customer pain', 'Opportunities', 'Experiment'] },
    script: [
      u('Track demand signals and competitor changes for my agency. Once a week, suggest concrete service opportunities and experiments worth testing.', 'Assign weekly scouting', 'Fri 08:15'),
      e('Got it. Which industry and region? And should I include outreach drafts, or research only?', 'Fri 08:15', { state: 'waiting' }),
      u('Healthcare clinics in the UAE. Research only for now, no outreach.', 'Clinics in the UAE, research only', 'Fri 08:16'),
      e('Assigned. Starting with competitor changes this week.', 'Fri 08:17', {
        card: { kind: 'assignment', rows: [['Responsibility', 'Find growth opportunities for your agency'], ['When', 'Every Friday · 10:00'], ['Can use', 'Competitor sites, public reviews, job posts, news'], ['Never', 'Contacts anyone without your approval'], ['Delivers', '3 ranked opportunities and a test plan']] },
        state: 'working',
        ws: 1,
      }),
      w('Checking 18 competitor sites for changes', 1, 1700),
      w('Reading 240 public reviews for common complaints', 2, 1700),
      w('Scoring opportunities by demand, fit and effort', 3, 1700),
      skip('weekly note', 'Fri 10:00'),
      e('This week’s note: 3 opportunities. Strongest: clinics complaining about online booking (52 mentions). Two weak ideas rejected. Sources attached.', 'Fri 10:00', {
        card: { kind: 'report', title: 'Opportunity note · week 41', meta: '3 ranked · 2 rejected · 31 sources', cta: 'Open note' },
        state: 'report',
        ws: 4,
      }),
    ],
    followups: [
      {
        id: 'test',
        chip: 'Plan a test for #1',
        text: 'Plan a test for the first opportunity.',
        keys: ['test', 'experiment', 'plan'],
        reply: [e('Experiment brief ready: a two-week landing page offering “online booking set up in 7 days” for 40 clinics. Success means 5 qualified calls. Any outreach would need your approval.', 'Fri 10:06', { ws: 5, state: 'report' })],
      },
      {
        id: 'rejected',
        chip: 'Why reject the others?',
        text: 'Why did you reject the other ideas?',
        keys: ['reject', 'others'],
        reply: [e('“AI receptionist” had demand, but 6 competitors launched it this month. “Clinic SEO” overlaps your SEO Researcher’s job, so I left it out.', 'Fri 10:08', { ws: 6, state: 'report' })],
      },
      {
        id: 'outreach',
        chip: 'Draft outreach too',
        text: 'Draft outreach emails for the first opportunity.',
        keys: ['outreach', 'email', 'draft'],
        reply: [e('I can, but you set this job to research only. Shall I change the responsibility to include drafts for your review? I won’t send anything.', 'Fri 10:09', { state: 'decision', card: { kind: 'gate', question: 'Allow outreach drafts (review before sending)?' } })],
      },
    ],
  },
  {
    id: 'data',
    role: 'Data & Operations Steward',
    short: 'Data Steward',
    art: 'data',
    accent: '#3fd6c6',
    idle: 'settle',
    job: 'Nightly record reconciliation',
    cadence: 'Every night · 01:00',
    computer: { title: 'Data Steward’s computer', tabs: ['Sources', 'Reconcile', 'Change log', 'Held rows'] },
    script: [
      u('Each night, reconcile customer records between the CRM and our permitted files. Repair safe formatting problems and ask before deleting or merging uncertain records.', 'Assign nightly checks', 'Mon 18:20'),
      e('Will do. Which files can I read, and where should the clean export go?', 'Mon 18:20', { state: 'waiting' }),
      u('The billing export and the customer sheet. Put the clean export in Reports.', 'Billing export + sheet', 'Mon 18:21'),
      e('Assigned. First run tonight at 01:00.', 'Mon 18:22', {
        card: { kind: 'assignment', rows: [['Responsibility', 'Keep customer records consistent'], ['When', 'Every night · 01:00'], ['Can use', 'CRM (read), billing export, customer sheet'], ['Asks before', 'Deleting or merging any record'], ['Delivers', 'Clean export, change log, held exceptions']] },
        state: 'waiting',
        ws: 1,
      }),
      skip('overnight run', 'Tue 01:00'),
      w('Importing 3 sources · 4,812 rows', 1, 1500),
      w('Matching records across CRM, billing and sheet', 2, 1700),
      w('Applying 37 safe formatting fixes (all reversible)', 3, 1700),
      e('Nightly report: 4,812 rows checked, 37 safe fixes, 4 exceptions held. Nothing deleted or merged. Clean export saved to Reports.', 'Tue 07:30', {
        card: { kind: 'report', title: 'Nightly report · Tue', meta: '37 fixes · 4 held · fully reversible', cta: 'Inspect work' },
        state: 'decision',
        ws: 4,
      }),
    ],
    followups: [
      {
        id: 'explain',
        chip: 'Explain the 4 exceptions',
        text: 'Explain the 4 exceptions.',
        keys: ['explain', 'exceptions', 'held'],
        reply: [e('Two look like the same customer with different billing IDs, one has no email and an unclear city, and one looks like test data. The evidence is on my screen.', 'Tue 07:34', { ws: 5, state: 'decision' })],
      },
      {
        id: 'merge',
        chip: 'Merge the two Maya Chens',
        text: 'Those two are the same person. Merge them.',
        keys: ['merge', 'maya'],
        reply: [e('Merged in this preview after your approval. I kept both billing IDs and logged the change so it can be undone.', 'Tue 07:36', { ws: 6, state: 'report', card: { kind: 'done', text: 'Merge approved and logged (sample)' } })],
      },
      {
        id: 'undo',
        chip: 'Can you undo last night?',
        text: 'Can you undo last night’s fixes?',
        keys: ['undo', 'roll back', 'revert'],
        reply: [e('Yes. Every fix is logged with its old value, so I can roll back all 37 in one step. Do you want me to?', 'Tue 07:37', { ws: 6, state: 'decision', card: { kind: 'gate', question: 'Roll back all 37 fixes?' } })],
      },
    ],
  },
];

/** The default employee shown after the team entrance. */
export const FIRST_EMPLOYEE: EmployeeId = 'seo';
/** The team entrance, once per visit. */
export const INTRO_MS = 2200;
export const employeeOf = (id: EmployeeId) => EMPLOYEES.find((x) => x.id === id)!;
