export type ContentSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  table?: { caption: string; columns: string[]; rows: string[][] };
};
export type SourceLink = { label: string; href: string };
import { SEO_PHASE2_ARTICLES } from './seoPhase2Content';

/** Reserved URL contracts. They stay unpublished until a complete, evidence-backed record exists. */
export const FUTURE_SEO_FACTORIES = {
  stack: '/stack/{technology}',
  howTo: '/how-to/{category}/{task}',
  templates: '/templates/{template-slug}',
  migrate: '/migrate/{competitor}-to-xroga',
} as const;

export type ComparisonPage = {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  summary: string;
  bestFor: string;
  xrogaDifference: string;
  facts: string[];
  decisionPoints: string[];
  sources: SourceLink[];
  lastVerified: string;
};

const verified = '2026-09-09';

export const COMPARISONS: ComparisonPage[] = [
  {
    slug: 'xroga-vs-lovable', competitor: 'Lovable',
    title: 'Xroga vs Lovable: repository work or browser-first app creation?',
    description: 'Compare Xroga and Lovable across existing repositories, GitHub workflow, validation, deployment ownership, and the kinds of software work each product is designed for.',
    summary: 'Lovable is a browser-based web application builder. Xroga is positioned around carrying a software outcome through an inspectable repository, applicable checks, and authorised publishing steps.',
    bestFor: 'Choose Lovable when its supported web stack and browser-first creation flow match the product you want to make. Consider Xroga when the centre of gravity is an existing repository, reviewable changes, explicit validation, or work that crosses product and engineering tasks.',
    xrogaDifference: 'Xroga treats the repository and its real project state as the shared build record. It does not treat a rendered interface as proof that tests, provider setup, or production release succeeded.',
    facts: ['Lovable documents GitHub synchronisation and says creators own their code.', 'Lovable documents a supported web-app stack and says it does not currently support mobile app development.', 'Lovable documents publishing and custom-domain workflows for its hosted projects.'],
    decisionPoints: ['Do you need to begin with an existing repository or a fresh browser project?', 'Must validation evidence and blockers remain visible with the implementation?', 'Does the target fit the vendor’s documented application stack?', 'Which account should own source control and production infrastructure?'],
    sources: [{ label: 'Lovable GitHub integration', href: 'https://docs.lovable.dev/integrations/github' }, { label: 'Lovable FAQ', href: 'https://docs.lovable.dev/introduction/faq' }, { label: 'Lovable publishing', href: 'https://docs.lovable.dev/features/publish' }], lastVerified: verified,
  },
  {
    slug: 'xroga-vs-bolt', competitor: 'Bolt',
    title: 'Xroga vs Bolt: controlled repository execution or hosted browser building?',
    description: 'Compare Xroga with Bolt across GitHub imports, branching, hosting, validation, and ownership of the path from request to production.',
    summary: 'Bolt combines browser-based app generation with GitHub integration and built-in hosting. Xroga focuses on repository-aware work, explicit checks, and provider-backed release evidence across a connected software project.',
    bestFor: 'Choose Bolt when fast creation inside its browser environment and Bolt hosting are the priority. Consider Xroga when you want one traceable workflow around a repository, including diagnosis, implementation, validation, and handoff.',
    xrogaDifference: 'Xroga separates “code changed,” “build passed,” and “deployment verified” into distinct outcomes. External credentials or provider failures are reported as blockers, not converted into a success state.',
    facts: ['Bolt documents importing existing GitHub repositories and creating repositories from Bolt projects.', 'Bolt documents branch workflows and separate branch memory.', 'Bolt provides built-in hosting and can also work with supported external hosting paths.'],
    decisionPoints: ['Is built-in hosting more important than keeping provider operations visibly separate?', 'Do you need branch-aware work in an existing organisation repository?', 'Will the project require diagnosis and repair beyond initial generation?', 'What evidence must reviewers see before a release is called complete?'],
    sources: [{ label: 'Bolt GitHub version control', href: 'https://support.bolt.new/integrations/git' }, { label: 'Bolt hosting', href: 'https://support.bolt.new/cloud/hosting' }, { label: 'Bolt publishing', href: 'https://support.bolt.new/cloud/hosting/publish' }], lastVerified: verified,
  },
  {
    slug: 'xroga-vs-replit', competitor: 'Replit',
    title: 'Xroga vs Replit: compare AI software workflows before choosing',
    description: 'A practical Xroga versus Replit comparison covering repository import, agent work, deployment, usage, and production-readiness evidence.',
    summary: 'Replit provides a cloud development environment, an AI agent, imports, and deployments. Xroga’s narrower promise is a controlled build story that connects requested outcomes, repository changes, checks, and authorised providers.',
    bestFor: 'Choose Replit when an integrated cloud IDE and its native runtime are central to how you want to work. Consider Xroga when you want the repository, branch, and external provider accounts to remain the explicit source of truth.',
    xrogaDifference: 'Xroga is designed to say what was inspected, changed, validated, and published—and to distinguish a missing credential or failed deployment from a finished product.',
    facts: ['Replit documents importing from GitHub, ZIP archives, Figma, and other providers.', 'Replit documents Agent effort-based pricing and plan-specific credits.', 'Replit provides application deployment products from its workspace.'],
    decisionPoints: ['Do you prefer a cloud IDE or a repository-centred execution layer?', 'How should imported secrets and environment values be handled?', 'Do you require a pull-request or external-provider handoff?', 'How predictable must usage and validation reporting be?'],
    sources: [{ label: 'Replit imports', href: 'https://docs.replit.com/build/import-from-providers' }, { label: 'Replit AI billing', href: 'https://docs.replit.com/billing/ai-billing' }, { label: 'Replit deployments', href: 'https://docs.replit.com/cloud-services/deployments/about-deployments' }], lastVerified: verified,
  },
  {
    slug: 'xroga-vs-cursor', competitor: 'Cursor',
    title: 'Xroga vs Cursor: app builder workflow or AI code editor?',
    description: 'Compare Xroga and Cursor for repository changes, terminal work, background agents, validation, publishing, and non-coder product workflows.',
    summary: 'Cursor is an AI code editor with an agent that can edit a codebase and run terminal commands. Xroga is a web product for turning supported product requests into repository work and provider-backed delivery.',
    bestFor: 'Choose Cursor when a developer wants AI deeply integrated into a desktop editor. Consider Xroga when the desired interface is a product-oriented workspace that keeps implementation, proof, and release state together.',
    xrogaDifference: 'Xroga is not trying to replace an editor. It coordinates the build outcome and presents project status in language that founders, product teams, and engineers can review together.',
    facts: ['Cursor documents an Agent that searches code, edits files, runs commands, and presents diffs for review.', 'Cursor documents background agents that work on GitHub repositories.', 'Cursor publishes plan and usage information in its official account documentation.'],
    decisionPoints: ['Is the primary user an editor-based developer or a mixed product team?', 'Should work continue in a desktop IDE or a shared web workspace?', 'Who needs to understand validation and deployment blockers?', 'Will GitHub and provider operations need explicit authorisation evidence?'],
    sources: [{ label: 'Cursor Agent overview', href: 'https://docs.cursor.com/en/agent/overview' }, { label: 'Cursor background agents', href: 'https://docs.cursor.com/background-agent/api/overview' }, { label: 'Cursor pricing documentation', href: 'https://docs.cursor.com/account/pricing' }], lastVerified: verified,
  },
  {
    slug: 'xroga-vs-v0', competitor: 'v0',
    title: 'Xroga vs v0: compare project, GitHub and deployment workflows',
    description: 'Compare Xroga with v0 across UI generation, shared projects, GitHub branches, Vercel publishing, validation, and repository ownership.',
    summary: 'v0 is Vercel’s application-building product with projects, GitHub workflows, and Vercel publishing. Xroga is provider-aware but aims to keep the complete repository work and its evidence visible as one build story.',
    bestFor: 'Choose v0 when a Vercel-centred workflow and rapid interface-to-application generation fit the job. Consider Xroga when broader repository diagnosis, explicit checks, and a provider-independent project record matter.',
    xrogaDifference: 'Xroga can prepare and verify a Vercel deployment, but it treats Vercel as an authorised provider rather than making the deployment platform the project identity.',
    facts: ['v0 documents GitHub-backed projects with automatic branches and commits.', 'v0 documents multiple chats contributing to one Vercel project.', 'v0 documents direct production publishing to Vercel.'],
    decisionPoints: ['Is the target already centred on Vercel?', 'Do several tasks need to share one persistent project context?', 'Do you need work beyond interface generation?', 'Which validation results are required before production?'],
    sources: [{ label: 'v0 GitHub documentation', href: 'https://v0.dev/docs/github' }, { label: 'v0 projects', href: 'https://v0.dev/docs/projects' }, { label: 'v0 deployments', href: 'https://v0.dev/docs/deployments' }], lastVerified: verified,
  },
  {
    slug: 'xroga-vs-windsurf', competitor: 'Windsurf',
    title: 'Xroga vs Windsurf: product workspace or agentic IDE?',
    description: 'Compare Xroga and Windsurf for codebase work, planning, terminal execution, checkpoints, deployment, and cross-functional product use.',
    summary: 'Windsurf is an agentic IDE whose Cascade assistant offers code and chat modes, planning, codebase tools, checkpoints, and terminal access. Xroga packages repository work as a shared product build process in the browser.',
    bestFor: 'Choose Windsurf when the team’s workflow belongs inside an IDE. Consider Xroga when non-coders and developers need one reviewable view of product intent, repository activity, checks, and release state.',
    xrogaDifference: 'Xroga’s product surface is organised around the project and outcome rather than the editor. It is intended to keep separate task conversations attached to one project state.',
    facts: ['Windsurf documents Cascade Code and Chat modes.', 'Cascade documentation includes planning, codebase search, tool use, checkpoints, and terminal integration.', 'Windsurf documents command approval controls for terminal execution.'],
    decisionPoints: ['Who is the daily user: an IDE user or a mixed product group?', 'How should command permissions and provider approvals be surfaced?', 'Must project state persist across multiple task conversations?', 'Does deployment need to be independently verified?'],
    sources: [{ label: 'Windsurf Cascade overview', href: 'https://docs.windsurf.com/windsurf/cascade/cascade' }, { label: 'Windsurf Cascade modes', href: 'https://docs.windsurf.com/windsurf/cascade/modes' }, { label: 'Windsurf terminal controls', href: 'https://docs.windsurf.com/windsurf/terminal' }], lastVerified: verified,
  },
];

