/**
 * Every visible S00 string (V9 copy, V7 interaction, V8 truth rules). Kept in one place so the
 * human-craft rules can be tested: no long dashes, no stock AI phrasing (orchestration.test.ts).
 */
import { INTEGRATION_COUNT_LABEL } from './capabilities';

export const COPY = {
  /** V12 §3: the final brand line. One line on desktop, "Xroga for / everything." on phones. */
  title: 'Xroga for everything.',
  /** V12 §6: the fixed lead. It never moves; only the capability phrase after it changes. */
  lead: 'One workspace to',
  /** V12 §9, §33: the one static phrase used when motion is reduced (no carousel). */
  reducedPhrase: 'build, operate and keep work moving',
  placeholder: 'What should Xroga get done?',
  proof: `${INTEGRATION_COUNT_LABEL} integrations available`,
  qualifier: 'Use Xroga directly. Connect tools when the job needs them.',
  rackTitle: 'Tools for this job',
  rackCount: (n: number) => `${n} shown from ${INTEGRATION_COUNT_LABEL} available`,
  connect: 'Connect to use',
  send: 'Send to Xroga',
} as const;

/** Scene families plus the rest state; each owns exactly one capability phrase (V12 §7). */
export type PhraseKey = keyof typeof COMMANDS | 'rest';

/** V12 §6–§7: the capability phrase for each scene. Never shown for an unrelated work object. */
export const PHRASES: Record<PhraseKey, string> = {
  saas: 'build production software',
  clinic: 'automate real business operations',
  qa: 'test and repair product flows',
  platforms: 'ship across web, Chrome, iOS and Android',
  research: 'research, compare and decide',
  growth: 'grow what you launch',
  rest: 'keep important work running',
};

/** V12 §32: measured phone variants, same meaning, never a smaller font. */
export const PHRASES_MOBILE: Record<PhraseKey, string> = {
  saas: 'build production software',
  clinic: 'automate business operations',
  qa: 'repair product flows',
  platforms: 'ship across platforms',
  research: 'research and decide',
  growth: 'grow what you launch',
  rest: 'keep work running',
};

/** The command for each vignette (V9 §5–§26). Serious, multi-stage outcomes only. */
export const COMMANDS = {
  saas: 'Build a multi-tenant client portal with authentication, billing, admin roles, onboarding and analytics. Test the critical flows and ship the production release.',
  qa: 'Audit my checkout and onboarding in the browser, find every broken critical flow, repair the failures, re-test the full path, and prepare the corrected release.',
  clinic:
    'Build an automation system for my dental clinic that captures new inquiries, qualifies patients, books appointments, follows up with no-shows, updates the CRM, and returns a daily operations report.',
  platforms:
    'Take my existing SaaS and release it as a Chrome extension, iOS app and Android app while keeping one backend, one authentication system and shared product state.',
  research:
    'Build an AI research product that searches the web and my files, compares conflicting evidence, stores project memory, and returns cited decision briefs.',
  growth:
    'Audit our market, SEO, ads, funnel and product analytics, identify the biggest growth constraint, launch the highest-impact fix, and keep measuring whether it works.',
} as const;

/** Display-only short versions for phones (V10 §34), same intent. Visitors can still type anything. */
export const COMMANDS_MOBILE: Record<keyof typeof COMMANDS, string> = {
  saas: 'Build this SaaS with auth, billing, roles and analytics. Test it and ship it.',
  qa: 'Audit this checkout, repair every critical failure, re-test it and ship the fix.',
  clinic: 'Automate inquiries, booking, follow-ups, CRM updates and daily reporting for my dental clinic.',
  platforms: 'Take this SaaS to Chrome, iOS and Android with one backend and shared state.',
  research: 'Build an AI research product for web, files, project memory and cited answers.',
  growth: 'Find our biggest growth constraint, launch the best fix and keep measuring it.',
};

/** Shown while the stage rests between cycles (V9 §32). One per rest, never rotated quickly. */
export const SECONDARY = [
  'Turn this existing internal tool into a secure multi-tenant SaaS with roles, billing and audit logs.',
  'Build a quoting and scheduling system for my service business and automate the follow-up workflow.',
  'Migrate this product to a new backend without breaking authentication, billing or customer data.',
  'Audit this product end to end, repair the broken flows, improve the UI and prepare the production release.',
  'Research this market, design the product strategy, build the MVP, launch it and measure the first acquisition channels.',
] as const;

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
      shell: 'App shell ready',
      auth: 'Authentication working',
      billing: 'Billing connected',
      roles: 'Admin roles added',
      analytics: 'Analytics live in the app',
      repo: 'Committed to main',
      tested: 'Critical flows passed',
      monitored: 'Error monitoring on',
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
      emailOk: 'Email validation passes',
      failed: 'Payment step fails',
      isolated: 'Failure isolated in the payment step',
      repaired: 'Payment step repaired',
      committed: 'Fix committed',
      paid: 'Test payment confirmed',
      onboarding: 'Onboarding continues',
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
      report: 'Daily report',
    },
    pending: 'Waiting for your approval',
    approved: 'Approved by you',
    nextrun: 'Next run prepared',
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
      extension: 'Chrome extension built',
      ios: 'iOS app built',
      android: 'Android app built',
      sync: 'State shared across all four',
      built: 'Release packages built on GitHub',
      tested: 'Each platform tested',
      destinations: 'Release packages ready',
    },
  },
  research: {
    files: 'Pricing study.pdf',
    web: 'Market report, 2026',
    conflict: 'Sources disagree on churn',
    synthesis: 'Evidence weighed',
    memory: 'Saved to project memory',
    brief: 'Decision brief',
    briefLine: 'Lead with annual plans',
    product: 'Ask your research',
    answer: 'Annual plans retain better',
    status: 'Cited answers from web and files',
  },
  growth: {
    signals: { search: 'Search visibility', ads: 'Paid acquisition', funnel: 'Trial to paid' },
    constraint: 'Biggest constraint: trial to paid',
    decision: 'Fix: guided onboarding',
    launched: 'Onboarding sequence live',
    measuring: 'Measuring trial to paid',
    nextreview: 'Next review in 7 days',
  },
} as const;
