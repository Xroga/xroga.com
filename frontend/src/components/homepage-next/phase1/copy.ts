/**
 * Every visible S00 string. Kept in one place so the human-craft rules can be tested: no long dashes,
 * no stock AI phrasing (orchestration.test.ts).
 */

export const COPY = {
  /** The final brand line. One line on desktop, "Xroga for / everything." on phones. */
  title: 'Xroga for everything.',
  /** The fixed lead. It never moves; only the capability phrase after it changes. */
  lead: 'One workspace to',
  /** The one static phrase used when motion is reduced (no carousel). */
  reducedPhrase: 'build, operate and keep work moving',
  placeholder: 'What should Xroga get done?',
  connect: 'Connect to use',
  send: 'Send to Xroga',
} as const;

/** The heading of the right side for each of its three modes. */
export const MODE_TITLE = {
  tools: 'Tools for this job',
  sources: 'Research sources',
  plan: 'Cleanup plan',
} as const;

/** One scene per key; each owns exactly one capability phrase. */
export type PhraseKey = keyof typeof COMMANDS;

/** The capability phrase for each scene. Never shown for an unrelated work object. */
export const PHRASES: Record<PhraseKey, string> = {
  saas: 'build production software',
  qa: 'test and repair product flows',
  clinic: 'automate real business operations',
  research: 'research, compare and decide',
  platforms: 'ship across web, Chrome, iOS and Android',
  cleanup: 'keep important work running',
  growth: 'grow what you launch',
};

/** Measured phone variants, same meaning, never a smaller font. */
export const PHRASES_MOBILE: Record<PhraseKey, string> = {
  saas: 'build production software',
  qa: 'repair product flows',
  clinic: 'automate business operations',
  research: 'research and decide',
  platforms: 'ship across platforms',
  cleanup: 'keep work running',
  growth: 'grow what you launch',
};

/** The command for each scene. Serious, multi-stage outcomes only. */
export const COMMANDS = {
  saas: 'Build a multi-tenant client portal with authentication, billing, admin roles, onboarding and analytics. Test the critical flows and ship the production release.',
  qa: 'Audit my checkout and onboarding in the browser, find every broken critical flow, repair the failures, re-test the full path, and prepare the corrected release.',
  clinic:
    'Build an automation system for my dental clinic that captures new inquiries, qualifies patients, books appointments, follows up with no-shows, updates the CRM, and returns a daily operations report.',
  research: 'Research X, Google and Reddit and find strong ideas for my next startup or hackathon project.',
  platforms:
    'Take my existing SaaS and release it as a Chrome extension, iOS app and Android app while keeping one backend, one authentication system and shared product state.',
  cleanup: 'Clean this customer database, merge duplicates, fix invalid fields and prepare a safe cleaned copy.',
  growth:
    'Audit our market, SEO, ads, funnel and product analytics, identify the biggest growth constraint, launch the highest-impact fix, and keep measuring whether it works.',
} as const;

/** Display-only short versions for phones, same intent. Visitors can still type anything. */
export const COMMANDS_MOBILE: Record<keyof typeof COMMANDS, string> = {
  saas: 'Build this SaaS with auth, billing, roles and analytics. Test it and ship it.',
  qa: 'Audit this checkout, repair every critical failure, re-test it and ship the fix.',
  clinic: 'Automate inquiries, booking, follow-ups, CRM updates and daily reporting for my dental clinic.',
  research: 'Research X, Google and Reddit for strong startup or hackathon ideas.',
  platforms: 'Take this SaaS to Chrome, iOS and Android with one backend and shared state.',
  cleanup: 'Clean this customer database and prepare a safe cleaned copy.',
  growth: 'Find our biggest growth constraint, launch the best fix and keep measuring it.',
};

/** Research sources: what each one is read for, before and after Xroga reads it. Evidence, not connections. */
export const SOURCE_COPY = {
  x: { name: 'X', idle: 'Search', found: 'Discussions found' },
  reddit: { name: 'Reddit', idle: 'Search', found: 'Pain points found' },
  google: { name: 'Google', idle: 'Search', found: 'Existing products' },
  web: { name: 'Web', idle: 'Search', found: 'Search' },
} as const;

/**
 * Cleanup plan rows, in the order Xroga applies them, with the step that completes each. Each row shows what
 * changes (`from` and `to`), not only the name of the task.
 */
export const PLAN = [
  { fx: 'merged', kind: 'Duplicate', from: '2 records', to: '1 canonical row', note: 'Same identity, merged' },
  { fx: 'fixed', kind: 'Email', from: 'Ben@Acme,com', to: 'ben@acme.com', note: 'Format repaired' },
  { fx: 'normalized', kind: 'Normalize', from: 'LUMEN, active', to: 'Lumen, Active', note: '2 values made consistent' },
  { fx: 'held', kind: 'Review', from: 'Dana Moss', to: 'Held for approval', note: 'Missing email', review: true },
] as const;

