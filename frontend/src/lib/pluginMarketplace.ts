import type { XrogaConnectToolkit, XrogaConnectTool } from './xrogaConnect';

export const PLUGIN_VIEWS = ['discover', 'connected', 'developer', 'custom'] as const;
export type PluginView = (typeof PLUGIN_VIEWS)[number];

export const PLUGIN_CATEGORIES = [
  'All',
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

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];
export type PluginSource = 'native' | 'composio' | 'credential';

export interface PluginSeed {
  id: string;
  name: string;
  description: string;
  category: Exclude<PluginCategory, 'All'>;
  source: PluginSource;
  popular?: boolean;
  developer?: boolean;
  searchQuery?: string;
  toolkitHint?: string;
  keywords?: string[];
}

export interface PluginRecord extends PluginSeed {
  logo?: string;
  toolkit?: string;
  connected: boolean;
  resolved: boolean;
  available: boolean;
  statusMessage?: string;
  capabilityCount?: number;
  noAuth?: boolean;
}

export const NATIVE_PLUGIN_SEEDS: readonly PluginSeed[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Save, update and work with repositories from Xroga.',
    category: 'Engineering',
    source: 'native',
    popular: true,
    developer: true,
    keywords: ['code', 'repository', 'repo', 'issues', 'pull requests'],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deploy and manage web applications from Xroga.',
    category: 'Infrastructure',
    source: 'native',
    popular: true,
    developer: true,
    keywords: ['deploy', 'hosting', 'web', 'production'],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Database, authentication, storage and realtime for your apps.',
    category: 'Infrastructure',
    source: 'native',
    popular: true,
    developer: true,
    keywords: ['database', 'auth', 'storage', 'backend', 'realtime'],
  },
] as const;