export type GuidePage = {
  slug: string; title: string; description: string; eyebrow: string; intro: string;
  sections: ContentSection[]; related: string[]; sources?: SourceLink[]; updated?: string;
};

const BUILD_GUIDE_ROWS: Array<[string, string, string, string, string, ...Array<[string, string]>]> = [
  ['saas-app', 'Build a SaaS app with AI—and keep the code', 'Plan a maintainable SaaS application with authentication, durable data, billing boundaries, tests, and production ownership.', 'AI build guide', 'A SaaS build becomes real when tenant boundaries, permissions, failure states, billing events, and operations work together—not when a dashboard merely renders.', ['Model the product boundary', 'Define users, tenants, roles, activation, billing states, and the smallest workflow that creates value.'], ['Protect the server boundary', 'Authorisation, tenant checks, webhooks, and secrets belong on trusted server paths.'], ['Prove the release', 'Run migrations, type checks, tests, a production build, and a post-deploy smoke test.']],
  ['crm', 'Build a CRM with AI around a real sales workflow', 'Create a CRM plan that connects accounts, contacts, pipeline stages, permissions, auditability, and useful reporting.', 'AI build guide', 'A useful CRM reflects the team’s process. Start with the decisions people make, then model contacts, organisations, opportunities, activity, and ownership around them.', ['Design the record model', 'Separate organisations, people, opportunities, stages, activities, and assignment history.'], ['Make actions accountable', 'Enforce access on the server and record important changes so teams can understand who changed what.'], ['Test the working loop', 'Verify create, update, search, filtering, stage changes, and permission boundaries with realistic data.']],
  ['booking-app', 'Build a booking app with AI without double-booking', 'Design an AI-assisted booking product with availability, time zones, concurrency controls, confirmations, and cancellation rules.', 'AI build guide', 'Booking interfaces look simple; the real work is authoritative availability under concurrent requests, time-zone correctness, and recoverable communication.', ['Define availability', 'Model resources, schedules, buffers, time zones, closures, and capacity before designing slots.'], ['Reserve atomically', 'The server must prevent two users from claiming the same capacity and make retries safe.'], ['Verify lifecycle events', 'Test confirmations, reschedules, cancellations, reminders, and provider failures end to end.']],
  ['internal-tool', 'Build an internal tool with AI that respects permissions', 'Turn an operational workflow into a maintainable internal app with clear roles, audit trails, and safe automation.', 'AI build guide', 'Internal tools often touch the most sensitive business data. Speed matters, but explicit permissions and reversible operations matter more.', ['Map the workflow', 'Document inputs, decisions, approvals, exceptions, and owners before automating the happy path.'], ['Apply least privilege', 'Limit data and actions by role on the server; hidden buttons are not access control.'], ['Measure the operation', 'Expose useful status, errors, audit evidence, and recovery paths for the people operating the tool.']],
  ['dashboard', 'Build a dashboard with AI that answers real questions', 'Create a dashboard with trustworthy metrics, clear data definitions, accessible charts, and fast loading states.', 'AI build guide', 'A dashboard succeeds when a person can make a decision confidently. Begin with questions and metric definitions, not a collection of charts.', ['Define every metric', 'Specify source, grain, filters, time zone, and edge cases for each number.'], ['Design for comparison', 'Use hierarchy, units, baselines, and accessible alternatives so changes are understandable.'], ['Validate data and speed', 'Test empty, delayed, partial, and conflicting data as well as the normal path.']],
  ['landing-page', 'Build a landing page with AI that is ready to measure', 'Plan and build a fast landing page with clear positioning, accessible interaction, technical SEO, and honest conversion tracking.', 'AI build guide', 'The page should explain one offer to one audience, make the next action obvious, and preserve enough performance headroom for real devices.', ['Write the decision path', 'Connect the search intent, promise, evidence, objections, and call to action in a logical sequence.'], ['Build accessible semantics', 'Use one descriptive H1, real links and buttons, labelled controls, and useful text that renders on the server.'], ['Measure without guessing', 'Validate metadata, structured data, mobile layout, performance, and analytics events before promotion.']],
  ['real-estate-platform', 'Build a real-estate platform with AI around trustworthy listings', 'Plan a property product with listing provenance, search, media, enquiries, permissions, and privacy-aware analytics.', 'AI build guide', 'Property software must make inventory understandable without implying availability, pricing, or verification that the underlying data cannot support.', ['Model listing provenance', 'Track source, status, update time, location precision, media rights, and responsible agent or owner.'], ['Make discovery useful', 'Design filters and result states around actual inventory instead of creating empty indexable combinations.'], ['Protect enquiries', 'Minimise personal data, route leads safely, prevent spam, and verify the complete enquiry path.']],
  ['fitness-tracker', 'Build a fitness tracker with AI and privacy by design', 'Design a fitness product with useful goals, consent-aware data, resilient activity records, and accessible progress views.', 'AI build guide', 'Health-adjacent data deserves careful boundaries. Collect only what the feature needs, explain its purpose, and avoid unsupported medical conclusions.', ['Choose the useful signal', 'Define the behaviour, unit, cadence, and goal the product helps a user understand.'], ['Design consent and control', 'Make collection, export, correction, and deletion understandable and enforce access beyond the interface.'], ['Test imperfect input', 'Handle missing days, duplicate imports, unit changes, time zones, and device sync failures.']],
];

