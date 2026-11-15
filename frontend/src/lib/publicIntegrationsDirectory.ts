/**
 * Public marketing examples use the exact descriptions from Xroga's own
 * maintained plugin definitions. The old 711-entry *technology* catalog is a
 * different product surface and must not be presented as connectable apps.
 *
 * The full live directory is loaded at runtime from the public, read-only
 * Xroga Connect catalog. If that source cannot be reached, these are a few
 * curated examples, never a fake "all integrations" directory.
 */
import { PLUGIN_DEFINITIONS } from '@/lib/pluginCatalog';
import { getPublicIntegrationLogo } from '@/lib/publicIntegrationLogo';

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

const descriptions = PLUGIN_DEFINITIONS.filter(plugin => plugin.description.trim());
const groups = [...new Set(descriptions.map(plugin => plugin.category))].sort();

export const PUBLIC_INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  { id: 'all', label: 'All apps', group: 'primary' },
  ...groups.map(category => ({
    id: 'source:' + category,
    label: category,
    group: 'primary' as const,
  })),
];

export { matchesPublicIntegrationCategory, PUBLIC_INTEGRATION_FEATURED_IDS } from './integrationDiscoveryFilters';

export const PUBLIC_INTEGRATION_CARDS: PublicIntegrationCard[] = descriptions.map(plugin => ({
  id: plugin.id,
  name: plugin.name,
  sourceCategory: plugin.category,
  description: plugin.description.trim(),
  href: '/dashboard/integrations/' + encodeURIComponent(plugin.id),
  mode: plugin.source === 'native' ? 'native' : 'app-guide',
  authHint: plugin.source === 'native' ? 'Workspace authorization' : 'View connection options',
  capabilityHint: 'See app details in workspace',
  logoUrl: getPublicIntegrationLogo(plugin.id),
  searchTerms: [plugin.name, plugin.id, plugin.category, plugin.description,
    plugin.provider, ...(plugin.keywords ?? [])].filter(Boolean).join(' ').toLowerCase(),
}));

export const PUBLIC_INTEGRATION_COUNT = PUBLIC_INTEGRATION_CARDS.length;
