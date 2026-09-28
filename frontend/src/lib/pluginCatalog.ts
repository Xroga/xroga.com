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
  'Engineering',
  'Sales & CRM',
  'Commerce',
  'Marketing',
  'Finance',
  'Data & Analytics',
  'Infrastructure',
] as const;

export const PLUGIN_CATEGORY_GROUPS = [
  { id: '', label: 'All' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'communication', label: 'Communication' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'ai-automation', label: 'AI & Automation' },
  { id: 'sales-crm', label: 'Sales & CRM' },
  { id: 'commerce', label: 'Commerce' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'finance', label: 'Finance' },
  { id: 'data-analytics', label: 'Data & Analytics' },
  { id: 'design-media', label: 'Design & Media' },
  { id: 'support', label: 'Support' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'hr-recruiting', label: 'HR & Recruiting' },
  { id: 'education-research', label: 'Education & Research' },
  { id: 'scientific-research', label: 'Scientific Research' },
  { id: 'security', label: 'Security' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'travel', label: 'Travel' },
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
    category: 'Engineering',
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
    category: 'Commerce',
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
    category: 'Commerce',
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
    category: 'Finance',
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
    category: 'Engineering',
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
    category: 'Engineering',
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
    category: 'Infrastructure',
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
    category: 'Infrastructure',
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
  const haystack = `${name} ${description}`.toLowerCase();

  if (/travel|flight|airline|hotel|booking|trip|tourism|navigation|route/.test(haystack)) return 'Travel';
  if (/entertainment|music|podcast|gaming|game|movie|film|streaming|sports|astrology|horoscope|chess/.test(haystack)) return 'Entertainment';
  if (/health|fitness|medical|workout|nutrition|calorie|wellness|garmin|fitbit|clinical/.test(haystack)) return 'Healthcare';
  if (/scientific|science|biology|chemistry|genomic|genome|protein|molecular|laboratory|preprint/.test(haystack)) return 'Scientific Research';
  if (/education|academic|learning|school|university|course|scholar|literature|research/.test(haystack)) return 'Education & Research';
  if (/security|privacy|malware|threat|vulnerability|cyber|phishing|audit|compliance/.test(haystack)) return 'Security';
  if (/mail|calendar|drive|document|note/.test(haystack)) return 'Productivity';
  if (/slack|discord|message|chat|communication/.test(haystack)) return 'Communication';
  if (/github|gitlab|code|issue|monitor|sentry|developer/.test(haystack)) return 'Engineering';
  if (/crm|sales|lead|deal|hubspot/.test(haystack)) return 'Sales & CRM';
  if (/shop|payment|stripe|order|commerce/.test(haystack)) return 'Commerce';
  if (/account|invoice|finance|quickbooks|xero/.test(haystack)) return 'Finance';
  if (/analytics|data|table|airtable|database/.test(haystack)) return 'Data & Analytics';
  if (/deploy|hosting|cloud|backend|database/.test(haystack)) return 'Infrastructure';

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

const CATEGORY_NAME_MAP: Array<{
  test: RegExp;
  label: string;
}> = [
  { test: /travel|flight|airline|hotel|booking|trip|tourism|maps?|navigation|location|route|rental car/i, label: 'Travel' },
  { test: /entertainment|music|podcast|gaming|game|movie|film|streaming|sports|ticket|astrology|horoscope|chess/i, label: 'Entertainment' },
  { test: /health|healthcare|fitness|medical|workout|nutrition|calorie|wellness|garmin|fitbit|clinical|patient/i, label: 'Healthcare' },
  { test: /scientific|science|biology|chemistry|genomic|genome|protein|molecular|laboratory|lab research|research paper|preprint/i, label: 'Scientific Research' },
  { test: /education|academic|learning|school|university|course|scholar|literature|research|knowledge base/i, label: 'Education & Research' },
  { test: /security|privacy|malware|threat|vulnerability|cyber|phishing|audit|compliance|domain security/i, label: 'Security' },
  { test: /communication|messaging|chat|email|mail|sms|phone|voice|social|community|video conference|meeting/i, label: 'Communication' },
  { test: /sales|crm|lead|customer|prospect|deal|pipeline|relationship/i, label: 'Sales & CRM' },
  { test: /commerce|ecommerce|e-commerce|store|shopping|payment|checkout|order|inventory|shipping|fulfillment/i, label: 'Commerce' },
  { test: /marketing|advertis|campaign|seo|content marketing|newsletter|growth/i, label: 'Marketing' },
  { test: /finance|accounting|bank|billing|invoice|tax|expense|payroll|fintech/i, label: 'Finance' },
  { test: /human resource|\bhr\b|recruit|hiring|talent|employee|people ops|payroll/i, label: 'HR & Recruiting' },
  { test: /support|service desk|help desk|helpdesk|ticket|customer service|success/i, label: 'Support' },
  { test: /design|creative|media|image|video|audio|graphics|3d|cad|modeling|printing|animation|photo/i, label: 'Design & Media' },
  { test: /artificial intelligence|\bai\b|automation|workflow|agent|machine learning|llm|model|bot/i, label: 'AI & Automation' },
  { test: /developer|engineering|devops|code|source control|git|monitor|observability|testing|security|incident|api/i, label: 'Engineering' },
  { test: /data|analytics|database|spreadsheet|warehouse|bi|business intelligence|etl|sql|table/i, label: 'Data & Analytics' },
  { test: /cloud|infrastructure|hosting|storage|server|deployment|cdn|container|kubernetes|dns|network/i, label: 'Infrastructure' },
  { test: /productivity|document|calendar|note|file|task|project management|office|workspace|forms|survey/i, label: 'Productivity' },
];

export function catalogPrimaryCategory(
  toolkit: XrogaConnectCatalogToolkit,
): string {
  const combined = [
    toolkit.name,
    toolkit.description,
    ...toolkit.categories.map((category) => category.name),
  ]
    .filter(Boolean)
    .join(' ');

  for (const item of CATEGORY_NAME_MAP) {
    if (item.test.test(combined)) return item.label;
  }

  return inferCategory(toolkit.name, toolkit.description) === 'Other'
    ? 'Other'
    : inferCategory(toolkit.name, toolkit.description);
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
    connected: Boolean(options.connected || toolkit.noAuth),
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