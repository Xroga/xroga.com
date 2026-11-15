/**
 * Grounded public integration discovery data. A code catalog entry is NOT a live
 * connected app, and a plugin guide does NOT prove the viewer authorized it.
 *
 * Keep the original generated technology catalog and the canonical authenticated
 * /dashboard/integrations/[plugin] pages; this module only prepares public cards.
 */
import { INTEGRATIONS, INTEGRATION_CATEGORIES } from '@/lib/integrations';
import { PLUGIN_DEFINITIONS } from '@/lib/pluginCatalog';
import { isConnectableIntegration } from '@/lib/connectableIntegrations';

export type PublicIntegrationMode = 'native' | 'app-guide' | 'technology';
export type PublicIntegrationCard = {
  id: string;
  name: string;
  sourceCategory: string;
  description: string;
  href: string;
  mode: PublicIntegrationMode;
  authHint: string;
  capabilityHint: string;
  searchTerms: string;
  /** Real logo URL provided by the Xroga Connect catalog when available. */
  logoUrl?: string;
  toolsCount?: number;
  triggersCount?: number;
  fromLiveCatalog?: boolean;
};

export type IntegrationCategory = {
  id: string;
  label: string;
  group: 'primary' | 'additional';
};

const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
const knownPlugins = new Map<string, (typeof PLUGIN_DEFINITIONS)[number]>();
for (const plugin of PLUGIN_DEFINITIONS) {
  knownPlugins.set(normalize(plugin.id), plugin);
  if (!knownPlugins.has(normalize(plugin.name))) knownPlugins.set(normalize(plugin.name), plugin);
}

const sourceCategoryLabels: Record<string, string> = {
  'AI & Media APIs': 'Artificial Intelligence (AI)',
  'Project Management & Collaboration': 'Business Management',
  'E-commerce & Payments': 'Commerce',
  'Social Media & Communication': 'Communication',
  'Monitoring & Analytics': 'Data Analytics',
  'Databases & Data Stores': 'Databases',
  'Developer & Code': 'Developer Tools',
  'Media, Entertainment & Sports': 'Entertainment',
  'File & Storage': 'File Storage',
  'Customer Support & HR': 'Help Desk & Support',
  'Cloud & Infrastructure': 'Infrastructure & Cloud',
  'Education & Learning': 'Learning & Education',
  'Marketing & Email': 'Marketing & Email',
};

const firstCategories = [
  'AI & Media APIs',
  'Project Management & Collaboration',
  'E-commerce & Payments',
  'Social Media & Communication',
  'Monitoring & Analytics',
  'Databases & Data Stores',
  'Developer & Code',
  'Media, Entertainment & Sports',
  'File & Storage',
  'Customer Support & HR',
  'Cloud & Infrastructure',
  'Education & Learning',
  'Marketing & Email',
];

export const PUBLIC_INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  { id: 'all', label: 'All apps', group: 'primary' },
  ...firstCategories.map(category => ({
    id: 'source:' + category,
    label: sourceCategoryLabels[category] || category,
    group: 'primary' as const,
  })),
  { id: 'focus:crm', label: 'CRM', group: 'primary' },
  { id: 'focus:hr', label: 'Human Resources', group: 'primary' },
  { id: 'focus:language', label: 'Language Tools', group: 'primary' },
  ...INTEGRATION_CATEGORIES.filter(category => !firstCategories.includes(category)).map(category => ({
    id: 'source:' + category,
    label: category,
    group: 'additional' as const,
  })),
];

export { matchesPublicIntegrationCategory, PUBLIC_INTEGRATION_FEATURED_IDS } from './integrationDiscoveryFilters';

export const PUBLIC_INTEGRATION_CARDS: PublicIntegrationCard[] = INTEGRATIONS.map(item => {
  const plugin = knownPlugins.get(normalize(item.id)) ?? knownPlugins.get(normalize(item.name));
  const mode: PublicIntegrationMode = plugin?.source === 'native'
    ? 'native'
    : plugin || isConnectableIntegration(item.id)
      ? 'app-guide'
      : 'technology';
  // Only source-backed plugin definitions may advertise action/trigger discovery.
  // Numbers and true provider connection state are loaded inside the authenticated app detail.
  return {
    id: item.id,
    name: item.name,
    sourceCategory: item.category,
    description: plugin?.description || item.description ||
      ('A listed technology for software and workflow projects. Live account capabilities must be verified.'),
    href: '/dashboard/integrations/' + encodeURIComponent(plugin?.id || item.id),
    mode,
    authHint: mode === 'native'
      ? 'Provider authorization'
      : item.oauth
        ? 'OAuth listed in catalog'
        : 'Check access requirements',
    capabilityHint: mode === 'technology'
      ? 'Not verified as an app connector'
      : 'Actions and triggers: inspect app details',
    searchTerms: [item.id, item.name, item.category, item.description, plugin?.description,
      plugin?.category, ...(plugin?.keywords || [])].filter(Boolean).join(' ').toLowerCase(),
  };
});

export const PUBLIC_INTEGRATION_COUNT = PUBLIC_INTEGRATION_CARDS.length;