export const BUILD_GUIDES: GuidePage[] = BUILD_GUIDE_ROWS.map(([slug,title,description,eyebrow,intro,...raw]) => ({slug,title,description,eyebrow,intro,sections:raw.map(([heading,body])=>({heading,paragraphs:[body]})),related:['/ai-app-builder','/showcase','/learn/production-readiness-checklist']}));

const INTEGRATION_GUIDE_ROWS: Array<[string, string, string]> = [
  ['github','Build with GitHub and keep repository work reviewable','How Xroga uses authorised GitHub access for repository inspection, branches, commits, pull requests, and verifiable handoff.'],
  ['vercel','Build with Vercel and verify what reached production','Connect the production build, Vercel deployment identity, environment readiness, and running URL without treating acceptance as proof.'],
  ['supabase','Build with Supabase across auth, data and storage','Plan Supabase-backed products with server-enforced access, migrations, RLS, storage policies, and environment separation.'],
  ['whop','Build with Whop for Xroga plan access','Understand the product boundary between Whop checkout or membership state and server-side Xroga entitlement enforcement.'],
  ['cloudflare','Build with Cloudflare at the network edge','Prepare domain, DNS, caching, and security work while keeping changes explicit and reversible.'],
  ['brevo','Build with Brevo for transactional product email','Design provider-backed email around consent, templates, delivery states, retries, and protected credentials.'],
];

