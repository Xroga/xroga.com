import type {
  XrogaConnectToolkit,
  XrogaConnectTool,
} from '@/lib/xrogaConnect';

export type PluginCategory =
  | 'Productivity'
  | 'Communication'
  | 'Engineering'
  | 'Sales & CRM'
  | 'Commerce'
  | 'Marketing'
  | 'Finance'
  | 'Data & Analytics'
  | 'Design & Media'
  | 'Infrastructure'
  | 'Support'
  | 'Other';

export type PluginSource =
  | 'native'
  | 'composio'
  | 'credential'
  | 'remote';

export type PluginAvailability =
  | 'available'
  | 'coming_soon'
  | 'unavailable';

export interface MarketplacePlugin {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  source: PluginSource;
  searchTerms: string[];
  logo?: string;
  toolkit?: string;
  connected?: boolean;
  statusMessage?: string;
  capabilityCount?: number;
  availability: PluginAvailability;
  connectable: boolean;
  popular?: boolean;
  developer?: boolean;
}

export const PLUGIN_CATEGORIES: readonly PluginCategory[] = [
  'Productivity',
  'Communication',
  'Engineering',
  'Sales & CRM',
  'Commerce',
  'Marketing',
  'Finance',
  'Data & Analytics',
  'Design & Media',
  'Infrastructure',
  'Support',
  'Other',
] as const;

const PLUGIN_ALIASES: Record<string, string> = {
  github_app: 'github',
  'github-app': 'github',
  googlecalendar: 'google-calendar',
  google_calendar: 'google-calendar',
  gcal: 'google-calendar',
  googledrive: 'google-drive',
  google_drive: 'google-drive',
  quickbooks_online: 'quickbooks',
  quickbooksonline: 'quickbooks',
  'quickbooks-online': 'quickbooks',
  hubspotcrm: 'hubspot',
  linearapp: 'linear',
  sentryio: 'sentry',
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function canonicalPluginId(raw: string, name?: string): string {
  const rawSlug = slugify(raw).replace(/-/g, '_');
  const direct =
    PLUGIN_ALIASES[raw.trim().toLowerCase()] ??
    PLUGIN_ALIASES[rawSlug];

  if (direct) return direct;

  const slug = slugify(raw);
  if (slug) return slug;

  return slugify(name ?? 'plugin') || 'plugin';
}

const SEED_PLUGINS: MarketplacePlugin[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repositories, issues, pull requests, and project code.',
    category: 'Engineering',
    source: 'native',
    searchTerms: ['code', 'repositories', 'repo', 'issues', 'pull requests', 'create github issues', 'source control'],
    availability: 'available',
    connectable: true,
    popular: true,
    developer: true,
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deploy and manage production web applications.',
    category: 'Infrastructure',
    source: 'native',
    searchTerms: ['deploy', 'hosting', 'web hosting', 'production', 'domains', 'publish website'],
    availability: 'available',
    connectable: true,
    popular: true,
    developer: true,
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Database, authentication, storage, and realtime.',
    category: 'Infrastructure',
    source: 'native',
    searchTerms: ['database', 'auth', 'storage', 'postgres', 'realtime', 'backend'],
    availability: 'available',
    connectable: true,
    popular: true,
    developer: true,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search, read, draft, and manage email.',
    category: 'Productivity',
    source: 'composio',
    searchTerms: ['email', 'mail', 'messages', 'inbox', 'read emails', 'send email', 'draft reply'],
    availability: 'available',
    connectable: true,
    popular: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Find, create, and manage calendar events.',
    category: 'Productivity',
    source: 'composio',
    searchTerms: ['calendar', 'events', 'meetings', 'schedule meetings', 'appointments'],
    availability: 'available',
    connectable: true,
    popular: true,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Find, organize, and work with files in Drive.',
    category: 'Productivity',
    source: 'composio',
    searchTerms: ['files', 'documents', 'drive', 'upload files', 'folders', 'download files'],
    availability: 'available',
    connectable: true,
    popular: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Work with messages, channels, and conversations.',
    category: 'Communication',
    source: 'composio',
    searchTerms: ['messages', 'channels', 'team chat', 'send message', 'search messages'],
    availability: 'available',
    connectable: true,
    popular: true,
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Customers, payments, subscriptions, and billing.',
    category: 'Commerce',
    source: 'composio',
    searchTerms: ['payments', 'billing', 'customers', 'subscriptions', 'send invoices', 'create invoice', 'payment links'],
    availability: 'available',
    connectable: true,
    popular: true,
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Orders, products, customers, and store operations.',
    category: 'Commerce',
    source: 'composio',
    searchTerms: ['orders', 'products', 'store', 'inventory', 'manage orders', 'customers'],
    availability: 'available',
    connectable: true,
    popular: true,
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Contacts, companies, deals, and CRM activity.',
    category: 'Sales & CRM',
    source: 'composio',
    searchTerms: ['crm', 'contacts', 'deals', 'sales', 'customers', 'leads'],
    availability: 'available',
    connectable: true,
    popular: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages, databases, notes, and workspace knowledge.',
    category: 'Productivity',
    source: 'composio',
    searchTerms: ['pages', 'notes', 'documents', 'database', 'knowledge', 'workspace'],
    availability: 'available',
    connectable: true,
    popular: true,
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Read and manage bases, tables, and records.',
    category: 'Data & Analytics',
    source: 'composio',
    searchTerms: ['records', 'tables', 'database', 'spreadsheet', 'bases'],
    availability: 'available',
    connectable: true,
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    description: 'Accounting, invoices, customers, and transactions.',
    category: 'Finance',
    source: 'composio',
    searchTerms: ['accounting', 'invoice', 'invoices', 'send invoices', 'customers', 'expenses', 'transactions'],
    availability: 'available',
    connectable: true,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issues, projects, teams, and engineering planning.',
    category: 'Engineering',
    source: 'composio',
    searchTerms: ['issues', 'projects', 'tasks', 'bugs', 'engineering', 'create issue'],
    availability: 'available',
    connectable: true,
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Errors, issues, releases, and application monitoring.',
    category: 'Engineering',
    source: 'composio',
    searchTerms: ['errors', 'bugs', 'monitoring', 'issues', 'crashes', 'releases'],
    availability: 'available',
    connectable: true,
    developer: true,
  },
  {
    id: 'brevo',
    name: 'Brevo',
    description: 'Transactional email and marketing delivery.',
    category: 'Marketing',
    source: 'credential',
    searchTerms: ['email', 'marketing', 'transactional email', 'campaigns'],
    availability: 'available',
    connectable: true,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'DNS, CDN, SSL, edge services, and storage.',
    category: 'Infrastructure',
    source: 'credential',
    searchTerms: ['dns', 'cdn', 'ssl', 'r2', 'workers', 'edge', 'domains'],
    availability: 'available',
    connectable: true,
    developer: true,
  },
];

