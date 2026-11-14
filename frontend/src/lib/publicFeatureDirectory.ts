/**
 * Public /features discovery map.
 *
 * Curated from frontend/src/lib/features.ts, capabilityPages.ts,
 * layout/nav/navData.ts and docs/product/PUBLIC-CLAIM-VERIFICATION.md.
 * A discoverable feature is not proof of an authorized live provider action.
 * The Connect group uses the same highlighted provider names as the public nav;
 * the much larger build-technology catalog stays at /integrations.
 */
import { CAPABILITY_PAGES } from '@/lib/capabilityPages';
import { CONNECT_GROUPS, CONNECT_MORE } from '@/components/layout/nav/navData';

export type FeatureSectionId = 'research' | 'build' | 'develop' | 'ship' | 'workspace' | 'connect';
export type FeatureKind = 'feature' | 'scaffold' | 'conditional' | 'catalog';
export type FeatureGlyph = 'chat' | 'search' | 'document' | 'image' | 'code' |
  'apps' | 'web' | 'saas' | 'game' | 'mobile' | 'extension' | 'desktop' | 'api' |
  'bot' | 'crypto' | 'automation' | 'bug' | 'test' | 'git' | 'preview' |
  'shield' | 'deploy' | 'cloud' | 'key' | 'files' | 'terminal' | 'history' |
  'settings' | 'clock' | 'user' | 'sparkles' | 'plug' | 'chart' | 'layers';

export type PublicFeature = {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: FeatureGlyph;
  kind?: FeatureKind;
  /** Hidden metadata for search, not another promise of provider capability. */
  searchTerms?: string;
};
export type PublicFeatureGroup = {
  id: FeatureSectionId;
  title: string;
  subtitle: string;
  items: PublicFeature[];
};

const cap = (slug: keyof typeof CAPABILITY_PAGES) => CAPABILITY_PAGES[slug].description;

