/**
 * S01 Capability Deck: authorable content and product-truth metadata.
 *
 * Copy is the founder-approved text from docs/homepage-implementation/XROGA_S01_CAPABILITY_DECK_CLAUDE_BRIEF.md.
 * `truth` records what the product shows today. Sources: docs/product/PUBLIC-CLAIM-VERIFICATION.md (2026-09-12),
 * SHIP_COMPLETENESS.md, and the repository (voice input: components/terminal/XrogaVoiceControl.tsx; connected tools:
 * backend/src/services/integrations). Statuses appear only in the expanded details, never as badges on the card.
 */

export type CapabilityId =
  | 'build'
  | 'browser'
  | 'automate'
  | 'launch'
  | 'research'
  | 'data'
  | 'grow'
  | 'continue';

export type TruthStatus = 'available' | 'connection' | 'limited' | 'planned';

export const STATUS_LABEL: Record<TruthStatus, string> = {
  available: 'Available',
  connection: 'Available with connection',
  limited: 'Limited / beta',
  planned: 'Planned',
};

export interface Capability {
  id: CapabilityId;
  chapter: 'A' | 'B';
  number: string;
  title: string;
  benefit: string;
  chips: string[];
  demoLabel: string;
  stages: [string, string, string, string];
  result: string;
  reverseTitle: string;
  clusters: [string, string, string, string];
  details: string[];
  example: string;
  truth: { status: TruthStatus; text: string }[];
  /** Local light only: one hue from the Xroga orb family, used on edges and the demo window. */
  accent: string;
}

export const SECTION = {
  label: '01 / CAPABILITIES',
  title: 'What you can do with Xroga.',
  intro: 'Build software, test products, automate work, research, manage data, launch, grow and keep things moving.',
  chapters: {
    A: { name: 'Create and execute', range: '01 to 04' },
    B: { name: 'Understand and grow', range: '05 to 08' },
  },
  note: 'Card scenes illustrate the kind of work Xroga does. They are not live customer data.',
} as const;

