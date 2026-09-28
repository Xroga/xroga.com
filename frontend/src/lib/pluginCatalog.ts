import type { XrogaConnectCatalogToolkit, XrogaConnectTool } from '@/lib/xrogaConnect';

export type PluginView = 'discover' | 'connected' | 'developer' | 'custom';
export type NativePluginId = 'github' | 'vercel' | 'supabase';
export type PluginSource = 'native' | 'composio' | 'credential';
export type ConnectionState =
  | 'checking'
  | 'connected'
  | 'disconnected'
  | 'needs_attention'
  | 'error';

export type PluginDefinition = {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: string;
  provider?: string;
  source: PluginSource;
  query?: string;
  popular?: boolean;
  developer?: boolean;
  keywords?: string[];
  examples?: string[];
  nativeCapabilities?: string[];
  developerUsage?: string[];
};

export type RuntimePlugin = PluginDefinition & {
  toolkit?: string;
  logo?: string;
  logoFallback?: string;
  connected: boolean;
  noAuth?: boolean;
  connectionState?: ConnectionState;
  capabilityCount?: number;
  toolsCount?: number;
  triggersCount?: number;
  authSchemes?: string[];
  managedAuthSchemes?: string[];
  categories?: Array<{ id: string; name: string }>;
  version?: string;
  appUrl?: string;
  authGuideUrl?: string;
  accountLabel?: string;
  statusMessage?: string;
};

export type PluginCapability = {
  id: string;
  name: string;
  description?: string;
  group: string;
  risk: 'read' | 'write' | 'destructive' | 'unknown';
  requiresConfirmation: boolean;
  rawToolSlug: string;
};

export type PluginCapabilityGroup = {
  id: string;
  name: string;
  capabilities: PluginCapability[];
};

export const CATEGORY_ORDER = [
  'All',
  'Productivity',
  'Communication',
  'Sales & CRM',
  'Customer Support',
  'Commerce & Payments',
  'Marketing & Growth',
  'Booking & Scheduling',
  'Travel & Hospitality',
  'Finance & Accounting',
  'Data & Analytics',
  'Databases',
  'Developer Tools',
  'Deployment & Hosting',
  'Cloud & Infrastructure',
  'AI & Automation',
  'Content & Files',
  'Design & Media',
  'HR & Recruiting',
  'Security',
  'Education & Research',
  'Scientific Research',
  'Healthcare & Fitness',
  'Entertainment',
  'Other',
] as const;