/* Keep the small, benefit-led descriptions distinct from runtime claims. */
export const PUBLIC_FEATURE_GROUPS: PublicFeatureGroup[] = [
  {
    id: 'research',
    title: 'Chat, search and understand',
    subtitle: 'Start with a question, inspect a document, and carry useful context into your project.',
    items: [
      { id: 'ai-chat', title: 'AI Chat', description: 'Conversation for questions, reasoning and supported research tasks.', href: '/features/ai-chat', icon: 'chat' },
      { id: 'web-research', title: 'Current web research', description: 'Search public web sources and follow the evidence.', href: '/features/ai-chat', icon: 'search' },
      { id: 'deep-research', title: 'Deeper research', description: 'Extended research paths with explicit availability and partial-result limits.', href: '/features/ai-chat', icon: 'search', kind: 'conditional' },
      { id: 'x-research', title: 'X / Twitter research', description: 'X evidence where the relevant search provider is configured and authorized.', href: '/features/ai-chat', icon: 'chat', kind: 'conditional' },
      { id: 'document-analysis', title: 'Document understanding', description: 'Work with supported PDF, DOCX, text, Markdown and code inputs.', href: '/features/ai-chat', icon: 'document' },
      { id: 'screenshot-analysis', title: 'Image and screenshot analysis', description: 'Understand supplied screenshots and visual inputs through supported vision paths.', href: '/features/ai-chat', icon: 'image' },
      { id: 'chat-project-handoff', title: 'Chat to project handoff', description: 'Continue suitable requests as authorized work in a connected repository.', href: '/ai-coding-agent', icon: 'layers' },
      { id: 'attachment-upload', title: 'Drag-and-drop attachments', description: 'Add supported files as context for your conversation or software work.', href: '/features/ai-chat', icon: 'files' },
    ],
  },
  {
    id: 'build',
    title: 'Build apps, websites and more',
    subtitle: 'Explore the software types Xroga can generate or scaffold. Some targets need external tools before release.',
    items: [
      { id: 'app-builder', title: 'AI app builder', description: cap('ai-app-builder'), href: '/ai-app-builder', icon: 'apps' },
      { id: 'website-builder', title: 'AI website builder', description: cap('ai-website-builder'), href: '/ai-website-builder', icon: 'web' },
      { id: 'saas-builder', title: 'SaaS products', description: cap('build-saas-with-ai'), href: '/build-saas-with-ai', icon: 'saas' },
      { id: 'games', title: 'Game development', description: 'Build supported browser game experiences and inspect the resulting code.', href: '/game-builder', icon: 'game' },
      { id: 'mobile', title: 'Mobile app scaffolds', description: 'Prepare Expo Android and iOS projects; store delivery requires your EAS credentials and review.', href: '/build', icon: 'mobile', kind: 'scaffold' },
      { id: 'extensions', title: 'Chrome extension projects', description: 'Scaffold Manifest V3 extensions and prepare a source-owned release package.', href: '/build', icon: 'extension', kind: 'scaffold' },
      { id: 'desktop', title: 'Electron desktop projects', description: 'Prepare Electron code with a GitHub Actions release path.', href: '/build', icon: 'desktop', kind: 'scaffold' },
      { id: 'api', title: 'APIs and custom tools', description: 'Create application APIs, internal tools and utilities as maintainable code.', href: '/build', icon: 'api' },
      { id: 'auth-api', title: 'Authentication + API starters', description: 'Scaffold Next.js authentication and API routes for supported projects.', href: '/build', icon: 'key', kind: 'scaffold' },
      { id: 'chatbot', title: 'Chatbot starters', description: 'Create a chatbot landing page and a BYOK /api/chat implementation scaffold.', href: '/build', icon: 'bot', kind: 'scaffold' },
      { id: 'automation-scaffold', title: 'Automation runner starters', description: 'Scaffold cron and LLM automation projects; this is not a hosted 24/7 automation promise.', href: '/build', icon: 'automation', kind: 'scaffold' },
      { id: 'web3', title: 'Web3 applications', description: 'Build wallet-facing interfaces and supported blockchain data applications.', href: '/crypto', icon: 'crypto' },
      { id: 'crypto-dashboard', title: 'Crypto dashboard pack', description: 'Create market dashboards, without custody or automated trading.', href: '/crypto', icon: 'chart', kind: 'scaffold' },
      { id: 'business-apps', title: 'Booking, CRM and dashboards', description: 'Explore patterns for business software, workflows and role-aware dashboards.', href: '/build', icon: 'apps' },
      { id: 'seo-output', title: 'SEO-ready web foundations', description: 'Generate sitemap, metadata and Open Graph structure where supported.', href: '/ai-website-builder', icon: 'web' },
    ],
  },
  {
    id: 'develop',
    title: 'Code, iterate and verify',
    subtitle: 'Work in an existing codebase, review focused changes and distinguish executed checks from assumptions.',
    items: [
      { id: 'coding-agent', title: 'Repository-aware coding agent', description: cap('ai-coding-agent'), href: '/ai-coding-agent', icon: 'code' },
      { id: 'existing-projects', title: 'Existing codebases', description: 'Inspect a connected project and preserve unrelated work during scoped edits.', href: '/ai-coding-agent', icon: 'files' },
      { id: 'bug-fixing', title: 'Debugging and fixes', description: 'Investigate errors, implement changes and run relevant validation.', href: '/ai-coding-agent', icon: 'bug' },
      { id: 'project-context', title: 'Project-aware implementation', description: 'Use repository files and existing patterns as context for code changes.', href: '/ai-coding-agent', icon: 'layers' },
      { id: 'task-loop', title: 'Plan → build → QA → ship', description: 'Move supported software requests through implementation and validation stages.', href: '/software', icon: 'automation' },
      { id: 'tests', title: 'Tests and production builds', description: 'Run applicable checks and report their actual exit results.', href: '/ai-coding-agent', icon: 'test' },
      { id: 'diff', title: 'Reviewable source changes', description: 'Inspect changed files and diffs before publishing or reviewing.', href: '/github-ai-coding-agent', icon: 'git' },
      { id: 'pull-requests', title: 'GitHub branches and PRs', description: 'Prepare branches, commits and pull requests with authorized repository access.', href: '/github-ai-coding-agent', icon: 'git', kind: 'conditional' },
      { id: 'web-preview', title: 'Browser-backed web checks', description: 'Use configured build/preview verification gates where supported; not general web automation.', href: '/ai-app-builder', icon: 'preview', kind: 'conditional' },
      { id: 'readiness', title: 'Production readiness checker', description: 'Review operational and release considerations before shipping.', href: '/tools/production-readiness-checker', icon: 'shield' },
    ],
  },
  {
    id: 'ship',
    title: 'Publish, deliver and own your code',
    subtitle: 'Different release targets have different authorization, build and provider requirements.',
    items: [
      { id: 'github-sticky', title: 'Create and iterate on GitHub', description: 'Keep working on the same source-owned repository across changes.', href: '/github-ai-coding-agent', icon: 'git', kind: 'conditional' },
      { id: 'github-release', title: 'GitHub review workflow', description: 'Commit and push reviewable changes or open a pull request with authorization.', href: '/github-ai-coding-agent', icon: 'git', kind: 'conditional' },
      { id: 'vercel', title: 'Vercel deployment', description: cap('vercel-ai-deployment'), href: '/vercel-ai-deployment', icon: 'deploy', kind: 'conditional' },
      { id: 'custom-domain', title: 'Custom domains', description: 'Use a domain through your configured Vercel project; DNS still needs real setup.', href: '/vercel-ai-deployment', icon: 'web', kind: 'conditional' },
      { id: 'chrome-release', title: 'Extension release packages', description: 'Prepare Chrome extension zip output through GitHub Releases.', href: '/build', icon: 'extension', kind: 'conditional' },
      { id: 'desktop-release', title: 'Desktop release artifacts', description: 'Prepare Electron build outputs through configured GitHub Actions.', href: '/build', icon: 'desktop', kind: 'conditional' },
      { id: 'expo-publish', title: 'Expo / EAS handoff', description: 'Prepare mobile publishing with your EAS account and tokens; not automatic store approval.', href: '/build', icon: 'mobile', kind: 'conditional' },
      { id: 'supabase-env', title: 'Supabase key handoff', description: 'Use authorized protected credentials to configure a supported deployment.', href: '/integrations', icon: 'key', kind: 'conditional' },
      { id: 'deploy-verify', title: 'Deployment verification', description: 'Separate successful builds, provider acceptance and independently checked live URLs.', href: '/vercel-ai-deployment', icon: 'shield' },
    ],
  },
  {
    id: 'workspace',
    title: 'Workspace, files and account',
    subtitle: 'The day-to-day controls around projects, work visibility, permissions and account usage.',
    items: [
      { id: 'workspace', title: 'Connected workspace', description: 'Conversation, project context, software work and review in one product surface.', href: '/software', icon: 'layers' },
      { id: 'file-manager', title: 'Project file manager', description: 'Browse and manage supported project files in the workspace.', href: '/software', icon: 'files' },
      { id: 'terminal', title: 'Fullscreen terminal', description: 'A larger terminal view for active software tasks.', href: '/software', icon: 'terminal' },
      { id: 'preview-dock', title: 'Browser preview dock', description: 'Inspect applicable generated web previews during development.', href: '/software', icon: 'preview' },
      { id: 'activity', title: 'Live run activity', description: 'Follow server-sent progress updates for supported execution runs.', href: '/software', icon: 'clock' },
      { id: 'run-history', title: 'Build and run history', description: 'Return to previous supported work and see recorded task status.', href: '/software', icon: 'history' },
      { id: 'usage', title: 'Usage and reset visibility', description: 'See plan consumption, pacing and reset information when available.', href: '/pricing', icon: 'chart' },
      { id: 'limits', title: 'Bounded run capacity', description: 'Usage limits and task concurrency help keep shared capacity predictable.', href: '/pricing', icon: 'clock' },
      { id: 'free-plan', title: 'Free plan', description: 'Explore the included allowance before choosing a paid subscription.', href: '/pricing', icon: 'sparkles' },
      { id: 'pro', title: 'Xroga Pro', description: 'Upgrade through the supported billing path for a larger plan allowance.', href: '/pricing', icon: 'sparkles' },
      { id: 'sign-in', title: 'Sign-in options', description: 'Use supported email, magic link, Google or GitHub account paths.', href: '/auth/signup', icon: 'user' },
      { id: 'profile', title: 'Profile and settings', description: 'Manage supported preferences and account information.', href: '/software', icon: 'settings' },
      { id: 'themes', title: 'Workspace themes', description: 'Light and dark variations with supported accessibility preferences.', href: '/software', icon: 'settings' },
      { id: 'mobile-workspace', title: 'Responsive workspace', description: 'Use an adapted workspace layout on mobile-width screens.', href: '/software', icon: 'mobile' },
      { id: 'secrets', title: 'Protected credentials', description: 'Keep authorized provider secrets in server-side protected paths.', href: '/security', icon: 'key' },
      { id: 'cloud-api', title: 'Cloud-backed execution', description: 'The product uses a cloud API; this is platform infrastructure, not a separately sold agent.', href: '/security', icon: 'cloud' },
      { id: 'supabase-profiles', title: 'Account and profile infrastructure', description: 'Authentication and account profile data use protected service boundaries.', href: '/security', icon: 'shield' },
    ],
  },
  {
    id: 'connect',
    title: 'Explore apps and integrations',
    subtitle: 'These provider names come from the public integration discovery menu. Listing does not imply a live connection.',
    items: [
      ...CONNECT_GROUPS.flatMap(group => group.brands),
      ...CONNECT_MORE,
    ].map(brand => ({
      id: 'provider-' + brand.slug,
      title: brand.name,
      description: brand.category + ' — inspect support and authorization options in the integration directory.',
      href: '/integrations',
      icon: 'plug' as const,
      kind: 'catalog' as const,
      searchTerms: brand.category + ' ' + brand.slug,
    })),
  },
];

export const PUBLIC_FEATURE_TOTAL = PUBLIC_FEATURE_GROUPS.reduce((total, section) => total + section.items.length, 0);
