/**
 * Navigation V2: the mega-menu content. Labels and destinations are carried over unchanged from the previous header
 * (every route verified to exist in app/); only presentation keys are added (`preview`, the link's illustration).
 * Several items share a destination page today (e.g. Overview, Xroga Intelligence and Verification all open /features);
 * that is a content gap reported for the founder, not something to paper over with invented routes.
 */
import {
  AppWindow,
  BookOpen,
  Boxes,
  Code2,
  FileCode2,
  GalleryHorizontalEnd,
  GitBranch,
  Globe2,
  LayoutDashboard,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export type MenuKey = 'Product' | 'Build' | 'Connect' | 'Develop' | 'Explore';

export type MegaItem = {
  href: string;
  label: string;
  note: string;
  icon: LucideIcon;
  /** which state of the menu's preview this link shows on hover or focus */
  preview?: string;
};

export type MegaMenu = {
  eyebrow: string;
  title: string;
  description: string;
  groups: { label: string; items: MegaItem[] }[];
  ctaHref: string;
  ctaLabel: string;
};

export const MEGA_MENUS: Record<MenuKey, MegaMenu> = {
  Product: {
    eyebrow: 'Xroga',
    title: 'Everything Xroga can do.',
    description: 'One AI workspace to create software, work on existing code, connect external apps, verify results and help ship what you build.',
    groups: [
      {
        label: 'Platform',
        items: [
          { href: '/features', label: 'Overview', note: 'See the full Xroga product.', icon: Sparkles, preview: 'overview' },
          { href: '/software', label: 'Workspace', note: 'Chat, build, inspect, preview and iterate.', icon: LayoutDashboard, preview: 'workspace' },
          { href: '/features', label: 'Xroga Intelligence', note: 'Plan and coordinate software work.', icon: Workflow, preview: 'intelligence' },
        ],
      },
      {
        label: 'Trust & tools',
        items: [
          { href: '/features', label: 'Verification', note: 'Tests, builds, evidence and blockers.', icon: ShieldCheck, preview: 'verification' },
          { href: '/integrations', label: 'Integrations', note: 'Connect apps and services to Xroga.', icon: Boxes, preview: 'integrations' },
          { href: '/github-ai-coding-agent', label: 'GitHub & ownership', note: 'Keep source code in repositories you control.', icon: GitBranch, preview: 'ownership' },
        ],
      },
    ],
    ctaHref: '/features',
    ctaLabel: 'Explore Xroga',
  },
  Build: {
    eyebrow: 'Build',
    title: 'Build almost any kind of software.',
    description: 'Start with an idea, a prompt or a product direction and turn it into a working project.',
    groups: [
      {
        label: 'Products',
        items: [
          { href: '/ai-app-builder', label: 'Web apps', note: 'Full-stack products with real application logic.', icon: AppWindow, preview: 'webapp' },
          { href: '/ai-website-builder', label: 'Websites', note: 'Marketing sites, product sites and landing pages.', icon: Globe2, preview: 'website' },
          { href: '/build-saas-with-ai', label: 'SaaS', note: 'Subscription products, dashboards and accounts.', icon: LayoutDashboard, preview: 'saas' },
        ],
      },
      {
        label: 'More to build',
        items: [
          { href: '/build', label: 'Extensions, APIs & tools', note: 'Browser extensions, APIs, automations and utilities.', icon: Boxes, preview: 'extension' },
          { href: '/game-builder', label: 'Games', note: 'Build supported playable web experiences.', icon: Rocket, preview: 'game' },
          { href: '/crypto', label: 'Web3 & crypto', note: 'Build supported Web3 product experiences.', icon: Sparkles, preview: 'web3' },
        ],
      },
    ],
    ctaHref: '/build',
    ctaLabel: 'Explore what you can build',
  },
  Connect: {
    eyebrow: 'Xroga Connect',
    title: 'Connect Xroga to the apps you already use.',
    description: 'Let Xroga retrieve data from supported connected apps and perform actions you explicitly request. You choose what to connect and authorize.',
    groups: [],
    ctaHref: '/integrations',
    ctaLabel: 'Explore all integrations',
  },
  Develop: {
    eyebrow: 'Develop',
    title: 'Work on real software you already own.',
    description: 'Bring an existing repository and use Xroga for implementation, debugging, verification and release preparation.',
    groups: [
      {
        label: 'Your code',
        items: [
          { href: '/ai-coding-agent', label: 'Existing projects', note: 'Understand and change a real codebase.', icon: Code2, preview: 'tree' },
          { href: '/github-ai-coding-agent', label: 'GitHub repositories', note: 'Work from connected repositories and branches.', icon: GitBranch, preview: 'branch' },
          { href: '/ai-coding-agent', label: 'Add features & fix bugs', note: 'Make focused changes without rebuilding everything.', icon: FileCode2, preview: 'diff' },
        ],
      },
      {
        label: 'Ship it',
        items: [
          { href: '/ai-coding-agent', label: 'Test & verify', note: 'Run relevant checks and surface failures.', icon: ShieldCheck, preview: 'tests' },
          { href: '/tools/production-readiness-checker', label: 'Production readiness', note: 'Check whether a project is ready to ship.', icon: Search, preview: 'ready' },
          { href: '/docs', label: 'Developer docs', note: 'Technical reference and workflow guidance.', icon: TerminalSquare, preview: 'docs' },
        ],
      },
    ],
    ctaHref: '/ai-coding-agent',
    ctaLabel: 'Explore development workflows',
  },
  Explore: {
    eyebrow: 'Explore',
    title: 'See what Xroga can build and how it works.',
    description: 'Browse examples, learn the workflows and compare product paths before you start.',
    groups: [
      {
        label: 'Discover',
        items: [
          { href: '/showcase', label: 'Showcase', note: 'See real product directions and output.', icon: GalleryHorizontalEnd, preview: 'showcase' },
          { href: '/build', label: 'Build categories', note: 'Explore apps, websites, SaaS, tools and more.', icon: Boxes, preview: 'categories' },
          { href: '/learn', label: 'Guides & tutorials', note: 'Learn how to build with Xroga.', icon: BookOpen, preview: 'guides' },
        ],
      },
      {
        label: 'Read',
        items: [
          { href: '/blog', label: 'Blog', note: 'Product, software and AI-building insights.', icon: FileCode2, preview: 'blog' },
          { href: '/compare', label: 'Compare', note: 'Evidence-based comparisons and alternatives.', icon: ShieldCheck, preview: 'compare' },
          { href: '/docs', label: 'Docs', note: 'Product and technical documentation.', icon: BookOpen, preview: 'docs' },
        ],
      },
    ],
    ctaHref: '/showcase',
    ctaLabel: 'Explore Xroga',
  },
};

/** `favicon`: the mark is no longer on Simple Icons, so the provider's own favicon is used directly */
export type ConnectBrand = { name: string; slug: string; color: string; category: string; domain?: string; favicon?: boolean };

/** providers shown in Connect; marks load from Simple Icons (as before), with a favicon fallback where provided */
export const CONNECT_GROUPS: { label: string; brands: ConnectBrand[] }[] = [
  {
    label: 'Work & communication',
    brands: [
      { name: 'Gmail', slug: 'gmail', color: 'EA4335', category: 'Email', domain: 'mail.google.com' },
      { name: 'Google Calendar', slug: 'googlecalendar', color: '4285F4', category: 'Scheduling', domain: 'calendar.google.com' },
      { name: 'Google Drive', slug: 'googledrive', color: '4285F4', category: 'Storage', domain: 'drive.google.com' },
      { name: 'Slack', slug: 'slack', color: '4A154B', category: 'Messaging', domain: 'slack.com', favicon: true },
      { name: 'Discord', slug: 'discord', color: '5865F2', category: 'Community', domain: 'discord.com' },
      { name: 'Notion', slug: 'notion', color: '000000', category: 'Workspace', domain: 'notion.so' },
      { name: 'Dropbox', slug: 'dropbox', color: '0061FF', category: 'Storage', domain: 'dropbox.com' },
    ],
  },
  {
    label: 'Projects & business',
    brands: [
      { name: 'Linear', slug: 'linear', color: '5E6AD2', category: 'Issues', domain: 'linear.app' },
      { name: 'Jira', slug: 'jira', color: '0052CC', category: 'Issues', domain: 'atlassian.com' },
      { name: 'Asana', slug: 'asana', color: 'F06A6A', category: 'Projects', domain: 'asana.com' },
      { name: 'Airtable', slug: 'airtable', color: '18BFFF', category: 'Data', domain: 'airtable.com' },
      { name: 'HubSpot', slug: 'hubspot', color: 'FF7A59', category: 'CRM', domain: 'hubspot.com' },
      { name: 'Salesforce', slug: 'salesforce', color: '00A1E0', category: 'CRM', domain: 'salesforce.com', favicon: true },
      { name: 'Stripe', slug: 'stripe', color: '635BFF', category: 'Payments', domain: 'stripe.com' },
    ],
  },
  {
    label: 'Build & ship',
    brands: [
      { name: 'GitHub', slug: 'github', color: '181717', category: 'Code', domain: 'github.com' },
      { name: 'Vercel', slug: 'vercel', color: '000000', category: 'Deploy', domain: 'vercel.com' },
      { name: 'Supabase', slug: 'supabase', color: '3FCF8E', category: 'Database', domain: 'supabase.com' },
      { name: 'Cloudflare', slug: 'cloudflare', color: 'F38020', category: 'Edge', domain: 'cloudflare.com' },
      { name: 'Sentry', slug: 'sentry', color: '362D59', category: 'Monitoring', domain: 'sentry.io' },
      { name: 'Shopify', slug: 'shopify', color: '7AB55C', category: 'Commerce', domain: 'shopify.com' },
    ],
  },
];

export const CONNECT_MORE: ConnectBrand[] = [
  { name: 'OneDrive', slug: 'microsoftonedrive', color: '0078D4', category: 'Storage', domain: 'onedrive.live.com', favicon: true },
  { name: 'Box', slug: 'box', color: '0061D5', category: 'Storage', domain: 'box.com' },
  { name: 'Calendly', slug: 'calendly', color: '006BFF', category: 'Scheduling', domain: 'calendly.com' },
  { name: 'Mailchimp', slug: 'mailchimp', color: 'FFE01B', category: 'Marketing', domain: 'mailchimp.com' },
  { name: 'Twilio', slug: 'twilio', color: 'F22F46', category: 'Communication', domain: 'twilio.com', favicon: true },
  { name: 'Postman', slug: 'postman', color: 'FF6C37', category: 'Developer', domain: 'postman.com' },
  { name: 'MongoDB', slug: 'mongodb', color: '47A248', category: 'Database', domain: 'mongodb.com' },
  { name: 'OpenAI', slug: 'openai', color: '412991', category: 'AI', domain: 'openai.com', favicon: true },
  { name: 'Figma', slug: 'figma', color: 'F24E1E', category: 'Design', domain: 'figma.com' },
  { name: 'PayPal', slug: 'paypal', color: '003087', category: 'Payments', domain: 'paypal.com' },
];