export const INTEGRATION_GUIDES: GuidePage[] = INTEGRATION_GUIDE_ROWS.map(([slug,title,description]) => ({slug,title,description,eyebrow:'Integration guide',intro:`${title} means treating the provider as an authorised external system—not a decorative logo. Xroga reports what the connected account allowed and what evidence the operation returned.`,sections:[{heading:'What belongs in the project',paragraphs:['Keep code, configuration names, and provider-facing adapters reviewable in the repository. Keep secret values in the provider or deployment environment.']},{heading:'What must be verified',paragraphs:['Confirm permissions, environment selection, failure behaviour, and the user-visible result. A successful API response and a working product are separate checks.']},{heading:'What Xroga will not assume',paragraphs:['Xroga does not invent credentials, bypass provider policy, or report a deployment or integration as live without evidence from the authorised account.']}],related:['/integrations','/security','/docs']}));

export const BLOG_ARTICLES: GuidePage[] = [
  ...SEO_PHASE2_ARTICLES,
  {slug:'replit-alternatives',title:'Replit alternatives: choose by workflow, not a generic ranking',description:'Compare legitimate alternatives to Replit across cloud IDEs, browser app builders, AI editors, and repository-oriented agents.',eyebrow:'Alternatives guide · updated September 9, 2026',intro:'A useful Replit alternative depends on which part you are replacing: the cloud development environment, AI agent, hosting, collaboration, or the path from a prompt to a deployed app.',sections:[{heading:'For browser-first app generation',paragraphs:['Lovable, Bolt, and v0 offer product-building flows in the browser with different documented GitHub and deployment models. Compare supported stacks and import paths against your actual project.']},{heading:'For editor-based coding',paragraphs:['Cursor and Windsurf put agents inside an IDE, with codebase tools and terminal workflows designed for developers who want to stay close to the code.']},{heading:'For repository-centred delivery',paragraphs:['Xroga is designed around a connected repository and a visible trail from request through changes, validation, and authorised publishing. It is a different fit from an all-in-one cloud runtime.']},{heading:'How to decide',paragraphs:['Run the same bounded task in the candidates. Verify repository behaviour, build output, deployment state, pricing mechanics, and recovery after a failed change.']}],related:['/alternatives/replit-alternative','/compare/xroga-vs-replit','/blog/best-vibe-coding-tools']},
  {slug:'best-ai-website-builders',title:'How to choose an AI website builder without losing the fundamentals',description:'Compare AI website builders using accessibility, content ownership, technical SEO, performance, analytics, and maintainability.',eyebrow:'Buyer guide · updated September 9, 2026',intro:'A website builder should make publishing easier without hiding the fundamentals that determine whether people and search engines can understand the result.',sections:[{heading:'Make content crawlable',paragraphs:['Important copy, headings, links, and navigation should render as meaningful HTML. Every indexable page needs a distinct purpose, canonical URL, title, description, and internally linked place in the site.']},{heading:'Protect experience quality',paragraphs:['Verify keyboard navigation, contrast, form labels, responsive layout, image dimensions, and loading behaviour on realistic devices. Visual similarity on a wide desktop is not enough.']},{heading:'Keep measurement truthful',paragraphs:['Install analytics with consent where required, prevent personally identifiable information from entering event data, and define conversions before changing pages.']},{heading:'Retain the ability to improve',paragraphs:['Understand source ownership, redirects, metadata controls, deployment, and how future developers will work. SEO compounds only when the site can be maintained.']}],related:['/ai-website-builder','/build/landing-page','/learn/production-readiness-checklist']},
];

