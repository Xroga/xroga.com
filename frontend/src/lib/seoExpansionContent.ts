import type { ContentSection, SourceLink } from './seoGrowthContent';

export type EvidencePage = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: ContentSection[];
  sources: SourceLink[];
  related: string[];
  reviewed: string;
};

const reviewed = '2026-09-11';

export const STACK_GUIDES: EvidencePage[] = [
  {
    slug: 'nextjs',
    title: 'Build a Next.js app with an AI coding agent',
    description: 'A production-focused guide to using Xroga with Next.js repositories, covering App Router structure, validation, deployment ownership, and safe iteration.',
    intro: 'Next.js work is more than generating a page. The repository may combine server and client components, route handlers, caching, metadata, tests, and provider configuration. Xroga works from that real project context and reports the checks it can prove.',
    sections: [
      { heading: 'Start from the repository contract', paragraphs: ['Identify the package manager, Next.js version, routing model, TypeScript settings, lint and test commands, deployment target, and local project instructions before editing. Framework conventions are evidence, not permission to overwrite the project’s own architecture.'] },
      { heading: 'Keep server and client boundaries deliberate', paragraphs: ['Prefer server-rendered content for public pages and introduce client components only where interaction needs browser state. Keep secrets and privileged provider operations on trusted server paths.'], bullets: ['Avoid turning an entire route into a client component for one control', 'Treat route handlers as public API boundaries', 'Keep metadata and canonical URLs aligned with the rendered page'] },
      { heading: 'Validate the production behavior', paragraphs: ['Run the repository’s declared checks and a production build. Then verify representative routes, runtime configuration, narrow layouts, keyboard behavior, and browser errors. A successful code generation step is not proof that the deployed application works.'] },
      { heading: 'Ship through accounts you control', paragraphs: ['Source control and hosting remain explicit external systems. Xroga can prepare and validate changes, but a deployment is only live when the authorised provider returns a production URL and the resulting site passes a direct check.'] },
    ],
    sources: [{ label: 'Next.js App Router documentation', href: 'https://nextjs.org/docs/app' }, { label: 'Next.js production checklist', href: 'https://nextjs.org/docs/app/guides/production-checklist' }],
    related: ['/ai-coding-agent', '/build-with/vercel', '/learn/production-readiness-checklist'], reviewed,
  },
  {
    slug: 'react',
    title: 'Build and improve React products with Xroga',
    description: 'Use Xroga on React repositories with explicit component boundaries, accessible interaction, state ownership, tests, and reviewable source changes.',
    intro: 'React is a user-interface library, not a complete product architecture. Product quality depends on how components, state, data access, routing, accessibility, and delivery fit the repository that already exists.',
    sections: [
      { heading: 'Map the product before changing components', paragraphs: ['Inspect the component tree, state stores, request boundaries, design tokens, routes, and existing test strategy. Changes should follow the project’s established ownership instead of adding parallel state or duplicated UI primitives.'] },
      { heading: 'Build interaction people can operate', paragraphs: ['Use semantic controls, visible focus, useful labels, predictable loading and error states, and keyboard-complete interaction. Responsive behavior needs direct verification rather than inference from a desktop screenshot.'] },
      { heading: 'Control rendering and state', paragraphs: ['Keep state close to its true owner, derive values during rendering where practical, and avoid effects that merely synchronize duplicated state. Heavy client bundles and broad subscriptions can make generated interfaces feel complete while remaining slow or fragile.'] },
      { heading: 'Prove the change in context', paragraphs: ['Run the repository’s tests and build, inspect the actual diff, and verify the workflow containing the changed component. Isolated visual similarity is not enough when data, permissions, or navigation are involved.'] },
    ],
    sources: [{ label: 'React documentation', href: 'https://react.dev/learn' }, { label: 'WAI accessibility fundamentals', href: 'https://www.w3.org/WAI/fundamentals/accessibility-intro/' }],
    related: ['/ai-app-builder', '/build/dashboard', '/security'], reviewed,
  },
  {
    slug: 'typescript',
    title: 'Use AI to change TypeScript without hiding uncertainty',
    description: 'A practical guide to TypeScript work with Xroga: preserve domain types, validate boundaries, run strict checks, and keep repository changes reviewable.',
    intro: 'TypeScript can expose incorrect assumptions before runtime, but only when generated changes preserve meaningful types and validate data crossing untrusted boundaries.',
    sections: [
      { heading: 'Treat types as domain contracts', paragraphs: ['Read existing interfaces, schemas, generated clients, and compiler settings before changing them. Avoid broad casts or any-shaped escape hatches that silence a mismatch instead of resolving it.'] },
      { heading: 'Validate data at runtime boundaries', paragraphs: ['Compile-time types disappear at runtime. Validate external requests, environment configuration, provider responses, stored data, and user-controlled input before trusting their shape.'] },
      { heading: 'Keep changes narrow and traceable', paragraphs: ['Update consumers with the source contract, preserve discriminated unions and exhaustive handling, and review generated files separately from hand-authored code. Prefer a small coherent diff over duplicated compatibility layers.'] },
      { heading: 'Run the actual project checks', paragraphs: ['Use the repository’s pinned compiler and build scripts. A standalone type check can pass while framework compilation, tests, generated code, or bundling still fail. Report skipped checks and blockers explicitly.'] },
    ],
    sources: [{ label: 'TypeScript handbook', href: 'https://www.typescriptlang.org/docs/handbook/intro.html' }, { label: 'TypeScript compiler options', href: 'https://www.typescriptlang.org/tsconfig/' }],
    related: ['/ai-coding-agent', '/build/api', '/learn/production-readiness-checklist'], reviewed,
  },
  {
    slug: 'python',
    title: 'Build and maintain Python projects with Xroga',
    description: 'Use Xroga across Python applications, APIs, libraries, and automation while respecting project tooling, dependencies, tests, and deployment boundaries.',
    intro: 'A Python repository may be an API, worker, library, data tool, or a combination. Xroga first identifies the project’s own entry points and quality commands instead of assuming a web framework.',
    sections: [
      { heading: 'Detect the project rather than guessing it', paragraphs: ['Inspect packaging metadata, lockfiles, source layout, runtime version, framework configuration, test folders, type checking, formatting, and deployment files. The repository remains the source of truth.'] },
      { heading: 'Protect dependency and environment boundaries', paragraphs: ['Preserve the chosen package workflow, avoid unpinned surprise dependencies, and keep credentials outside source. Validate environment values close to startup so missing configuration fails clearly.'] },
      { heading: 'Design failure behavior', paragraphs: ['API and worker code needs explicit timeouts, cancellation, retry ownership, idempotency where work may repeat, and safe error reporting. A happy-path function is not a production service.'] },
      { heading: 'Test the intended artifact', paragraphs: ['Run the repository’s unit and integration tests, static checks, packaging or container build, and a representative runtime path. For libraries, verify the public import surface; for services, verify health and one real request boundary.'] },
    ],
    sources: [{ label: 'Python packaging guide', href: 'https://packaging.python.org/en/latest/' }, { label: 'Python documentation', href: 'https://docs.python.org/3/' }],
    related: ['/ai-coding-agent', '/build/api', '/security'], reviewed,
  },
];