export const PLUGIN_SEED: readonly MarketplacePlugin[] = SEED_PLUGINS;

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'google-calendar': 'Google Calendar',
  'google-drive': 'Google Drive',
  quickbooks: 'QuickBooks',
  github: 'GitHub',
  hubspot: 'HubSpot',
  sentry: 'Sentry',
};

function displayToolkitName(value: string): string {
  const id = canonicalPluginId(value);
  if (DISPLAY_NAME_OVERRIDES[id]) return DISPLAY_NAME_OVERRIDES[id];

  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function inferCategory(toolkit: string, name: string, description = ''): PluginCategory {
  const haystack = `${toolkit} ${name} ${description}`.toLowerCase();

  if (/gmail|calendar|drive|notion|docs|dropbox|todo|productivity/.test(haystack)) return 'Productivity';
  if (/slack|discord|teams|telegram|message|communication/.test(haystack)) return 'Communication';
  if (/github|gitlab|linear|sentry|jira|developer|code|issue/.test(haystack)) return 'Engineering';
  if (/hubspot|salesforce|crm|deal|lead|sales/.test(haystack)) return 'Sales & CRM';
  if (/stripe|shopify|commerce|payment|order|store/.test(haystack)) return 'Commerce';
  if (/mailchimp|brevo|marketing|campaign/.test(haystack)) return 'Marketing';
  if (/quickbooks|xero|finance|accounting|invoice/.test(haystack)) return 'Finance';
  if (/airtable|snowflake|analytics|data|sheet/.test(haystack)) return 'Data & Analytics';
  if (/figma|canva|design|media|image|video/.test(haystack)) return 'Design & Media';
  if (/vercel|supabase|cloudflare|aws|database|hosting|infrastructure/.test(haystack)) return 'Infrastructure';
  if (/zendesk|intercom|support|ticket/.test(haystack)) return 'Support';

  return 'Other';
}

export function pluginsFromSearch(
  toolkits: readonly XrogaConnectToolkit[],
  tools: readonly XrogaConnectTool[],
): MarketplacePlugin[] {
  const counts = new Map<string, number>();

  for (const tool of tools) {
    const id = canonicalPluginId(tool.toolkit);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return toolkits.map((item) => {
    const id = canonicalPluginId(item.toolkit, item.name);
    const name = item.name?.trim() || displayToolkitName(item.toolkit);
    const description =
      item.description?.trim() ||
      `Connect ${name} so Xroga can use its available capabilities when you ask.`;

    return {
      id,
      name,
      description,
      category: inferCategory(item.toolkit, name, description),
      source: 'composio',
      searchTerms: [item.toolkit, name, description],
      logo: item.logo,
      toolkit: item.toolkit,
      connected: item.connected,
      statusMessage: item.statusMessage,
      capabilityCount: counts.get(id),
      availability: 'available',
      connectable: true,
    };
  });
}

export function mergePlugins(
  base: readonly MarketplacePlugin[],
  incoming: readonly MarketplacePlugin[],
): MarketplacePlugin[] {
  const merged = new Map<string, MarketplacePlugin>();

  const add = (plugin: MarketplacePlugin) => {
    const id = canonicalPluginId(plugin.id, plugin.name);
    const current = merged.get(id);

    if (!current) {
      merged.set(id, { ...plugin, id });
      return;
    }

    merged.set(id, {
      ...current,
      ...plugin,
      id,
      name: current.name || plugin.name,
      description:
        current.description &&
        !current.description.startsWith('Connect ')
          ? current.description
          : plugin.description || current.description,
      category: current.category !== 'Other' ? current.category : plugin.category,
      source: current.source === 'native' ? current.source : plugin.source,
      searchTerms: Array.from(
        new Set([...current.searchTerms, ...plugin.searchTerms]),
      ),
      logo: plugin.logo || current.logo,
      toolkit: plugin.toolkit || current.toolkit,
      connected: Boolean(current.connected || plugin.connected),
      statusMessage: plugin.statusMessage || current.statusMessage,
      capabilityCount:
        Math.max(current.capabilityCount ?? 0, plugin.capabilityCount ?? 0) || undefined,
      availability:
        current.availability === 'available' || plugin.availability === 'available'
          ? 'available'
          : plugin.availability,
      connectable: current.connectable || plugin.connectable,
      popular: current.popular || plugin.popular,
      developer: current.developer || plugin.developer,
    });
  };

  base.forEach(add);
  incoming.forEach(add);

  return Array.from(merged.values());
}

function normalizedSearchText(plugin: MarketplacePlugin): string {
  return [
    plugin.name,
    plugin.id,
    plugin.description,
    plugin.category,
    ...plugin.searchTerms,
  ]
    .join(' ')
    .toLowerCase();
}

export function rankPlugins(
  plugins: readonly MarketplacePlugin[],
  query: string,
): MarketplacePlugin[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [...plugins];

  const tokens = clean.split(/\s+/g).filter(Boolean);

  return plugins
    .map((plugin) => {
      const name = plugin.name.toLowerCase();
      const haystack = normalizedSearchText(plugin);
      let score = 0;

      if (name === clean) score += 1000;
      if (name.startsWith(clean)) score += 500;
      if (name.includes(clean)) score += 300;
      if (haystack.includes(clean)) score += 180;

      for (const token of tokens) {
        if (name === token) score += 120;
        else if (name.startsWith(token)) score += 75;
        else if (name.includes(token)) score += 50;

        if (haystack.includes(token)) score += 25;
      }

      if (plugin.connected) score += 8;
      if (plugin.popular) score += 4;

      return { plugin, score };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.plugin.name.localeCompare(b.plugin.name),
    )
    .map((entry) => entry.plugin);
}

export function filterPluginsByCategory(
  plugins: readonly MarketplacePlugin[],
  category: PluginCategory | 'All',
): MarketplacePlugin[] {
  if (category === 'All') return [...plugins];
  return plugins.filter((plugin) => plugin.category === category);
}

export function pluginMatchesToolkit(
  plugin: MarketplacePlugin,
  toolkit: XrogaConnectToolkit,
): boolean {
  const pluginId = canonicalPluginId(plugin.id, plugin.name);
  const toolkitId = canonicalPluginId(toolkit.toolkit, toolkit.name);

  if (pluginId === toolkitId) return true;

  const name = toolkit.name?.toLowerCase().trim();
  return Boolean(name && name === plugin.name.toLowerCase().trim());
}