export const COMPOSIO_PLUGIN_SEEDS: readonly PluginSeed[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search, read, draft and manage Gmail.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    toolkitHint: 'gmail',
    searchQuery: 'find Gmail email and message capabilities',
    keywords: ['email', 'inbox', 'message', 'draft', 'reply'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Find, create and work with calendar events.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    toolkitHint: 'googlecalendar',
    searchQuery: 'find Google Calendar event capabilities',
    keywords: ['calendar', 'schedule', 'meeting', 'event'],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Find and work with files stored in Google Drive.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    toolkitHint: 'googledrive',
    searchQuery: 'find Google Drive file capabilities',
    keywords: ['files', 'documents', 'storage', 'upload'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Work with Slack messages, channels and conversations.',
    category: 'Communication',
    source: 'composio',
    popular: true,
    toolkitHint: 'slack',
    searchQuery: 'find Slack message and channel capabilities',
    keywords: ['message', 'channel', 'team', 'chat'],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Work with customers, billing and payment data.',
    category: 'Commerce',
    source: 'composio',
    popular: true,
    toolkitHint: 'stripe',
    searchQuery: 'find Stripe payment invoice and customer capabilities',
    keywords: ['payments', 'invoice', 'billing', 'customer', 'subscription'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Work with orders, products, customers and store data.',
    category: 'Commerce',
    source: 'composio',
    popular: true,
    toolkitHint: 'shopify',
    searchQuery: 'find Shopify order product and store capabilities',
    keywords: ['orders', 'products', 'store', 'inventory', 'customers'],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Work with contacts, companies, deals and CRM data.',
    category: 'Sales & CRM',
    source: 'composio',
    popular: true,
    toolkitHint: 'hubspot',
    searchQuery: 'find HubSpot contact company and deal capabilities',
    keywords: ['crm', 'contacts', 'deals', 'sales', 'customers'],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Search and work with Notion pages and databases.',
    category: 'Productivity',
    source: 'composio',
    popular: true,
    toolkitHint: 'notion',
    searchQuery: 'find Notion page and database capabilities',
    keywords: ['pages', 'database', 'notes', 'documents', 'workspace'],
  },
  {
    id: 'airtable',
    name: 'Airtable',
    description: 'Find and work with Airtable bases and records.',
    category: 'Data & Analytics',
    source: 'composio',
    toolkitHint: 'airtable',
    searchQuery: 'find Airtable base and record capabilities',
    keywords: ['records', 'base', 'table', 'data'],
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    description: 'Work with accounting, customers, invoices and payments.',
    category: 'Finance',
    source: 'composio',
    toolkitHint: 'quickbooks',
    searchQuery: 'find QuickBooks invoice accounting and customer capabilities',
    keywords: ['invoice', 'accounting', 'customer', 'payments', 'finance'],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Work with issues, projects and engineering workflows.',
    category: 'Engineering',
    source: 'composio',
    popular: true,
    toolkitHint: 'linear',
    searchQuery: 'find Linear issue and project capabilities',
    keywords: ['issues', 'project', 'engineering', 'bugs', 'tasks'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Inspect errors, issues and application monitoring data.',
    category: 'Engineering',
    source: 'composio',
    popular: true,
    toolkitHint: 'sentry',
    searchQuery: 'find Sentry error issue and monitoring capabilities',
    keywords: ['errors', 'monitoring', 'issues', 'observability'],
  },
] as const;

export const CREDENTIAL_PLUGIN_SEEDS: readonly PluginSeed[] = [
  {
    id: 'brevo',
    name: 'Brevo',
    description: 'Transactional email and marketing delivery credentials.',
    category: 'Marketing',
    source: 'credential',
    keywords: ['email', 'marketing', 'transactional'],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'CDN, DNS, security and storage credentials for your apps.',
    category: 'Infrastructure',
    source: 'credential',
    developer: true,
    keywords: ['cdn', 'dns', 'r2', 'workers', 'security'],
  },
  {
    id: 'lemon-squeezy',
    name: 'Lemon Squeezy',
    description: 'Commerce and billing credentials for your live product.',
    category: 'Commerce',
    source: 'credential',
    keywords: ['payments', 'billing', 'subscriptions'],
  },
] as const;

const ALIASES: Record<string, string> = {
  googlecalendar: 'google-calendar',
  google_calendar: 'google-calendar',
  'google-calendar': 'google-calendar',
  googledrive: 'google-drive',
  google_drive: 'google-drive',
  'google-drive': 'google-drive',
  quickbooks_online: 'quickbooks',
  'quickbooks-online': 'quickbooks',
  cloudflare_r2: 'cloudflare',
  'cloudflare-r2': 'cloudflare',
  cloudflare_workers_dns: 'cloudflare',
  'cloudflare-workers-dns': 'cloudflare',
  lemon_squeezy: 'lemon-squeezy',
  'lemon-squeezy': 'lemon-squeezy',
};

const SEED_BY_ID = new Map(
  [...NATIVE_PLUGIN_SEEDS, ...COMPOSIO_PLUGIN_SEEDS, ...CREDENTIAL_PLUGIN_SEEDS].map((seed) => [
    seed.id,
    seed,
  ]),
);

export function canonicalPluginId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  return ALIASES[normalized] ?? normalized.replace(/_/g, '-');
}

export function displayToolkitName(toolkit: string): string {
  return toolkit
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function pluginCategoryFor(
  rawCategory: string | undefined,
  id: string,
  name: string,
): Exclude<PluginCategory, 'All'> {
  const seed = SEED_BY_ID.get(canonicalPluginId(id));
  if (seed) return seed.category;

  const haystack = `${rawCategory ?? ''} ${id} ${name}`.toLowerCase();

  if (/github|gitlab|linear|sentry|developer|code|monitoring|devops/.test(haystack)) {
    return 'Engineering';
  }
  if (/vercel|cloud|infrastructure|hosting|domain|dns|database|supabase/.test(haystack)) {
    return 'Infrastructure';
  }
  if (/gmail|calendar|drive|notion|productivity|file|storage/.test(haystack)) {
    return 'Productivity';
  }
  if (/slack|discord|teams|communication|social/.test(haystack)) {
    return 'Communication';
  }
  if (/hubspot|salesforce|crm|sales/.test(haystack)) {
    return 'Sales & CRM';
  }
  if (/shopify|stripe|commerce|payment|e-commerce/.test(haystack)) {
    return 'Commerce';
  }
  if (/marketing|email/.test(haystack)) {
    return 'Marketing';
  }
  if (/quickbooks|xero|finance|bank/.test(haystack)) {
    return 'Finance';
  }
  if (/airtable|analytics|data|warehouse|snowflake/.test(haystack)) {
    return 'Data & Analytics';
  }
  if (/figma|canva|design|media|image|video/.test(haystack)) {
    return 'Design & Media';
  }
  if (/zendesk|intercom|support|customer support/.test(haystack)) {
    return 'Support';
  }

  return 'Other';
}

export function pluginFromSeed(
  seed: PluginSeed,
  state: Partial<PluginRecord> = {},
): PluginRecord {
  return {
    ...seed,
    connected: false,
    resolved: seed.source !== 'composio',
    available: true,
    ...state,
  };
}

export function pluginFromToolkit(
  toolkit: XrogaConnectToolkit,
  tools: readonly XrogaConnectTool[] = [],
): PluginRecord {
  const id = canonicalPluginId(toolkit.toolkit);
  const seed = SEED_BY_ID.get(id);
  const name = toolkit.name || seed?.name || displayToolkitName(toolkit.toolkit);
  const capabilityCount = tools.filter((tool) => tool.toolkit === toolkit.toolkit).length;

  return {
    id,
    name,
    description:
      seed?.description ||
      toolkit.description ||
      toolkit.statusMessage ||
      'Connect this app so Xroga can use its supported capabilities when you ask.',
    category: seed?.category ?? pluginCategoryFor(undefined, id, name),
    source: seed?.source === 'native' ? 'native' : 'composio',
    popular: seed?.popular,
    developer: seed?.developer,
    searchQuery: seed?.searchQuery,
    toolkitHint: seed?.toolkitHint,
    keywords: seed?.keywords,
    logo: toolkit.logo,
    toolkit: toolkit.toolkit,
    connected: toolkit.connected,
    resolved: true,
    available: true,
    statusMessage: toolkit.statusMessage,
    capabilityCount: capabilityCount > 0 ? capabilityCount : undefined,
    noAuth: toolkit.noAuth,
  };
}

export function mergePluginRecords(...groups: readonly PluginRecord[][]): PluginRecord[] {
  const merged = new Map<string, PluginRecord>();

  for (const group of groups) {
    for (const plugin of group) {
      const id = canonicalPluginId(plugin.id);
      const current = merged.get(id);

      if (!current) {
        merged.set(id, { ...plugin, id });
        continue;
      }

      const nativeWins = current.source === 'native' || plugin.source === 'native';
      const base = current.source === 'native' ? current : plugin.source === 'native' ? plugin : current;
      const extra = base === current ? plugin : current;

      merged.set(id, {
        ...extra,
        ...base,
        id,
        logo: plugin.logo ?? current.logo,
        toolkit: nativeWins ? base.toolkit : plugin.toolkit ?? current.toolkit,
        connected: current.connected || plugin.connected,
        resolved: current.resolved || plugin.resolved,
        available: current.available || plugin.available,
        capabilityCount:
          plugin.capabilityCount ?? current.capabilityCount,
        statusMessage: plugin.statusMessage ?? current.statusMessage,
        popular: Boolean(current.popular || plugin.popular),
        developer: Boolean(current.developer || plugin.developer),
      });
    }
  }

  return [...merged.values()];
}

function searchableText(plugin: PluginRecord): string {
  return [
    plugin.name,
    plugin.id,
    plugin.description,
    plugin.category,
    ...(plugin.keywords ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

export function rankPlugins(
  plugins: readonly PluginRecord[],
  query: string,
): PluginRecord[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [...plugins];

  const tokens = clean.split(/\s+/g).filter(Boolean);

  return plugins
    .map((plugin, index) => {
      const name = plugin.name.toLowerCase();
      const text = searchableText(plugin);
      let score = 0;

      if (name === clean) score += 1000;
      else if (name.startsWith(clean)) score += 700;
      else if (name.includes(clean)) score += 500;

      for (const token of tokens) {
        if (name === token) score += 180;
        else if (name.startsWith(token)) score += 120;
        else if (name.includes(token)) score += 90;

        if (text.includes(token)) score += 30;
      }

      if (plugin.connected) score += 8;
      if (plugin.popular) score += 4;

      return { plugin, score, index };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ plugin }) => plugin);
}

export function seedForPlugin(id: string): PluginSeed | undefined {
  return SEED_BY_ID.get(canonicalPluginId(id));
}