const migrationShared = {
  sections: [
    { heading: 'Preserve the original before changing platforms', paragraphs: ['Export or connect the complete repository, record the working commit, capture environment-variable names without secret values, and document current domains, data stores, authentication, scheduled work, and deployment ownership.'] },
    { heading: 'Audit what the source platform supplied', paragraphs: ['Separate portable source code from hosted services, platform-specific packages, generated configuration, and implicit runtime behavior. Confirm licences and asset rights. Do not assume a Git export contains databases, secrets, deployment history, or provider state.'] },
    { heading: 'Move one boundary at a time', paragraphs: ['Make the application build locally first, then restore data and identity integrations, then deployment configuration. Keep each transition reviewable and preserve a rollback point until the replacement path is verified.'] },
    { heading: 'Verify the result rather than the transfer', paragraphs: ['Run the destination repository’s checks and production build. Test authentication, critical data paths, narrow layouts, provider callbacks, domain routing, monitoring, and rollback. Only retire the original service after the new production URL is directly verified.'] },
  ] satisfies ContentSection[],
  related: ['/ai-coding-agent', '/learn/production-readiness-checklist', '/security'],
};

export const MIGRATION_GUIDES: EvidencePage[] = [
  { slug: 'lovable-to-xroga', title: 'Move a Lovable project into a repository-led Xroga workflow', description: 'A cautious Lovable-to-Xroga migration guide covering GitHub source, hosted dependencies, validation, provider ownership, and release evidence.', intro: 'Lovable documents GitHub synchronisation for project code. A safe migration still requires an inventory of the services and configuration that live outside the repository.', sources: [{ label: 'Lovable GitHub integration', href: 'https://docs.lovable.dev/integrations/github' }, { label: 'Lovable publishing', href: 'https://docs.lovable.dev/features/publish' }], reviewed, ...migrationShared },
  { slug: 'bolt-to-xroga', title: 'Move a Bolt project into a controlled Xroga workflow', description: 'A practical Bolt-to-Xroga migration plan for Git history, branches, environment configuration, hosting, checks, and production cutover.', intro: 'Bolt documents GitHub version control and its hosting workflow. Migration means verifying both the portable repository and every provider-backed service the application still depends on.', sources: [{ label: 'Bolt GitHub version control', href: 'https://support.bolt.new/integrations/git' }, { label: 'Bolt hosting', href: 'https://support.bolt.new/cloud/hosting' }], reviewed, ...migrationShared },
  { slug: 'replit-to-xroga', title: 'Move a Replit project into a repository-led Xroga workflow', description: 'Plan a Replit-to-Xroga migration across source, secrets, runtime assumptions, data, deployment, tests, and production verification.', intro: 'Replit combines a development environment with application deployment products. Moving the code is only one part of separating that environment into explicit repository and provider boundaries.', sources: [{ label: 'Replit GitHub export', href: 'https://docs.replit.com/replit-workspace/workspace-features/version-control' }, { label: 'Replit deployments', href: 'https://docs.replit.com/cloud-services/deployments/about-deployments' }], reviewed, ...migrationShared },
  { slug: 'v0-to-xroga', title: 'Move a v0 project into a repository-led Xroga workflow', description: 'A careful v0-to-Xroga migration guide for GitHub source, framework assumptions, integrations, validation, and owned deployment.', intro: 'v0 documents GitHub repositories and Vercel deployment. A production migration should verify the full application and its connected services, not merely reproduce generated interface files.', sources: [{ label: 'v0 GitHub documentation', href: 'https://v0.dev/docs/git' }, { label: 'v0 deployment documentation', href: 'https://v0.dev/docs/deployments' }], reviewed, ...migrationShared },
];

