export interface DocSection { heading: string; paragraphs: string[]; steps?: string[]; code?: string }
export interface DocPage { slug: string; title: string; description: string; updated: string; sourceHref: string; sections: DocSection[] }

export const DOC_PAGES: DocPage[] = [
  { slug: 'getting-started', title: 'Getting started', description: 'Create an account, connect a repository, and ask Xroga for a verifiable software outcome.', updated: '2026-07-30', sourceHref: '/workspace', sections: [
    { heading: 'Start with an outcome', paragraphs: ['Sign in, open Workspace, and describe the result you want. Include the repository, constraints, and what must be true when the work is finished. Xroga uses the existing project rather than replacing it with a generic template.'], steps: ['Create or sign in to your Xroga account.', 'Connect GitHub and, when publishing web software, Vercel.', 'Select an existing repository or ask Xroga to create a new project.', 'Submit one clear outcome and review the live execution evidence.'] },
    { heading: 'A useful first request', paragraphs: ['Ask for a bounded result with acceptance criteria. Xroga can ask for missing authorization or configuration, and it reports blockers instead of inventing success.'], code: 'Update the homepage CTA, preserve the current design, run the production build, and prepare a pull request. Do not deploy.' },
  ] },
  { slug: 'terminals', title: 'Creating a terminal', description: 'Use durable Xroga terminals for separate products, repositories, and work threads.', updated: '2026-07-30', sourceHref: '/workspace', sections: [
    { heading: 'One terminal, one coherent task', paragraphs: ['A terminal keeps the conversation, selected repository, current branch, run events, and generated results together. Create a new terminal when you are switching products or starting unrelated work.'] },
    { heading: 'What persists', paragraphs: ['Authenticated terminal sessions can persist messages and project references. External actions still require valid provider connections and the permission appropriate to the requested operation.'] },
  ] },
  { slug: 'workspace', title: 'Using Workspace', description: 'Understand Files, Code, Changes, Terminal, Preview, and Deploy evidence.', updated: '2026-07-30', sourceHref: '/workspace', sections: [
    { heading: 'The working surface', paragraphs: ['Workspace connects chat to repository context and real run events. Files and Changes show project state; Terminal shows validated command evidence; Preview appears only after output exists; Deploy reports provider evidence or a blocker.'] },
    { heading: 'Truthful progress', paragraphs: ['Activity should correspond to repository reads, model requests, mutations, tests, reviews, provider operations, or verified blockers. A planned task is not a completed task.'] },
  ] },
  { slug: 'github', title: 'Connecting GitHub', description: 'Authorize repository reads, branches, commits, pushes, and pull requests safely.', updated: '2026-07-30', sourceHref: '/dashboard/integrations', sections: [
    { heading: 'Authorization', paragraphs: ['Connect GitHub from Integrations. Repository operations only work for repositories and permissions granted by your GitHub account or installed GitHub App. Xroga never treats a missing permission as success.'] },
    { heading: 'Safe delivery', paragraphs: ['Use a feature branch for changes. Review the changed files and validation results before merging. Production deployment remains separate unless you explicitly request it.'], steps: ['Connect GitHub.', 'Choose a repository.', 'Confirm the target branch.', 'Review commit and pull-request evidence.'] },
  ] },
  { slug: 'vercel', title: 'Connecting Vercel', description: 'Publish verified web builds through a Vercel account you authorize.', updated: '2026-07-30', sourceHref: '/dashboard/integrations', sections: [
    { heading: 'Provider-owned deployment', paragraphs: ['Connect Vercel from Integrations and select a project. Xroga can prepare or execute deployment only through your authorized account and configuration. A live result requires a provider deployment ID and a reachable URL.'] },
    { heading: 'Build gate', paragraphs: ['For Next.js, a successful typecheck alone is not a production build. The applicable package-manager build command must succeed before Xroga reports a verified deployment.'] },
  ] },
  { slug: 'repositories', title: 'Repositories', description: 'Select repositories, branches, and targeted project context.', updated: '2026-07-30', sourceHref: '/dashboard/projects', sections: [
    { heading: 'Work with existing code', paragraphs: ['Xroga retrieves relevant files, related tests, entry points, and established patterns. Focused changes should preserve unrelated code and avoid sending an entire repository to a model unnecessarily.'] },
    { heading: 'Repository evidence', paragraphs: ['For remote work, verify the repository identity, branch, starting commit, changed-file list, validation result, and remote commit SHA.'] },
  ] },
  { slug: 'deployments', title: 'Deployments', description: 'Understand build, deployment, readiness, and rollback evidence.', updated: '2026-07-30', sourceHref: '/dashboard/operations', sections: [
    { heading: 'A deployment is more than a command', paragraphs: ['Xroga distinguishes a successful build from a provider deployment and from a healthy running application. Readiness must verify the deployed application rather than accepting a provider-created resource alone.'] },
    { heading: 'When deployment fails', paragraphs: ['The retained result should identify the failed stage, safe error category, last valid release, and operator action. Xroga must not fabricate a URL or mark HTTP 503 as healthy.'] },
  ] },
  { slug: 'integrations', title: 'Integrations', description: 'Connect external services without exposing private credentials.', updated: '2026-07-30', sourceHref: '/dashboard/integrations', sections: [
    { heading: 'Credentials stay private', paragraphs: ['Provider keys are accepted only through protected server paths and should be encrypted at rest. Never place service-role keys, database passwords, webhook secrets, or private keys in browser-visible variables.'] },
    { heading: 'Truthful states', paragraphs: ['An integration may be connected, not configured, unavailable, unsupported, or require external setup. Provider presence does not prove an authenticated request succeeded.'] },
  ] },
  { slug: 'testing-repairs', title: 'Testing and repairs', description: 'Use validation output to drive focused repair.', updated: '2026-07-30', sourceHref: '/dashboard/operations', sections: [
    { heading: 'Applicable checks', paragraphs: ['Xroga can run syntax, import, lint, typecheck, unit, integration, production-build, security, migration, preview, deployment, and product-specific verification when the project supports them.'] },
    { heading: 'Repair the responsible subsystem', paragraphs: ['A focused repair uses the first meaningful error, affected files, expected invariant, and bounded attempt history. A small import error should not regenerate an application.'] },
  ] },
  { slug: 'publishing', title: 'Publishing', description: 'Prepare and publish supported deliverables through your accounts.', updated: '2026-07-30', sourceHref: '/dashboard/publish', sections: [
    { heading: 'Supported outcomes depend on the project', paragraphs: ['Web projects can publish through connected Vercel flows. Other project types may produce verified packages or require external store credentials and human review. The Publish page reports what is supported for the selected project.'] },
    { heading: 'Explicit intent', paragraphs: ['Pushing a branch, merging, deploying production, buying a domain, or submitting to a store are separate actions. Xroga should request authorization when the requested outcome does not already cover an irreversible external action.'] },
  ] },
  { slug: 'plan-usage', title: 'Plan and usage', description: 'Read real capacity, unlock timing, and billing state.', updated: '2026-07-30', sourceHref: '/settings?tab=plan', sections: [
    { heading: 'Capacity designed to finish work', paragraphs: ['Xroga routes applicable work without requiring a provider model picker. Plan views show current capacity and reset timing; they must not promise a fixed model token total when the product does not provide one.'] },
    { heading: 'Protected completion capacity', paragraphs: ['Reserved capacity can protect focused tests, repair, migration safety, and verification. Billing access depends on the recorded entitlement and verified provider event.'] },
  ] },
  { slug: 'security', title: 'Security', description: 'How Xroga scopes repository and provider access, protects secrets, validates operations, and reports safe evidence without exposing credentials.', updated: '2026-07-30', sourceHref: '/privacy', sections: [
    { heading: 'Least authority', paragraphs: ['Xroga uses the repository, provider, workspace, and environment permissions the user grants. Browser code receives only public configuration. Service credentials remain server-side and logs redact secret-like values.'] },
    { heading: 'Repository content is untrusted', paragraphs: ['Files and external research can inform a task but cannot override platform security rules. Destructive actions must match explicit user intent and validated targets.'] },
  ] },
  { slug: 'troubleshooting', title: 'Troubleshooting', description: 'Diagnose authentication, GitHub, build, and deployment blockers.', updated: '2026-07-30', sourceHref: '/community', sections: [
    { heading: 'Start with the first meaningful error', paragraphs: ['Refresh the session for authentication failures. Confirm the selected repository and permission for GitHub failures. Run the real framework build before deployment. For readiness failures, inspect the application health response instead of weakening the check.'] },
    { heading: 'Ask the community', paragraphs: ['If a reproducible issue remains, create a Bug Report in Xroga Community. Include safe steps, expected behavior, actual behavior, and the affected surface—never paste passwords or tokens.'] },
  ] },
  { slug: 'hackathon-workflows', title: 'Hackathon workflows', description: 'Turn official rules into an achievable, tested, demonstrable submission.', updated: '2026-07-30', sourceHref: '/crypto-builder', sections: [
    { heading: 'Research before building', paragraphs: ['Use the current official event rules, track requirements, submission deadline, judging rubric, and permitted pre-existing work. Treat third-party summaries as untrusted until confirmed against the organizer.'] },
    { heading: 'Ship the smallest credible demo', paragraphs: ['Choose a real problem, use the required ecosystem meaningfully, keep a visible commit history, document architecture and security decisions, deploy a working demo, and rehearse the time-limited presentation. None of these practices guarantees winning.'] },
  ] },
  { slug: 'platform', title: 'Platform overview', description: 'A truthful map of Xroga product-building capabilities.', updated: '2026-07-30', sourceHref: '/features', sections: [
    { heading: 'Research, build, validate, publish', paragraphs: ['Xroga is an AI coding and product-building agent. It can inspect connected repositories, prepare targeted changes, run applicable validation, repair diagnosed failures, and use authorized GitHub or deployment connections.'] },
    { heading: 'Evidence over simulation', paragraphs: ['Capabilities depend on project code, configured providers, account permissions, and runtime availability. Xroga reports unavailable or external setup required instead of simulated success.'] },
  ] },
  { slug: 'api', title: 'API status and contracts', description: 'Understand the public status surface and authenticated API boundary.', updated: '2026-07-30', sourceHref: '/docs/security', sections: [
    { heading: 'Current access model', paragraphs: ['Xroga application APIs use Supabase sessions for authenticated requests. The public release/status surface exposes safe build identity, while project and user operations require authorization. There is no general public customer API commitment documented here.'] },
    { heading: 'Do not ship private credentials', paragraphs: ['Use public Supabase URL and publishable key in the browser. Keep service-role keys, database URLs, provider tokens, and webhook secrets on the server.'] },
  ] },
];

export function getDoc(slug: string): DocPage | undefined { return DOC_PAGES.find((page) => page.slug === slug); }