export const CAPABILITIES: Capability[] = [
  {
    id: 'build',
    chapter: 'A',
    number: '01 / CREATE',
    title: 'Build Software',
    benefit: 'Create real apps, portals and tools, or improve the software you already have.',
    chips: ['Websites', 'Apps', 'SaaS', 'AI agents', 'APIs'],
    demoLabel: 'Product preview',
    stages: ['Structure', 'Logic', 'Test', 'Ready'],
    result: 'Release-ready build',
    reverseTitle: 'From a brief to a working product.',
    clusters: [
      'Websites, SaaS and custom software',
      'AI agents, APIs and business systems',
      'Existing codebases and redesigns',
      'Login, database, payments and tests',
    ],
    details: [
      'Build websites, marketplaces, dashboards, booking systems, customer portals, web apps, full-stack SaaS, AI products, and supported games or Web3 projects.',
      'Work on existing projects and supported GitHub or GitLab repositories, not only new generated projects.',
      'Turn a screenshot or design into a usable website; add features and improve UI and UX.',
      'Set up backend APIs, databases, authentication, payments, and connected services where supported.',
      'Repair bugs, improve code, test functionality, and deliver editable outputs.',
      'Keep user ownership and external infrastructure permissions clear.',
    ],
    example: 'Build a client portal for my logistics company with staff roles, shipment tracking, invoicing and an admin API. Test the critical paths and prepare it for release.',
    truth: [
      { status: 'available', text: 'New apps and focused edits to existing GitHub repositories, with real tests and builds.' },
      { status: 'connection', text: 'Deployment, payments and sign-in use the accounts you connect, such as GitHub, Vercel and Stripe.' },
      { status: 'limited', text: 'Games, Web3 and very large systems are supported for a subset of frameworks.' },
    ],
    accent: '#6f97ff',
  },
  {
    id: 'browser',
    chapter: 'A',
    number: '02 / VERIFY',
    title: 'Browser & Testing',
    benefit: 'Check important user journeys, find problems and verify the fixes.',
    chips: ['Browser actions', 'Testing', 'Repairs', 'Verification'],
    demoLabel: 'Real user journey',
    stages: ['Open', 'Test', 'Fix', 'Retest'],
    result: 'Critical flow checked',
    reverseTitle: 'See what actually works.',
    clusters: [
      'Navigate sites and supported apps',
      'Test signup, login and checkout',
      'Find broken flows and diagnose bugs',
      'Repair, rerun and report evidence',
    ],
    details: [
      'Click, type, navigate, inspect forms, and perform authorized browser tasks in supported sessions.',
      'Test products like real users, including onboarding, authentication, checkout, and responsive flows.',
      'Diagnose failures in UI or application logic and rerun tests after repair.',
      'Use browser actions when ordinary APIs are insufficient, subject to actual service readiness and permission.',
      'Report what was tested, what failed, and whether it passed, without inventing evidence.',
    ],
    example: 'Test my checkout from cart to confirmation, including the card verification step. Find the root cause of any failure, fix it and run the same path again.',
    truth: [
      { status: 'available', text: 'Real builds and tests run in an isolated runtime, and results report what actually passed.' },
      { status: 'connection', text: 'Browser-verified previews run on products Xroga builds, once the preview is authorized.' },
      { status: 'planned', text: 'General browsing and actions on any website you name are not available yet.' },
    ],
    accent: '#65e5f4',
  },
  {
    id: 'automate',
    chapter: 'A',
    number: '03 / OPERATE',
    title: 'Automate Work',
    benefit: 'Connect the steps behind your business and remove repetitive work.',
    chips: ['Email', 'CRM', 'Scheduling', 'Support', 'Workflows'],
    demoLabel: 'Business workflow',
    stages: ['Request', 'Coordinate', 'Approve', 'Update'],
    result: 'Records updated',
    reverseTitle: 'Work across the tools you already use.',
    clusters: [
      'Customers, leads and follow-ups',
      'Email, calendars, CRM and support',
      'Approvals, triggers and reusable flows',
      'Travel, bookings and daily operations',
    ],
    details: [
      'Handle customer inquiries, qualifying leads, booking appointments, reminders, no-shows, customer records, and follow-up workflows.',
      'Work with supported communications, accounting, commerce, customer support, and productivity tools.',
      'Assist with flight, hotel, travel research, itinerary, and supported booking workflows, without promising automatic purchases.',
      'Let users create workflow templates or adapt approved templates where available.',
      'Provide approval requests for sensitive actions, with explicit permission and visible results.',
      'Recurring and scheduled operations are described at their current maturity, never as unattended work that is already live.',
    ],
    example: 'Set up a front desk workflow for my dental clinic: qualify new inquiries, ask me before sending forms, book the visit in our calendar, update the patient record and draft the follow-up.',
    truth: [
      { status: 'connection', text: 'Email, calendar, CRM and support actions run through the tools you connect and authorize.' },
      { status: 'limited', text: 'Travel is research and itinerary planning. Xroga does not buy tickets or book stays on its own.' },
      { status: 'planned', text: 'Unattended scheduled workflows are on the roadmap and not yet generally available.' },
    ],
    accent: '#a79af3',
  },
  {
    id: 'launch',
    chapter: 'A',
    number: '04 / RELEASE',
    title: 'Launch Anywhere',
    benefit: 'Prepare products for the web, browser extensions and mobile platforms.',
    chips: ['Web', 'Chrome', 'iOS', 'Android', 'Desktop'],
    demoLabel: 'One product, many surfaces',
    stages: ['Prepare', 'Build', 'Check', 'Submit'],
    result: 'Ready for release review',
    reverseTitle: 'From working product to launch.',
    clusters: [
      'Web deployment and domain setup',
      'Chrome extensions and mobile builds',
      'Desktop packaging where supported',
      'Release checks and store preparation',
    ],
    details: [
      'Prepare web deployments, previews, domains, DNS, HTTPS, environments, and authorized publishing.',
      'Build or prepare Chrome extension and Android or iOS paths, with a shared backend when feasible.',
      'Prepare supported desktop app packages.',
      'Integrate sign-in, databases, analytics, and transactional email as necessary.',
      'Organize store listing details, launch materials, readiness checks, and external dependencies.',
      'Store review by Apple, Google or another platform is their decision. Xroga never treats approval as automatic.',
    ],
    example: 'Turn my existing SaaS into a Chrome extension, iOS app and Android app that share one sign-in and backend, and prepare everything I need for store review.',
    truth: [
      { status: 'connection', text: 'Web deployment to Vercel with your authorization, verified against the live URL.' },
      { status: 'available', text: 'Chrome extension, Expo mobile and Electron desktop builds, delivered as source and packages.' },
      { status: 'limited', text: 'Store submission starts the review. Approval and signing certificates stay with you and the store.' },
    ],
    accent: '#28c8e8',
  },
  {
    id: 'research',
    chapter: 'B',
    number: '05 / DISCOVER',
    title: 'Research & Decide',
    benefit: 'Search, compare evidence and turn information into clear next steps.',
    chips: ['Web', 'Markets', 'Competitors', 'Evidence'],
    demoLabel: 'Research synthesis',
    stages: ['Collect', 'Compare', 'Rank', 'Brief'],
    result: 'Evidence-backed brief',
    reverseTitle: 'Go beyond a simple web search.',
    clusters: [
      'Web, X and supported research sources',
      'Competitors and market opportunities',
      'Startup, hackathon and travel research',
      'Comparisons with sources and context',
    ],
    details: [
      'Search public sources, documents, websites and appropriate supported connected information.',
      'Investigate company competitors, market shifts, customer discussions, startup ideas, and demand signals.',
      'Research Reddit and X where those capabilities actually exist or can be accessed through supported methods.',
      'Compare conflicting sources, trace evidence, and return cited reports, decision options, and limitations.',
      'Research hackathons, documentation, APIs, open-source projects, and travel options.',
      'Use Xroga’s own reasoning even when there is no external integration connected.',
    ],
    example: 'Find overlooked opportunities in fleet management software. Compare forums, reviews and competitor sites, explain conflicting signals and rank three directions with sources.',
    truth: [
      { status: 'available', text: 'Current public web search with cited answers.' },
      { status: 'limited', text: 'Deeper multi-source research reports which sources it could and could not reach.' },
      { status: 'connection', text: 'X evidence where it is configured. Reddit through supported public methods.' },
    ],
    accent: '#8f82f2',
  },
  {
    id: 'data',
    chapter: 'B',
    number: '06 / ORGANIZE',
    title: 'Files & Data',
    benefit: 'Understand documents, clean records and organize information you can use.',
    chips: ['Documents', 'Spreadsheets', 'Databases', 'Reports'],
    demoLabel: 'Data cleanup review',
    stages: ['Inspect', 'Match', 'Validate', 'Review'],
    result: 'Changes ready for review',
    reverseTitle: 'Turn information into useful work.',
    clusters: [
      'PDFs, docs, images and spreadsheets',
      'Analysis, reports and file transforms',
      'Database queries, mapping and cleanup',
      'Validation, review and project context',
    ],
    details: [
      'Read and compare supported PDFs, Word documents, CSVs, spreadsheets, screenshots and code files.',
      'Extract, summarize and transform structured and unstructured information.',
      'Work with supported database systems and queries.',
      'Detect duplicates, inconsistent formats, mismatched relationships, and uncertain records.',
      'Preview changes, validate output, and flag exceptional cases for human review.',
      'Reuse project-relevant information across future tasks where persistent context is supported.',
    ],
    example: 'Clean our customer export: keep the original, map the columns to our schema, merge duplicates, fix broken account links and hold anything uncertain for my review.',
    truth: [
      { status: 'available', text: 'PDF, Word, text, Markdown, code and screenshot understanding.' },
      { status: 'connection', text: 'Database work runs against a database you connect, with changes previewed first.' },
      { status: 'limited', text: 'Project context carries forward within a focused context window, not unlimited memory.' },
    ],
    accent: '#9bcdd3',
  },
  {
    id: 'grow',
    chapter: 'B',
    number: '07 / GROW',
    title: 'Grow Your Business',
    benefit: 'Find opportunities, improve campaigns and learn what works.',
    chips: ['SEO', 'Marketing', 'Acquisition', 'Analytics'],
    demoLabel: 'Growth opportunity',
    stages: ['Measure', 'Identify', 'Improve', 'Review'],
    result: 'Next experiment prepared',
    reverseTitle: 'Keep improving after launch.',
    clusters: [
      'Search and AI-search visibility',
      'Audience research and customer leads',
      'Campaigns, launch and distribution',
      'Conversion, pricing and analytics',
    ],
    details: [
      'Analyze keywords, search visibility, competitors and AI-search or brand mentions where supported.',
      'Find audiences and qualified customer opportunities, while respecting channel and outreach policies.',
      'Plan launch distribution, content, email, advertising, social and growth experiments.',
      'Investigate conversion funnels, retention, pricing, subscription systems and monetization options.',
      'Identify the most important constraint and propose or execute supported corrective steps.',
      'Report measurement evidence rather than promising rankings, revenue, or guaranteed customers.',
    ],
    example: 'Find where new signups drop off, choose one experiment to fix it, draft the onboarding email and show how we will compare before and after.',
    truth: [
      { status: 'limited', text: 'Search, competitor and growth research, with plans and experiments you approve.' },
      { status: 'connection', text: 'Analytics, email and campaign actions use the tools you connect.' },
      { status: 'available', text: 'Xroga reports measurements. It never promises rankings, revenue or customers.' },
    ],
    accent: '#d79be8',
  },
  {
    id: 'continue',
    chapter: 'B',
    number: '08 / CONTINUE',
    title: 'Keep Work Running',
    benefit: 'Follow up, track progress and keep recurring work organized.',
    chips: ['Projects', 'AI workers', 'Approvals', 'Updates'],
    demoLabel: 'Project continuity',
    stages: ['Assign', 'Track', 'Review', 'Resume'],
    result: 'Project context preserved',
    reverseTitle: 'The work does not end at launch.',
    clusters: [
      'Continue existing project work',
      'Specialized workers and assignments',
      'Approvals, reports and operations',
      'Reusable skills, tools and history',
    ],
    details: [
      'Reopen projects with their history, files, authorized tool connections, and relevant task state.',
      'Assign work to specialized AI workers where implemented. Where they are still rolling out, they are presented as upcoming.',
      'Track supported jobs, reports, exceptions, approvals, and execution history.',
      'Manage reusable procedures, supported recurring tasks, webhooks, and operations configurations.',
      'Review deployment records, project health, incidents and maintenance workflows as their rollout permits.',
      'Keep the user in control of accounts, permissions, code, and customer data.',
      'Coordinate appropriate AI models and tools without requiring nontechnical users to understand internal routing.',
    ],
    example: 'Keep my product launch on track: list open tasks, prepare the weekly progress report, flag anything waiting on my approval and pick up where we left off.',
    truth: [
      { status: 'available', text: 'Projects keep their repository, files and history, so follow-up work continues where it stopped.' },
      { status: 'limited', text: 'Approvals, reports and execution history for supported jobs.' },
      { status: 'planned', text: 'Specialized AI workers and scheduled operations are rolling out and not yet generally available.' },
    ],
    accent: '#c9d6e6',
  },
];

/** The concluding strip of S01. The integration count is deliberately absent: the catalog is a build catalog,
 * not a count of live connectors (PUBLIC-CLAIM-VERIFICATION.md, "Hundreds of runtime integrations"). */
export const PLATFORM: { title: string; text: string }[] = [
  { title: 'Ask naturally', text: 'Describe your task in ordinary words or supported voice input.' },
  { title: 'Smart execution', text: 'Xroga selects suitable AI models and capabilities.' },
  { title: 'Connect apps', text: 'Use integrations, APIs and custom MCPs when needed.' },
  { title: 'Across devices', text: 'Work from desktop, laptop or mobile.' },
  { title: 'Stay in control', text: 'Review sensitive actions and keep ownership of your work.' },
  { title: 'Keep your context', text: 'Return to projects without starting over.' },
];
export const PLATFORM_TITLE = 'One workspace. More ways to work.';