/** The validation pass Xroga runs over the cleaned table, and the result line. */
export const VALIDATION = {
  checks: ['Duplicates clear', 'Formats valid', 'Fields normalized'],
  result: 'Cleaned copy ready',
} as const;

/** Text inside the work objects. Each object should read from silhouette, one title, a control or two and one status. */
export const WORK_COPY = {
  brief: { title: 'Client portal brief', meta: 'PDF, 6 pages', reqs: ['Tenants and roles', 'Billing', 'Analytics'] },
  saas: {
    url: 'portal.northwind.app',
    nav: ['Workspace', 'Billing', 'Admin', 'Analytics'],
    title: 'Northwind portal',
    auth: 'Signed in as owner',
    plan: 'Pro plan, billed monthly',
    roles: ['Admin', 'Member', 'Client'],
    test: 'Run critical flows',
    branch: 'main',
    status: {
      shell: 'App shell and roles ready',
      auth: 'Authentication working',
      billing: 'Billing connected',
      repo: 'Committed to main',
      live: 'Production release ready',
    },
  },
  qa: {
    url: 'northwind.app/checkout',
    steps: ['Checkout', 'Onboarding'],
    email: 'ana@northwind.app',
    card: 'Card ending 4242',
    pay: 'Pay',
    welcome: 'Set up your workspace',
    defect: 'Step failed',
    isolated: '1 issue isolated',
    fixTag: 'fix/checkout',
    status: {
      start: 'Testing checkout',
      failed: 'Payment step fails',
      isolated: 'Failure isolated in the payment step',
      repaired: 'Payment step repaired',
      committed: 'Fix committed to the repository',
      paid: 'Test payment confirmed',
      verified: 'Full path verified',
      released: 'Corrected release ready',
    },
  },
  clinic: {
    title: 'Clinic front desk',
    worker: 'Xroga worker',
    nodes: {
      inquiry: 'New inquiry',
      qualified: 'Qualified',
      booked: 'Booked 10:30',
      crm: 'CRM updated',
      followup: 'No-show follow-up',
    },
    status: {
      inquiry: 'New inquiry captured',
      qualified: 'New inquiry qualified',
      booked: 'Appointment booked for 10:30',
      crm: 'Patient record updated in the CRM',
      followup: 'No-show follow-up prepared',
    },
  },
  research: {
    title: 'Idea research',
    steps: ['Define search angles', 'Compare repeated pain points', 'Rank opportunities'],
    ideas: [
      { title: 'AI QA agent for small SaaS teams', why: 'Same pain in many threads' },
      { title: 'Recovery agent for broken automations', why: 'Strong urgency, weak current tools' },
      { title: 'Research-to-launch brief generator', why: 'Buildable in hackathon scope' },
    ],
    status: {
      plan: 'Planning the research',
      x: 'Reading discussions on X',
      reddit: 'Reading Reddit threads',
      google: 'Checking existing products',
      compare: 'Comparing repeated pain points',
      rank: '3 strong directions found',
    },
  },
  platforms: {
    web: 'Web app',
    core: 'One backend, one sign-in, shared state',
    extension: 'Extension',
    ios: 'iOS',
    android: 'Android',
    ready: 'Ready to submit to all three stores',
    status: {
      inspected: 'Existing product inspected',
      core: 'Shared core mapped',
      variants: 'Chrome, iOS and Android apps built',
      built: 'Release source tagged in the repository',
      destinations: 'Release packages ready',
    },
  },
  cleanup: {
    file: 'customers.csv',
    cleanFile: 'customers.clean.csv',
    columns: ['Name', 'Email', 'Company', 'Status'],
    review: 'Review',
    /** the pass Xroga is running, shown on the table while it scans */
    passes: { scanned: 'Schema scan', found: 'Duplicate check and field validation' },
    status: {
      scanned: 'Schema scan: 4 columns, 5 rows',
      found: '4 issues found in 4 rows',
      merged: '2 records merged into 1 canonical row',
      fixed: 'Email format repaired',
      normalized: 'Company and status values normalized',
      held: '1 row held for review: missing email',
      validated: '3 fixes applied · 1 row held for review',
    },
  },
  growth: {
    signals: { search: 'Search visibility', funnel: 'Trial to paid' },
    constraint: 'Biggest constraint: trial to paid',
    decision: 'Fix: guided onboarding',
    launched: 'Onboarding sequence live',
    measuring: 'Measuring trial to paid',
    status: {
      audit: 'Auditing market, search and funnel',
      search: 'Search visibility mapped',
      funnel: 'Funnel measured',
      constraint: 'Biggest constraint found',
      launched: 'Fix live, measuring trial to paid',
    },
  },
} as const;