export const ALTERNATIVES = [
  { slug:'lovable-alternative', competitor:'Lovable', intro:'Teams evaluating a Lovable alternative may be looking for existing-repository support, editor-based control, a different supported stack, or a more explicit validation workflow.', choices:['Xroga for repository-centred product work and delivery evidence','Bolt for browser building with GitHub imports and built-in hosting','v0 for a Vercel-centred project and deployment workflow','Cursor or Windsurf for an agent inside a developer IDE'], compare:'/compare/xroga-vs-lovable' },
  { slug:'replit-alternative', competitor:'Replit', intro:'A Replit alternative should replace the specific capability you depend on: cloud IDE, AI agent, deployment, collaboration, or repository delivery.', choices:['Xroga for a shared repository build story','Bolt or Lovable for browser-first generation','v0 for Vercel-connected projects','Cursor or Windsurf for editor-based development'], compare:'/compare/xroga-vs-replit' },
  { slug:'cursor-alternative', competitor:'Cursor', intro:'Teams seeking a Cursor alternative may want a different editor, a browser workspace for non-coders, or a product-level workflow beyond code editing.', choices:['Xroga for product-to-repository execution in a shared web workspace','Windsurf for another agentic IDE workflow','v0 for browser creation linked to Vercel projects','Replit for an integrated cloud development environment'], compare:'/compare/xroga-vs-cursor' },
  { slug:'bolt-alternative', competitor:'Bolt', intro:'A Bolt alternative may prioritise another hosting model, an IDE workflow, deeper existing-repository work, or a different supported application environment.', choices:['Xroga for repository-aware implementation and proof','Lovable for browser-based web application creation','v0 for Vercel-native project publishing','Cursor or Windsurf for developer-led IDE work'], compare:'/compare/xroga-vs-bolt' },
];