export const PLUGIN_CATEGORY_GROUPS = [
  { id: '', label: 'All' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Communication' },
  { id: 'sales-crm', label: 'Sales & CRM' },
  { id: 'support', label: 'Customer Support' },
  { id: 'commerce-payments', label: 'Commerce & Payments' },
  { id: 'marketing-growth', label: 'Marketing & Growth' },
  { id: 'booking-scheduling', label: 'Booking & Scheduling' },
  { id: 'travel-hospitality', label: 'Travel & Hospitality' },
  { id: 'finance-accounting', label: 'Finance & Accounting' },
  { id: 'data-analytics', label: 'Data & Analytics' },
  { id: 'databases', label: 'Databases' },
  { id: 'developer-tools', label: 'Developer Tools' },
  { id: 'deployment-hosting', label: 'Deployment & Hosting' },
  { id: 'cloud-infrastructure', label: 'Cloud & Infrastructure' },
  { id: 'ai-automation', label: 'AI & Automation' },
  { id: 'content-files', label: 'Content & Files' },
  { id: 'design-media', label: 'Design & Media' },
  { id: 'hr-recruiting', label: 'HR & Recruiting' },
  { id: 'security', label: 'Security' },
  { id: 'education-research', label: 'Education & Research' },
  { id: 'scientific-research', label: 'Scientific Research' },
  { id: 'healthcare-fitness', label: 'Healthcare & Fitness' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'other', label: 'Other' },
] as const;

export type PluginCategoryGroupId =
  (typeof PLUGIN_CATEGORY_GROUPS)[number]['id'];

export const PLUGIN_DEFINITIONS: PluginDefinition[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    provider: 'Google',
    description: 'Search, read, draft and manage email.',
    longDescription:
      'Connect Gmail so Xroga can search messages, understand email threads, draft replies, find attachments, and perform supported email actions when you ask.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    query: 'find Gmail email message thread attachment draft send label capabilities',
    keywords: ['email', 'mail', 'inbox', 'reply', 'attachments'],
    examples: [
      'Summarize unread emails from today.',
      'Find the latest invoice in my inbox.',
      'Draft a reply to my latest customer email.',
      'Show messages that need my attention.',
    ],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    provider: 'Google',
    description: 'Find, create and manage calendar events.',
    longDescription:
      'Connect Google Calendar so Xroga can inspect schedules and use the supported event actions available through your authorized account.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    query: 'find Google Calendar schedule meeting event capabilities',
    keywords: ['calendar', 'schedule', 'meeting', 'events'],
    examples: [
      'Show my meetings for tomorrow.',
      'Find a free hour on Friday afternoon.',
      'Create a calendar event from these details.',
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    provider: 'Google',
    description: 'Find and work with files stored in Google Drive.',
    longDescription:
      'Connect Google Drive so Xroga can use supported file and document capabilities when you explicitly ask.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    query: 'find Google Drive file folder document search upload capabilities',
    keywords: ['files', 'documents', 'storage', 'upload'],
    examples: [
      'Find the latest project brief in Drive.',
      'Search Drive for invoices from this month.',
      'Find files related to this customer.',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    provider: 'Slack',
    description: 'Work with messages, channels and team conversations.',
    longDescription:
      'Connect Slack so Xroga can search supported workspace content and perform supported messaging actions when requested.',
    category: 'Communication',
    source: 'composio',
    popular: true,
    query: 'find Slack message channel thread search send capabilities',
    keywords: ['messages', 'channels', 'team', 'chat'],
    examples: [
      'Summarize today’s messages in #support.',
      'Find what engineering said about the launch bug.',
      'Draft a project update for the team.',
      'Search messages mentioning the launch.',
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    provider: 'GitHub',
    description: 'Work with repositories, code, issues and pull requests.',
    longDescription:
      'Connect GitHub so Xroga can work with your authorized repositories, project updates, branches, issues, pull requests, and code history.',
    category: 'Developer Tools',
    source: 'native',
    popular: true,
    developer: true,
    keywords: ['repository', 'code', 'issue', 'pull request', 'git'],
    examples: [
      'Show open issues for this repository.',
      'Find recent pull requests.',
      'Explain the latest commit.',
      'Create an issue from this bug report.',
    ],
    nativeCapabilities: [
      'Repositories',
      'Issues',
      'Pull requests',
      'Branches',
      'Commits',
      'Files',
    ],
    developerUsage: ['Code & repositories', 'Project updates'],
  },
  {
    id: 'notion',
    name: 'Notion',
    provider: 'Notion',
    description: 'Search and manage pages, databases and workspace content.',
    longDescription:
      'Connect Notion so Xroga can search supported workspace content and use supported page or database actions when requested.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    query: 'find Notion page database workspace search create update capabilities',
    keywords: ['pages', 'database', 'notes', 'documents'],
    examples: [
      'Find our latest launch notes.',
      'Summarize this Notion page.',
      'Create a project note from this conversation.',
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    provider: 'Stripe',
    description: 'Work with customers, invoices, billing and payments.',
    longDescription:
      'Connect Stripe so Xroga can inspect and use the supported customer, invoice, billing, subscription, and payment actions available to your account.',
    category: 'Commerce & Payments',
    source: 'composio',
    popular: true,
    query: 'find Stripe customer invoice billing payment subscription refund product capabilities',
    keywords: ['payments', 'invoice', 'billing', 'customer', 'subscription'],
    examples: [
      'Find failed payments from this week.',
      'Show open invoices for this customer.',
      'Summarize subscription cancellations.',
      'Create an invoice using these details.',
    ],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    provider: 'Shopify',
    description: 'Work with store orders, products and customers.',
    longDescription:
      'Connect Shopify so Xroga can work with supported store, order, product, customer, inventory, and fulfillment actions.',
    category: 'Commerce & Payments',
    source: 'composio',
    popular: true,
    query: 'find Shopify order product customer inventory fulfillment store capabilities',
    keywords: ['orders', 'store', 'products', 'inventory', 'commerce'],
    examples: [
      'Show today’s orders.',
      'Find orders waiting for fulfillment.',
      'Find a customer’s latest order.',
      'Summarize product inventory issues.',
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    provider: 'HubSpot',
    description: 'Work with contacts, companies, deals and CRM activity.',
    longDescription:
      'Connect HubSpot so Xroga can use supported CRM actions for contacts, companies, deals, and related activity.',
    category: 'Sales & CRM',
    source: 'composio',
    popular: true,
    query: 'find HubSpot contact company deal CRM search create update capabilities',
    keywords: ['crm', 'sales', 'contacts', 'deals', 'customers'],
    examples: [
      'Find this customer in HubSpot.',
      'Summarize open deals this week.',
      'Show recent activity for this company.',
    ],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    provider: 'Airtable',
    description: 'Find, create and update records in Airtable bases.',
    category: 'Data & Analytics',
    source: 'composio',
    query: 'find Airtable record base table search create update capabilities',
    keywords: ['records', 'database', 'table', 'data'],
    examples: [
      'Find records matching this customer.',
      'Summarize rows added this week.',
      'Create a new record from these details.',
    ],
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    provider: 'Intuit',
    description: 'Work with invoices, customers and accounting records.',
    category: 'Finance & Accounting',
    source: 'composio',
    query: 'find QuickBooks invoice customer accounting payment capabilities',
    keywords: ['invoice', 'accounting', 'customer', 'payment', 'finance'],
    examples: [
      'Find unpaid invoices.',
      'Show invoices for this customer.',
      'Summarize recent accounting activity.',
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    provider: 'Linear',
    description: 'Create, find and manage issues and projects.',
    category: 'Developer Tools',
    source: 'composio',
    popular: true,
    query: 'find Linear issue project task create update search capabilities',
    keywords: ['issues', 'projects', 'engineering', 'tasks'],
    examples: [
      'Show open issues assigned to me.',
      'Find issues related to authentication.',
      'Create an issue from this bug report.',
    ],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    provider: 'Sentry',
    description: 'Inspect errors, issues and application monitoring data.',
    category: 'Developer Tools',
    source: 'composio',
    developer: true,
    query: 'find Sentry error issue monitoring project event capabilities',
    keywords: ['errors', 'monitoring', 'issues', 'debugging'],
    examples: [
      'Show the most frequent production errors.',
      'Find new issues from today.',
      'Summarize this Sentry issue.',
    ],
    developerUsage: ['Monitoring & errors'],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    provider: 'Vercel',
    description: 'Connect deployment infrastructure for web projects.',
    longDescription:
      'Connect Vercel so Xroga can use your authorized deployment infrastructure for supported web project workflows.',
    category: 'Deployment & Hosting',
    source: 'native',
    developer: true,
    keywords: ['deploy', 'hosting', 'web', 'production'],
    nativeCapabilities: ['Projects', 'Deployments', 'Environment access'],
    developerUsage: ['Web publishing'],
    examples: [
      'Show my recent deployments and which one is live.',
      'Check whether this project is ready to deploy.',
      'Open the production deployment for this project.',
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    provider: 'Supabase',
    description: 'Connect database, authentication, storage and realtime.',
    longDescription:
      'Connect Supabase so Xroga can use your authorized project for supported database, authentication, storage, and provisioning workflows.',
    category: 'Databases',
    source: 'native',
    developer: true,
    keywords: ['database', 'auth', 'storage', 'backend', 'realtime'],
    nativeCapabilities: ['Projects', 'Database setup', 'Authentication', 'Storage'],
    developerUsage: ['Project backend', 'Authentication', 'Storage'],
    examples: [
      'Show the Supabase project connected to this app.',
      'Check whether database and authentication are ready.',
      'Help me prepare the backend services this project needs.',
    ],
  },
];

export const POPULAR_HYDRATION_QUERY =
  'find capabilities for Gmail, Google Calendar, Google Drive, Slack, Stripe, Shopify, HubSpot, Notion, Airtable, QuickBooks, Linear, and Sentry';

export const PLUGIN_MAP = new Map(PLUGIN_DEFINITIONS.map((plugin) => [plugin.id, plugin]));

export function canonicalPluginId(value: string): string {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (compact.includes('gmail')) return 'gmail';
  if (compact.includes('googlecalendar') || compact === 'gcal') return 'google-calendar';
  if (compact.includes('googledrive')) return 'google-drive';
  if (compact.includes('slack')) return 'slack';
  if (compact.includes('stripe')) return 'stripe';
  if (compact.includes('shopify')) return 'shopify';
  if (compact.includes('hubspot')) return 'hubspot';
  if (compact.includes('notion')) return 'notion';
  if (compact.includes('airtable')) return 'airtable';
  if (compact.includes('quickbooks')) return 'quickbooks';
  if (compact.includes('linear')) return 'linear';
  if (compact.includes('sentry')) return 'sentry';
  if (compact.includes('github')) return 'github';
  if (compact.includes('vercel')) return 'vercel';
  if (compact.includes('supabase')) return 'supabase';

  return compact || value.toLowerCase();
}

export function displayToolkitName(toolkit: string): string {
  return toolkit
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function inferCategory(name: string, description = ''): string {
  const text = `${name} ${description}`.toLowerCase();

  if (/\b(flight|airline|hotel|hospitality|lodging|tourism|trip\.com|skyscanner|travel)\b/.test(text)) return 'Travel & Hospitality';
  if (/\b(calendly|cal\.com|appointment|booking|scheduler|scheduling|reservation)\b/.test(text)) return 'Booking & Scheduling';
  if (/\b(postgres|postgresql|mysql|mongodb|neon|planetscale|redis|database platform|sql database)\b/.test(text)) return 'Databases';
  if (/\b(vercel|netlify|render|railway|heroku|fly\.io|deployment platform|deploy apps?|web hosting|app hosting|serverless hosting)\b/.test(text)) return 'Deployment & Hosting';
  if (/\b(security|privacy|malware|threat|vulnerability|cyber|phishing|compliance)\b/.test(text)) return 'Security';
  if (/\b(scientific|biology|chemistry|genomic|genome|protein|molecular|laboratory|preprint)\b/.test(text)) return 'Scientific Research';
  if (/\b(education|academic|learning|university|course|scholar|literature|research paper)\b/.test(text)) return 'Education & Research';
  if (/\b(health|healthcare|fitness|medical|workout|nutrition|calorie|wellness|garmin|fitbit|patient)\b/.test(text)) return 'Healthcare & Fitness';
  if (/\b(music|podcast|gaming|game|movie|streaming|sports|astrology|horoscope|chess)\b/.test(text)) return 'Entertainment';
  if (/\b(marketing|advertis|campaign|seo|newsletter|growth|conversion)\b/.test(text)) return 'Marketing & Growth';
  if (/\b(support|helpdesk|service desk|customer service)\b/.test(text)) return 'Customer Support';
  if (/\b(crm|lead|prospect|sales pipeline|deal)\b/.test(text)) return 'Sales & CRM';
  if (/\b(payment|checkout|ecommerce|e-commerce|shopping|order|inventory|fulfillment)\b/.test(text)) return 'Commerce & Payments';
  if (/\b(accounting|banking|invoice|tax|expense|fintech|payroll)\b/.test(text)) return 'Finance & Accounting';
  if (/\b(analytics|dashboard|business intelligence|data warehouse|etl|reporting)\b/.test(text)) return 'Data & Analytics';
  if (/\b(cloud|infrastructure|cdn|dns|network|container|kubernetes|server monitoring)\b/.test(text)) return 'Cloud & Infrastructure';
  if (/\b(github|gitlab|developer|devops|source control|code review|api testing|observability)\b/.test(text)) return 'Developer Tools';
  if (/\b(ai|agent|automation|workflow|llm|model context protocol|mcp)\b/.test(text)) return 'AI & Automation';
  if (/\b(design|creative|image|video|audio|graphics|3d|cad|animation|photo)\b/.test(text)) return 'Design & Media';
  if (/\b(document|file|storage|note|transcription|signature)\b/.test(text)) return 'Content & Files';
  if (/\b(email|messaging|chat|sms|phone|voice|meeting|conference)\b/.test(text)) return 'Communication';
  if (/\b(calendar|task|project management|spreadsheet|workspace|productivity)\b/.test(text)) return 'Productivity';

  return 'Other';
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function prettyToolName(tool: XrogaConnectTool): string {
  const toolkitPrefix = tool.toolkit.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  let slug = tool.slug.toUpperCase();

  if (toolkitPrefix && slug.startsWith(`${toolkitPrefix}_`)) {
    slug = slug.slice(toolkitPrefix.length + 1);
  }

  slug = slug
    .replace(/_V\d+$/i, '')
    .replace(/\bGET\b/g, 'READ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const replacements: Array<[RegExp, string]> = [
    [/^FETCH\s+/i, 'Get '],
    [/^LIST\s+/i, 'List '],
    [/^SEARCH\s+/i, 'Search '],
    [/^READ\s+/i, 'Read '],
    [/^CREATE\s+/i, 'Create '],
    [/^SEND\s+/i, 'Send '],
    [/^UPDATE\s+/i, 'Update '],
    [/^EDIT\s+/i, 'Edit '],
    [/^DELETE\s+/i, 'Delete '],
    [/^REMOVE\s+/i, 'Remove '],
    [/^UPLOAD\s+/i, 'Upload '],
    [/^DOWNLOAD\s+/i, 'Download '],
  ];

  let human = slug.toLowerCase();
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(slug)) {
      human = replacement + slug.replace(pattern, '').toLowerCase();
      break;
    }
  }

  human = human.replace(/\b(id|url|api|crm)\b/gi, (part) => part.toUpperCase());
  return human.charAt(0).toUpperCase() + human.slice(1);
}

export function capabilityGroupFor(tool: XrogaConnectTool): string {
  const haystack = `${tool.slug} ${tool.description ?? ''}`.toLowerCase();

  if (/attach|upload|download|file|folder|drive/.test(haystack)) return 'Files & attachments';
  if (/contact|customer|lead|company|account/.test(haystack)) return 'People & customers';
  if (/invoice|payment|billing|refund|subscription|charge/.test(haystack)) return 'Billing & payments';
  if (/order|product|inventory|fulfill|store/.test(haystack)) return 'Commerce';
  if (/issue|pull|branch|commit|repository|repo|code/.test(haystack)) return 'Engineering';
  if (/event|calendar|schedule|meeting/.test(haystack)) return 'Scheduling';
  if (/delete|remove|archive/.test(haystack)) return 'Organize & remove';
  if (/message|thread|email|mail|channel|conversation/.test(haystack)) {
    if (/send|draft|create|reply|post/.test(haystack)) return 'Draft & send';
    return 'Search & read';
  }
  if (/create|send|post|add/.test(haystack)) return 'Create & send';
  if (/update|edit|modify|set|assign/.test(haystack)) return 'Update & manage';
  if (/search|fetch|get|list|read|find|lookup/.test(haystack)) return 'Search & read';

  return 'Available capabilities';
}

export function normalizeCapability(tool: XrogaConnectTool): PluginCapability {
  return {
    id: tool.slug,
    name: prettyToolName(tool),
    description: tool.description,
    group: capabilityGroupFor(tool),
    risk: tool.risk ?? 'unknown',
    requiresConfirmation: Boolean(tool.requiresConfirmation),
    rawToolSlug: tool.slug,
  };
}

export function groupCapabilities(tools: XrogaConnectTool[]): PluginCapabilityGroup[] {
  const groups = new Map<string, PluginCapability[]>();

  for (const tool of tools) {
    const capability = normalizeCapability(tool);
    const group = groups.get(capability.group) ?? [];
    group.push(capability);
    groups.set(capability.group, group);
  }

  return [...groups.entries()]
    .map(([name, capabilities]) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      capabilities: capabilities.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      const order = [
        'Search & read',
        'Draft & send',
        'Create & send',
        'Update & manage',
        'Files & attachments',
        'People & customers',
        'Billing & payments',
        'Commerce',
        'Scheduling',
        'Engineering',
        'Organize & remove',
        'Available capabilities',
      ];
      return order.indexOf(a.name) - order.indexOf(b.name);
    });
}

export function pluginDefinitionFor(id: string): PluginDefinition | undefined {
  return PLUGIN_MAP.get(canonicalPluginId(id));
}

export function genericPluginDefinition(slug: string): PluginDefinition {
  const name = titleCase(slug.replace(/[-_]+/g, ' '));
  return {
    id: canonicalPluginId(slug),
    name,
    description: 'Connect this app so Xroga can use its supported capabilities.',
    category: inferCategory(name),
    source: 'composio',
    query: `find ${name} capabilities`,
    keywords: [name.toLowerCase()],
  };
}

export function composioLogoUrl(
  toolkit: string,
  theme?: 'dark',
): string {
  const base = `https://logos.composio.dev/api/${encodeURIComponent(toolkit)}`;
  return theme === 'dark' ? `${base}?theme=dark` : base;
}

function catalogCategoryText(
  toolkit: XrogaConnectCatalogToolkit,
): string {
  return toolkit.categories
    .flatMap((category) => [category.id, category.name])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function catalogPrimaryCategory(
  toolkit: XrogaConnectCatalogToolkit,
): string {
  const categories = catalogCategoryText(toolkit);
  const text = `${toolkit.name} ${toolkit.description ?? ''}`.toLowerCase();

  if (
    /travel|flight|airline|hotel|hospitality|lodging|tourism|vacation|accommodation|rental car/.test(categories) ||
    /\b(flight|airline|hotel|hospitality|lodging|tourism|trip\.com|skyscanner|travel)\b/.test(text)
  ) return 'Travel & Hospitality';

  if (
    /scheduling\s*&\s*booking|scheduling and booking|appointment|reservation/.test(categories) ||
    /\b(calendly|cal\.com|appointment|booking|scheduler|scheduling|reservation)\b/.test(text)
  ) return 'Booking & Scheduling';

  if (
    /\bdatabases?\b/.test(categories) ||
    /\b(postgres|postgresql|mysql|mongodb|neon|planetscale|redis|database platform|sql database)\b/.test(text)
  ) return 'Databases';

  if (
    /website\s*&\s*app building|website and app building|app builder|website builders/.test(categories) ||
    /\b(vercel|netlify|render|railway|heroku|fly\.io|deployment platform|deploy apps?|build and deploy|web hosting|app hosting|serverless hosting)\b/.test(text)
  ) return 'Deployment & Hosting';

  if (/security\s*&\s*identity|security and identity/.test(categories)) return 'Security';
  if (/developer tools/.test(categories)) return 'Developer Tools';
  if (/it operations|server monitoring|internet of things/.test(categories)) return 'Cloud & Infrastructure';
  if (/online courses/.test(categories)) return 'Education & Research';

  if (/artificial intelligence|ai agents|ai assistants|ai chatbots|ai content generation|ai document extraction|ai meeting assistants|ai models|ai safety compliance detection|ai sales tools|ai web scraping|model context protocol/.test(categories)) {
    return 'AI & Automation';
  }

  if (/business intelligence|analytics|dashboards/.test(categories)) return 'Data & Analytics';
  if (/accounting|fundraising|proposal\s*&\s*invoice|proposal and invoice|taxes/.test(categories)) return 'Finance & Accounting';
  if (/commerce|ecommerce|payment processing|reviews/.test(categories)) return 'Commerce & Payments';
  if (/marketing|ads\s*&\s*conversion|ads and conversion|drip emails|email newsletters|event management|marketing automation|social media accounts|social media marketing|transactional email|url shortener|webinars/.test(categories)) {
    return 'Marketing & Growth';
  }
  if (/customer support|\bsupport\b|customer appreciation/.test(categories)) return 'Customer Support';
  if (/sales\s*&\s*crm|sales and crm|contact management|\bcrm\b/.test(categories)) return 'Sales & CRM';
  if (/images\s*&\s*design|images and design|video\s*&\s*audio|video and audio/.test(categories)) return 'Design & Media';
  if (/content\s*&\s*files|content and files|documents|file management\s*&\s*storage|file management and storage|notes|transcription|signatures/.test(categories)) {
    return 'Content & Files';
  }
  if (/human resources|hr talent\s*&\s*recruitment|hr talent and recruitment/.test(categories)) return 'HR & Recruiting';
  if (/\beducation\b/.test(categories)) return 'Education & Research';
  if (/fitness/.test(categories)) return 'Healthcare & Fitness';
  if (/gaming|lifestyle\s*&\s*entertainment|lifestyle and entertainment|news\s*&\s*lifestyle|news and lifestyle/.test(categories)) return 'Entertainment';
  if (/phone\s*&\s*sms|phone and sms|team chat|team collaboration|video conferencing|communication|call tracking|\bemail\b|fax|notifications/.test(categories)) {
    return 'Communication';
  }
  if (/calendar/.test(categories)) return 'Booking & Scheduling';
  if (/productivity|bookmark managers|product management|project management|spreadsheets|task management|time tracking software|forms\s*&\s*surveys|forms and surveys/.test(categories)) {
    return 'Productivity';
  }

  return inferCategory(toolkit.name, toolkit.description);
}

export function groundedUseCasePrompt(
  tool: XrogaConnectTool,
  pluginName: string,
): string {
  const action = tool.name || prettyToolName(tool);
  const cleanAction = action.replace(/[.!?]+$/, '').trim();
  const lower = cleanAction.toLowerCase();

  if (/^(search|find|lookup)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} and show me the most relevant results.`;
  }
  if (/^(list|read|get|fetch|retrieve)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} and summarize what matters.`;
  }
  if (/^(create|add|draft|generate)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} from the details I provide.`;
  }
  if (/^(send|post|publish|reply)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} after I review the content.`;
  }
  if (/^(update|edit|modify|set|assign|move|rename)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} using the changes I give you.`;
  }
  if (/^(delete|remove|archive|revoke|cancel)\b/i.test(cleanAction)) {
    return `Use ${pluginName} to ${lower} only after confirming with me.`;
  }

  return `Use ${pluginName} to ${lower}.`;
}

export function pluginFromCatalog(
  toolkit: XrogaConnectCatalogToolkit,
  options: {
    connected?: boolean;
    accountLabel?: string;
    statusMessage?: string;
  } = {},
): RuntimePlugin {
  const canonical = canonicalPluginId(toolkit.slug);
  const override = PLUGIN_MAP.get(canonical);
  const category = override?.category || catalogPrimaryCategory(toolkit);

  return {
    ...(override ?? genericPluginDefinition(toolkit.slug)),
    id: canonical,
    name: toolkit.name || override?.name || displayToolkitName(toolkit.slug),
    description:
      toolkit.description ||
      override?.description ||
      'Connect this app so Xroga can use its supported capabilities.',
    longDescription:
      override?.longDescription ||
      toolkit.description ||
      'Connect this app so Xroga can use its real supported capabilities when you ask.',
    category,
    source: override?.source === 'native' ? 'native' : 'composio',
    toolkit: toolkit.slug,
    logo: toolkit.logo,
    logoFallback: composioLogoUrl(toolkit.slug),
    connected: Boolean(options.connected),
    noAuth: toolkit.noAuth,
    capabilityCount: toolkit.toolsCount,
    toolsCount: toolkit.toolsCount,
    triggersCount: toolkit.triggersCount,
    authSchemes: toolkit.authSchemes,
    managedAuthSchemes: toolkit.managedAuthSchemes,
    categories: toolkit.categories,
    version: toolkit.version,
    appUrl: toolkit.appUrl,
    authGuideUrl: toolkit.authGuideUrl,
    accountLabel: options.accountLabel,
    statusMessage: options.statusMessage,
    query:
      override?.query ||
      `find ${toolkit.name || displayToolkitName(toolkit.slug)} capabilities`,
    keywords: [
      ...(override?.keywords ?? []),
      toolkit.slug,
      toolkit.name,
      ...toolkit.categories.map((item) => item.name),
    ].filter(Boolean),
  };
}

export function pluginSearchScore(
  plugin: RuntimePlugin,
  query: string,
  semanticToolkitSlugs: ReadonlySet<string> = new Set(),
): number {
  const clean = query.trim().toLowerCase();
  if (!clean) return 0;

  const name = plugin.name.toLowerCase();
  const toolkit = (plugin.toolkit || '').toLowerCase();
  const id = plugin.id.toLowerCase();
  const category = plugin.category.toLowerCase();
  const description = plugin.description.toLowerCase();

  let score = 0;

  if (name === clean || toolkit === clean || id === clean) score += 10_000;
  if (name.startsWith(clean) || toolkit.startsWith(clean)) score += 5_000;
  if (name.includes(clean) || toolkit.includes(clean) || id.includes(clean)) score += 2_500;
  if ((plugin.keywords ?? []).some((keyword) => keyword.toLowerCase() === clean)) score += 2_000;
  if ((plugin.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(clean))) score += 1_000;
  if (category.includes(clean)) score += 500;
  if (description.includes(clean)) score += 350;
  if (semanticToolkitSlugs.has((plugin.toolkit || plugin.id).toLowerCase())) score += 300;
  if (plugin.connected) score += 25;

  return score;
}

export function authSummary(plugin: RuntimePlugin): string {
  if (plugin.noAuth) return 'No auth';

  const managed = plugin.managedAuthSchemes ?? [];
  const auth = plugin.authSchemes ?? [];

  if (managed.some((item) => /oauth/i.test(item))) return 'Managed OAuth';
  if (auth.some((item) => /oauth/i.test(item))) return 'OAuth';
  if (auth.some((item) => /api[_ -]?key/i.test(item))) return 'API key';
  if (auth.length) return auth[0]!.replace(/[_-]+/g, ' ');
  return plugin.source === 'native' ? 'Xroga native' : 'Connect';
}