export const CHANGELOG_ENTRIES = [
  { date: '2026-09-11', title: 'Universal project execution became more durable', details: ['Long-running API workers now remain available while agent runs are active.', 'Non-web projects use repository-appropriate validation instead of a browser-only review assumption.', 'Wrapped review verdicts are parsed without weakening rejection of failed validation.'], commits: ['3ac5a0f5', '8748ce6e', '85ac3867'] },
  { date: '2026-09-09', title: 'Evidence-led discovery pages shipped', details: ['Published comparison, alternative, build, integration, and learning hubs with canonical metadata and primary-source citations.', 'Added an automated audit for metadata, canonical URLs, structured data, discovery files, indexability, and internal links.'], commits: [] },
] as const;

export const READINESS_CHECKS = [
  { id: 'ownership', label: 'Repository, branch, owner, licence, and acceptance criteria are recorded', group: 'Ownership' },
  { id: 'secrets', label: 'Secrets stay out of source, browser bundles, logs, and analytics', group: 'Security' },
  { id: 'access', label: 'Authentication, authorization, and tenant boundaries have direct tests', group: 'Security' },
  { id: 'data', label: 'Migrations, backups, deletion, and rollback have an accountable plan', group: 'Data' },
  { id: 'quality', label: 'Type checks, tests, linting, and the production build pass', group: 'Quality' },
  { id: 'a11y', label: 'Keyboard use, focus, labels, contrast, zoom, and mobile states are verified', group: 'Quality' },
  { id: 'runtime', label: 'A representative production workflow succeeds against the intended environment', group: 'Release' },
  { id: 'operations', label: 'Health, logs, alerts, quotas, rollback, and an operator are identified', group: 'Release' },
] as const;

export type ReadinessState = Record<(typeof READINESS_CHECKS)[number]['id'], boolean>;
export function summarizeReadiness(state: Partial<ReadinessState>) {
  const confirmed = READINESS_CHECKS.filter((item) => state[item.id]).length;
  return { confirmed, unresolved: READINESS_CHECKS.length - confirmed, total: READINESS_CHECKS.length };
}
