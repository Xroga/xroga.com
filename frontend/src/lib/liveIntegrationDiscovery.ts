/**
 * Adapt Xroga Connect's source-backed provider catalog into public discovery cards.
 * This does not authorize, connect, execute or expose user-specific account data.
 * The authenticated plugin-detail route is still the place to inspect real access.
 */
import type { XrogaConnectCatalogToolkit } from '@/lib/xrogaConnect';
import type { PublicIntegrationCard, IntegrationCategory } from '@/lib/publicIntegrationsDirectory';

const labels: Record<string, string> = {
  productivity: 'Productivity',
  'project-management': 'Project Management',
  communication: 'Communication',
  'sales-crm': 'CRM',
  support: 'Help Desk & Support',
  'business-operations': 'Business Management',
  'commerce-payments': 'Commerce',
  'marketing-growth': 'Marketing & Growth',
  'social-media': 'Social Media',
  'booking-scheduling': 'Booking & Scheduling',
  'travel-hospitality': 'Travel & Transport',
  'maps-location': 'Maps & Location',
  'web-search-scraping': 'Web Search',
  'weather-utilities': 'Weather',
  'logistics-shipping': 'Logistics',
  'forms-surveys': 'Forms',
  'legal-contracts': 'Legal',
  'real-estate': 'Real Estate',
  'food-restaurants': 'Restaurants',
  'hotels-stays': 'Hotels',
  'finance-accounting': 'Finance',
  'blockchain-crypto': 'Web3',
  'data-analytics': 'Data Analytics',
  databases: 'Databases',
  'developer-tools': 'Developer Tools',
  'deployment-hosting': 'Deployment',
  'cloud-infrastructure': 'Infrastructure & Cloud',
  'ai-automation': 'Artificial Intelligence (AI)',
  'content-files': 'File Storage',
  'design-media': 'Design & Media',
  'hr-recruiting': 'Human Resources',
  'education-research': 'Learning & Education',
  'scientific-research': 'Scientific Research',
  security: 'Security',
  'healthcare-fitness': 'Healthcare',
  entertainment: 'Entertainment',
  other: 'Other',
};

export function normalizeLiveIntegration(item: XrogaConnectCatalogToolkit): PublicIntegrationCard {
  const name = item.name?.trim() || item.slug;
  const group = item.xrogaGroup || 'other';
  return {
    id: item.slug,
    name,
    sourceCategory: group,
    description: item.description?.trim() || 'See the app details, supported actions and authorization options in Xroga.',
    href: '/dashboard/integrations/' + encodeURIComponent(item.slug),
    mode: 'app-guide',
    authHint: item.noAuth ? 'No account auth listed' :
      item.managedAuthSchemes.includes('OAUTH2') || item.authSchemes.some(s => /oauth/i.test(s))
        ? 'OAuth option listed' : 'Review setup requirements',
    capabilityHint: 'Check live provider details',
    searchTerms: [item.slug, name, item.description || '', group, ...item.categories.map(c => c.name)].join(' ').toLowerCase(),
    logoUrl: item.logo || undefined,
    toolsCount: item.toolsCount,
    triggersCount: item.triggersCount,
    fromLiveCatalog: true,
  };
}

export function liveIntegrationCategories(items: readonly PublicIntegrationCard[]): IntegrationCategory[] {
  const groups = [...new Set(items.map(i => i.sourceCategory))].sort((a,b) =>
    (labels[a] || a).localeCompare(labels[b] || b));
  return [
    {id:'all',label:'All apps',group:'primary'},
    ...groups.map(group => ({
      id:'source:' + group,
      label:labels[group] || group.replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase()),
      group: 'primary' as const,
    })),
  ];
}
