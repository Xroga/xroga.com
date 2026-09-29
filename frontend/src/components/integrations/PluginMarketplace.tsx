'use client';

import Link from 'next/link';
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Check,
  ChevronRight,
  Loader2,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

import {
  CustomMcpCreateForm,
  CustomMcpManager,
} from '@/components/integrations/CustomMcpManager';
import { PluginBrandLogo } from '@/components/integrations/PluginBrandLogo';
import { InstalledPluginsShelf } from '@/components/integrations/InstalledPluginsShelf';
import { Dialog } from '@/components/ui/Dialog';
import { PageFullscreenToggle } from '@/components/layout/PageFullscreenFrame';
import { api } from '@/lib/api';
import {
  PLUGIN_DEFINITIONS,
  authSummary,
  canonicalPluginId,
  genericPluginDefinition,
  inferCategory,
  pluginFromCatalog,
  pluginSearchScore,
  type ConnectionState,
  type NativePluginId,
  type PluginCategoryGroupId,
  type PluginView,
  type RuntimePlugin,
} from '@/lib/pluginCatalog';
import {
  clearOAuthResult,
  subscribeOAuthResults,
} from '@/lib/oauthPopupResult';
import {
  xrogaConnect,
  type XrogaConnectCatalogToolkit,
  type XrogaConnectToolkit,
} from '@/lib/xrogaConnect';

type NativeSnapshot = {
  state: ConnectionState;
  accountLabel?: string;
  statusMessage?: string;
};

type ConnectedFilter = 'all' | 'apps' | 'developer' | 'attention';

const BROWSE_PAGE_SIZE = 250;
const SEARCH_PAGE_SIZE = 100;
const SEARCH_PREVIEW_LIMIT = 8;
const CATEGORY_PREVIEW_LIMIT = 6;
const CATEGORY_EXPAND_STEP = 10;
const OTHER_PREVIEW_LIMIT = 8;
const FEATURED_PREVIEW_LIMIT = 6;
const FEATURED_EXPANDED_LIMIT = 18;

const SMALL_BUSINESS_IDS = [
  'shopify',
  'stripe',
  'quickbooks',
  'hubspot',
  'gmail',
  'google-calendar',
  'slack',
  'google-drive',
  'notion',
  'canva',
  'figma',
  'airtable',
  'calendly',
  'cal',
  'xero',
  'mailchimp',
  'activecampaign',
  'square',
  'trello',
  'asana',
  'dropbox',
  'zoom',
];

const SECTION_PINNED_IDS: Record<string, string[]> = {
  'small-business': SMALL_BUSINESS_IDS,
  productivity: ['google-calendar', 'notion', 'gmail', 'google-drive', 'dropbox', 'airtable'],
  'project-management': ['monday', 'asana', 'trello', 'clickup', 'basecamp', 'todoist'],
  communication: ['slack', 'gmail', 'microsoftoutlook', 'zoom', 'discord', 'microsoftteams'],
  'booking-scheduling': ['cal', 'calendly', 'google-calendar', 'acuityscheduling', 'squareappointments', 'savvycal'],
  'sales-crm': ['hubspot', 'salesforce', 'pipedrive', 'close', 'attio', 'zoho'],
  support: ['intercom', 'zendesk', 'freshdesk', 'gorgias', 'helpscout'],
  'business-operations': ['airtable', 'monday', 'notion', 'asana', 'trello', 'odoo'],
  'marketing-growth': ['mailchimp', 'activecampaign', 'klaviyo', 'googleads', 'facebookads', 'semrush'],
  'social-media': ['linkedin', 'instagram', 'twitter', 'tiktok', 'facebookpages', 'youtube'],
  'commerce-payments': ['stripe', 'shopify', 'whop', 'square', 'paypal', 'woocommerce'],
  'finance-accounting': ['quickbooks', 'xero', 'freshbooks', 'plaid', 'stripe', 'wise'],
  'blockchain-crypto': ['blockscout', 'alchemy', 'coinbase', 'etherscan', 'bitquery', 'moralis'],
  'data-analytics': ['posthog', 'mixpanel', 'amplitude', 'tableau', 'powerbi', 'googleanalytics'],
  databases: ['supabase', 'postgresql', 'mongodb', 'neon', 'mysql', 'redis'],
  'maps-location': ['googlemaps', 'mapbox', 'tomtom', 'here', 'radarlabs'],
  'web-search-scraping': ['firecrawl', 'exa', 'apify', 'browsertool', 'scrapingbee', 'brightdata'],
  'developer-tools': ['github', 'linear', 'sentry', 'gitlab', 'postman', 'jira'],
  'deployment-hosting': ['vercel', 'railway', 'render', 'flyio', 'flydotio', 'netlify', 'heroku'],
  'cloud-infrastructure': ['cloudflare', 'aws', 'digitalocean', 'datadog', 'grafana', 'newrelic'],
  'ai-automation': ['openai', 'anthropic', 'gemini', 'perplexityai', 'huggingface'],
  'content-files': ['google-drive', 'dropbox', 'box', 'onedrive', 'notion', 'sharepoint'],
  'design-media': ['canva', 'figma', 'runway', 'higgsfield', 'invideo', 'openart'],
  'forms-surveys': ['typeform', 'jotform', 'surveymonkey', 'googleforms', 'tally'],
  'hr-recruiting': ['greenhouse', 'lever', 'workday', 'bamboohr', 'deel'],
  'logistics-shipping': ['shippo', 'shipstation', 'easypost', 'aftership', 'fedex', 'ups'],
  'legal-contracts': ['docusign', 'pandadoc', 'ironclad', 'hellosign', 'dropboxsign'],
  'real-estate': ['zillow', 'apex27', 'realtor', 'propertybase'],
  'food-restaurants': ['opentable', 'yelp', 'doordash', 'ubereats', 'toast'],
  'hotels-stays': ['bookingcom', 'airbnb', 'agoda', 'expedia', 'hotelscom', 'hostaway'],
  'travel-hospitality': ['skyscanner', 'tripcom', 'turkishairlines', 'flightpoints', 'kiwi', 'rome2rio'],
  'weather-utilities': ['weathermap', 'openweathermap', 'ambientweather', 'weatherapi'],
  security: ['malwarebytes', 'cloudflare', 'snyk', 'privacyhawk', 'radarlite'],
};
type DiscoverySection = {
  id: string;
  title: string;
  description: string;
  categories: string[];
  groups: Exclude<PluginCategoryGroupId, ''>[];
  curatedIds?: string[];
};

const DISCOVERY_SECTIONS: DiscoverySection[] = [
  {
    id: 'small-business',
    title: 'Small Business',
    description: 'A focused set of useful apps for payments, customers, marketing, files, scheduling and teamwork.',
    categories: [],
    groups: [],
    curatedIds: SMALL_BUSINESS_IDS,
  },
  {
    id: 'productivity',
    title: 'Productivity',
    description: 'Calendar, tasks, projects, spreadsheets and workspace tools.',
    categories: ['Productivity'],
    groups: ['productivity'],
  },
  {
    id: 'project-management',
    title: 'Project Management',
    description: 'Projects, tasks, roadmaps, work management and team planning.',
    categories: ['Project Management'],
    groups: ['project-management'],
  },
  {
    id: 'communication',
    title: 'Communication',
    description: 'Email, messaging, calls, meetings and team collaboration.',
    categories: ['Communication'],
    groups: ['communication'],
  },
  {
    id: 'booking-scheduling',
    title: 'Booking & Scheduling',
    description: 'Appointments, booking pages, availability, calendars and reservations.',
    categories: ['Booking & Scheduling'],
    groups: ['booking-scheduling'],
  },
  {
    id: 'sales-crm',
    title: 'Sales & CRM',
    description: 'Leads, contacts, deals, pipelines and customer relationships.',
    categories: ['Sales & CRM'],
    groups: ['sales-crm'],
  },
  {
    id: 'support',
    title: 'Customer Support',
    description: 'Help desks, tickets, customer service and support workflows.',
    categories: ['Customer Support'],
    groups: ['support'],
  },
  {
    id: 'business-operations',
    title: 'Business & Operations',
    description: 'ERP, administration, professional services and operational workflow tools.',
    categories: ['Business & Operations'],
    groups: ['business-operations'],
  },
  {
    id: 'marketing-growth',
    title: 'Marketing & Growth',
    description: 'SEO, ads, campaigns, newsletters, automation and growth tools.',
    categories: ['Marketing & Growth'],
    groups: ['marketing-growth'],
  },
  {
    id: 'social-media',
    title: 'Social Media',
    description: 'Publishing, engagement, analytics and social-network workflows.',
    categories: ['Social Media'],
    groups: ['social-media'],
  },
  {
    id: 'commerce-payments',
    title: 'Commerce & Payments',
    description: 'Payments, stores, orders, checkout, inventory and fulfillment.',
    categories: ['Commerce & Payments'],
    groups: ['commerce-payments'],
  },
  {
    id: 'finance-accounting',
    title: 'Finance & Accounting',
    description: 'Accounting, invoices, banking, expenses, tax and finance tools.',
    categories: ['Finance & Accounting'],
    groups: ['finance-accounting'],
  },
  {
    id: 'blockchain-crypto',
    title: 'Blockchain & Crypto',
    description: 'Blockchain data, wallets, networks and on-chain developer services.',
    categories: ['Blockchain & Crypto'],
    groups: ['blockchain-crypto'],
  },
  {
    id: 'data-analytics',
    title: 'Data & Analytics',
    description: 'Analytics, BI, dashboards, reporting and data platforms.',
    categories: ['Data & Analytics'],
    groups: ['data-analytics'],
  },
  {
    id: 'databases',
    title: 'Databases',
    description: 'SQL, NoSQL, managed databases, data stores and backend data services.',
    categories: ['Databases'],
    groups: ['databases'],
  },
  {
    id: 'maps-location',
    title: 'Maps & Location',
    description: 'Maps, places, geocoding, directions, routing and geospatial data.',
    categories: ['Maps & Location'],
    groups: ['maps-location'],
  },
  {
    id: 'web-search-scraping',
    title: 'Web Search & Scraping',
    description: 'Search the web, crawl sites, extract data and automate browser research.',
    categories: ['Web Search & Scraping'],
    groups: ['web-search-scraping'],
  },
  {
    id: 'developer-tools',
    title: 'Developer Tools',
    description: 'Source control, APIs, observability, testing and engineering tools.',
    categories: ['Developer Tools'],
    groups: ['developer-tools'],
  },
  {
    id: 'deployment-hosting',
    title: 'Deployment & Hosting',
    description: 'Deploy, host and operate web apps, services and production builds.',
    categories: ['Deployment & Hosting'],
    groups: ['deployment-hosting'],
  },
  {
    id: 'cloud-infrastructure',
    title: 'Cloud & Infrastructure',
    description: 'Cloud operations, CDN, DNS, servers, monitoring and infrastructure.',
    categories: ['Cloud & Infrastructure'],
    groups: ['cloud-infrastructure'],
  },
  {
    id: 'ai-automation',
    title: 'AI & Automation',
    description: 'AI models, agents, MCP services, automation and workflow tools.',
    categories: ['AI & Automation'],
    groups: ['ai-automation'],
  },
  {
    id: 'content-files',
    title: 'Content & Files',
    description: 'Documents, notes, storage, transcription and file-management services.',
    categories: ['Content & Files'],
    groups: ['content-files'],
  },
  {
    id: 'design-media',
    title: 'Design & Media',
    description: 'Design, images, video, audio and creative production tools.',
    categories: ['Design & Media'],
    groups: ['design-media'],
  },
  {
    id: 'forms-surveys',
    title: 'Forms & Surveys',
    description: 'Forms, surveys, questionnaires, feedback and structured data collection.',
    categories: ['Forms & Surveys'],
    groups: ['forms-surveys'],
  },
  {
    id: 'hr-recruiting',
    title: 'HR & Recruiting',
    description: 'Hiring, recruiting, people operations and employee systems.',
    categories: ['HR & Recruiting'],
    groups: ['hr-recruiting'],
  },
  {
    id: 'logistics-shipping',
    title: 'Logistics & Shipping',
    description: 'Shipping, carriers, delivery, tracking, fleet and logistics operations.',
    categories: ['Logistics & Shipping'],
    groups: ['logistics-shipping'],
  },
  {
    id: 'legal-contracts',
    title: 'Legal & Contracts',
    description: 'Contracts, e-signatures, legal workflows and document approvals.',
    categories: ['Legal & Contracts'],
    groups: ['legal-contracts'],
  },
  {
    id: 'real-estate',
    title: 'Real Estate',
    description: 'Properties, listings, real-estate operations and related services.',
    categories: ['Real Estate'],
    groups: ['real-estate'],
  },
  {
    id: 'food-restaurants',
    title: 'Food & Restaurants',
    description: 'Restaurants, dining, menus, food services and delivery workflows.',
    categories: ['Food & Restaurants'],
    groups: ['food-restaurants'],
  },
  {
    id: 'hotels-stays',
    title: 'Hotels & Stays',
    description: 'Hotels, lodging, accommodation, vacation rentals and stay management.',
    categories: ['Hotels & Stays'],
    groups: ['hotels-stays'],
  },
  {
    id: 'travel-hospitality',
    title: 'Travel & Transport',
    description: 'Flights, airlines, trips, transport and travel planning services.',
    categories: ['Travel & Transport'],
    groups: ['travel-hospitality'],
  },
  {
    id: 'weather-utilities',
    title: 'Weather & Utilities',
    description: 'Weather, forecasts, climate and other utility data services.',
    categories: ['Weather & Utilities'],
    groups: ['weather-utilities'],
  },
  {
    id: 'security',
    title: 'Security',
    description: 'Security, identity, privacy, compliance and threat-analysis tools.',
    categories: ['Security'],
    groups: ['security'],
  },
  {
    id: 'education-research',
    title: 'Education & Research',
    description: 'Learning, courses, academic research, literature and knowledge tools.',
    categories: ['Education & Research'],
    groups: ['education-research'],
  },
  {
    id: 'scientific-research',
    title: 'Scientific Research',
    description: 'Scientific literature, biology, chemistry, genomics and laboratory research.',
    categories: ['Scientific Research'],
    groups: ['scientific-research'],
  },
  {
    id: 'healthcare-fitness',
    title: 'Healthcare & Fitness',
    description: 'Health, fitness, wellness, nutrition and medical-data tools.',
    categories: ['Healthcare & Fitness'],
    groups: ['healthcare-fitness'],
  },
  {
    id: 'entertainment',
    title: 'Entertainment',
    description: 'Music, media, games, sports and entertainment services.',
    categories: ['Entertainment'],
    groups: ['entertainment'],
  },
  {
    id: 'other',
    title: 'Other',
    description: 'Supported Xroga Apps that do not fit the focused categories above.',
    categories: ['Other'],
    groups: ['other'],
  },
];
function viewFrom(value: string | null): PluginView {
  if (value === 'connected' || value === 'developer' || value === 'custom') return value;
  return 'discover';
}

function detailHref(plugin: RuntimePlugin): string {
  return `/dashboard/integrations/${encodeURIComponent(plugin.toolkit || plugin.id)}`;
}

function PluginCard({
  plugin,
  connecting,
  onConnect,
}: {
  plugin: RuntimePlugin;
  connecting: boolean;
  onConnect: (plugin: RuntimePlugin) => void;
}) {
  const checking = plugin.connectionState === 'checking';
  const needsAttention =
    plugin.connectionState === 'needs_attention' || plugin.connectionState === 'error';

  return (
    <article className="group flex min-h-[166px] flex-col rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-subtle motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={detailHref(plugin)}
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          aria-label={`View ${plugin.name} Plugin details`}
        >
          <PluginBrandLogo
            id={plugin.id}
            name={plugin.name}
            toolkit={plugin.toolkit}
            logo={plugin.logo}
            fallbackLogo={plugin.logoFallback}
          />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {plugin.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
              {plugin.category}
            </p>
          </div>
        </Link>

        {plugin.connected || plugin.noAuth ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
            <Check className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
            {plugin.noAuth ? 'Ready' : 'Connected'}
          </span>
        ) : needsAttention ? (
          <Link
            href={detailHref(plugin)}
            className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)]"
          >
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Review
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onConnect(plugin)}
            disabled={connecting || checking}
            aria-label={`Connect ${plugin.name}`}
            className="xv-plugin-connect-btn inline-flex min-h-9 shrink-0 items-center gap-1.5 px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {connecting || checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {checking ? 'Checking' : connecting ? 'Connecting' : 'Connect'}
          </button>
        )}
      </div>

      <Link
        href={detailHref(plugin)}
        className="mt-3 line-clamp-2 rounded-md text-sm leading-5 text-[var(--text-secondary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        {plugin.description}
      </Link>

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0 space-y-0.5">
          {plugin.accountLabel ? (
            <p className="truncate text-[11px] font-medium text-[var(--text-primary)]">
              {plugin.accountLabel}
            </p>
          ) : null}
          <p className="truncate text-[11px] text-[var(--text-muted)]">
            {plugin.toolsCount !== undefined
              ? `${plugin.toolsCount.toLocaleString()} actions`
              : plugin.capabilityCount
                ? `${plugin.capabilityCount.toLocaleString()} actions`
                : plugin.source === 'native'
                  ? 'Xroga native'
                  : authSummary(plugin)}
            {plugin.triggersCount ? ` · ${plugin.triggersCount.toLocaleString()} triggers` : ''}
          </p>
          {plugin.source === 'composio' && !plugin.noAuth ? (
            <p className="truncate text-[10px] text-[var(--text-muted)]">{authSummary(plugin)}</p>
          ) : null}
        </div>

        <Link
          href={detailHref(plugin)}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[var(--accent)] hover:underline"
        >
          {plugin.connected ? 'Manage' : 'View details'}
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function PluginListRow({
  plugin,
  connecting,
  onConnect,
}: {
  plugin: RuntimePlugin;
  connecting: boolean;
  onConnect: (plugin: RuntimePlugin) => void;
}) {
  const checking = plugin.connectionState === 'checking';

  return (
    <div className="group flex min-h-[64px] items-center gap-3 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0">
      <Link
        href={detailHref(plugin)}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <PluginBrandLogo
          id={plugin.id}
          name={plugin.name}
          toolkit={plugin.toolkit}
          logo={plugin.logo}
          fallbackLogo={plugin.logoFallback}
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
            {plugin.name}
          </p>
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-[var(--text-secondary)]">
            {plugin.description}
          </p>
        </div>
      </Link>

      {plugin.connected || plugin.noAuth ? (
        <Link
          href={detailHref(plugin)}
          aria-label={`Manage ${plugin.name}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] transition hover:bg-[var(--surface-inset)]"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => onConnect(plugin)}
          disabled={connecting || checking}
          aria-label={`Connect ${plugin.name}`}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-[var(--text-primary)] transition hover:bg-[var(--surface-inset)] disabled:opacity-50"
        >
          {connecting || checking ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <span aria-hidden="true">+</span>
          )}
        </button>
      )}
    </div>
  );
}

function PluginListGrid({
  plugins,
  connectingId,
  onConnect,
}: {
  plugins: RuntimePlugin[];
  connectingId: string | null;
  onConnect: (plugin: RuntimePlugin) => void;
}) {
  return (
    <div className="grid gap-x-10 lg:grid-cols-2">
      {plugins.map((plugin) => (
        <PluginListRow
          key={plugin.toolkit || plugin.id}
          plugin={plugin}
          connecting={connectingId === (plugin.toolkit || plugin.id)}
          onConnect={onConnect}
        />
      ))}
    </div>
  );
}


function ConnectedPluginRow({
  plugin,
}: {
  plugin: RuntimePlugin;
}) {
  const needsAttention =
    plugin.connectionState === 'needs_attention' ||
    plugin.connectionState === 'error';

  return (
    <Link
      href={detailHref(plugin)}
      className="group flex min-h-[76px] items-center gap-4 px-4 py-3 transition hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:px-5"
      aria-label={`Manage ${plugin.name}`}
    >
      <PluginBrandLogo
        id={plugin.id}
        name={plugin.name}
        toolkit={plugin.toolkit}
        logo={plugin.logo}
        fallbackLogo={plugin.logoFallback}
        size="card"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {plugin.name}
          </p>
          <span className="text-[10px] font-medium text-[var(--text-muted)]">
            {plugin.category}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-[var(--text-secondary)]">
          {plugin.description}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
          {plugin.accountLabel ? (
            <span className="font-medium text-[var(--text-primary)]">
              {plugin.accountLabel}
            </span>
          ) : null}
          {plugin.toolsCount !== undefined ? (
            <span>{plugin.toolsCount.toLocaleString()} actions</span>
          ) : plugin.capabilityCount ? (
            <span>{plugin.capabilityCount.toLocaleString()} actions</span>
          ) : null}
          {plugin.triggersCount ? (
            <span>{plugin.triggersCount.toLocaleString()} triggers</span>
          ) : null}
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <span
          className={
            needsAttention
              ? 'inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/8 px-2.5 py-1 text-[10px] font-semibold text-amber-600'
              : 'inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)]'
          }
        >
          {needsAttention ? (
            <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Check className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
          )}
          {needsAttention ? 'Reconnect' : plugin.noAuth ? 'Ready' : 'Connected'}
        </span>
        <span className="text-xs font-semibold text-[var(--accent)]">
          Manage
        </span>
        <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
      </div>

      <ChevronRight
        className="h-4 w-4 shrink-0 text-[var(--text-muted)] sm:hidden"
        aria-hidden="true"
      />
    </Link>
  );
}

function ConnectedPluginList({
  plugins,
}: {
  plugins: RuntimePlugin[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] divide-y divide-[var(--border-subtle)]">
      {plugins.map((plugin) => (
        <ConnectedPluginRow
          key={plugin.toolkit || plugin.id}
          plugin={plugin}
        />
      ))}
    </div>
  );
}

function PluginGrid({
  plugins,
  connectingId,
  onConnect,
}: {
  plugins: RuntimePlugin[];
  connectingId: string | null;
  onConnect: (plugin: RuntimePlugin) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard
          key={plugin.toolkit || plugin.id}
          plugin={plugin}
          connecting={connectingId === (plugin.toolkit || plugin.id)}
          onConnect={onConnect}
        />
      ))}
    </div>
  );
}

function FeaturedPluginSection({
  id,
  title,
  hint,
  plugins,
  expanded,
  loading,
  connectingId,
  onConnect,
  onToggle,
}: {
  id: 'popular' | 'explore';
  title: string;
  hint: string;
  plugins: RuntimePlugin[];
  expanded: boolean;
  loading: boolean;
  connectingId: string | null;
  onConnect: (plugin: RuntimePlugin) => void;
  onToggle: () => void;
}) {
  const visible = expanded
    ? plugins.slice(0, FEATURED_EXPANDED_LIMIT)
    : plugins.slice(0, FEATURED_PREVIEW_LIMIT);

  return (
    <section className="border-b border-[var(--border-subtle)] pb-7 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${id}-plugin-list`}
        className="group mb-2 flex w-full items-center justify-between gap-4 rounded-md text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <span className="truncate text-[10px] text-[var(--text-muted)]">{hint}</span>
        </div>
        {plugins.length ? (
          <span className="shrink-0 text-[11px] font-medium text-[var(--text-muted)]">
            {expanded
              ? `${Math.min(plugins.length, FEATURED_EXPANDED_LIMIT).toLocaleString()} apps`
              : 'See all'}
          </span>
        ) : null}
      </button>

      <div id={`${id}-plugin-list`}>
        {loading && !visible.length ? (
          <div className="grid gap-x-10 lg:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-[64px] animate-pulse border-b border-[var(--border-subtle)] bg-[var(--surface-inset)]/35"
              />
            ))}
          </div>
        ) : visible.length ? (
          <PluginListGrid
            plugins={visible}
            connectingId={connectingId}
            onConnect={onConnect}
          />
        ) : (
          <div className="rounded-token-md border border-dashed border-[var(--border-subtle)] px-4 py-4 text-xs leading-5 text-[var(--text-secondary)]">
            No apps are available in this section right now.
          </div>
        )}
      </div>
    </section>
  );
}

function CategoryPluginSection({
  section,
  plugins,
  expanded,
  visibleCount,
  loading,
  error,
  connectingId,
  onConnect,
  onToggle,
  onShowMore,
}: {
  section: DiscoverySection;
  plugins: RuntimePlugin[];
  expanded: boolean;
  visibleCount: number;
  loading: boolean;
  error?: string;
  connectingId: string | null;
  onConnect: (plugin: RuntimePlugin) => void;
  onToggle: () => void;
  onShowMore: () => void;
}) {
  const previewLimit =
    section.id === 'other'
      ? OTHER_PREVIEW_LIMIT
      : CATEGORY_PREVIEW_LIMIT;
  const visible = expanded
    ? plugins.slice(0, Math.max(visibleCount, previewLimit + CATEGORY_EXPAND_STEP))
    : plugins.slice(0, previewLimit);
  const hasMore = expanded && visible.length < plugins.length;

  return (
    <section className="border-b border-[var(--border-subtle)] pb-7 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`category-${section.id}-plugins`}
        className="group mb-2 flex w-full items-start justify-between gap-4 rounded-md text-left focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {section.title}
            </h3>
            <ChevronRight
              className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </div>
          {expanded ? (
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
              {section.description}
            </p>
          ) : null}
        </div>
        {plugins.length ? (
          <span className="shrink-0 pt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
            {expanded ? 'Close' : 'See all'}
          </span>
        ) : null}
      </button>

      <div id={`category-${section.id}-plugins`}>
        {loading && !visible.length ? (
          <div className="grid gap-x-10 lg:grid-cols-2" aria-label={`Loading ${section.title}`}>
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-[72px] animate-pulse border-b border-[var(--border-subtle)] bg-[var(--surface-inset)]/35"
              />
            ))}
          </div>
        ) : visible.length ? (
          <>
            <PluginListGrid
              plugins={visible}
              connectingId={connectingId}
              onConnect={onConnect}
            />

            {!expanded && plugins.length > previewLimit ? (
              <button
                type="button"
                onClick={onToggle}
                className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[11px] font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                aria-label={`See more ${section.title} Plugins`}
              >
                <span className="flex -space-x-1">
                  {plugins.slice(previewLimit, previewLimit + 3).map((plugin) => (
                    <PluginBrandLogo
                      key={plugin.toolkit || plugin.id}
                      id={plugin.id}
                      name={plugin.name}
                      toolkit={plugin.toolkit}
                      logo={plugin.logo}
                      fallbackLogo={plugin.logoFallback}
                      size="micro"
                    />
                  ))}
                </span>
                <span className="truncate">
                  See {plugins
                    .slice(previewLimit, previewLimit + 2)
                    .map((plugin) => plugin.name)
                    .join(', ')}
                  {plugins.length > previewLimit + 2 ? ', and more' : ''}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              </button>
            ) : null}

            {hasMore ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onShowMore}
                  className="xv-plugin-show-more inline-flex min-h-10 items-center justify-center px-5 text-xs font-semibold"
                >
                  Show 10 more
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-token-md border border-dashed border-[var(--border-subtle)] px-4 py-4 text-xs leading-5 text-[var(--text-secondary)]">
            {error
              ? error
              : 'No supported apps are available in this category right now.'}
          </div>
        )}
      </div>
    </section>
  );
}

function mergePlugins(
  plugins: RuntimePlugin[],
): RuntimePlugin[] {
  const byKey = new Map<string, RuntimePlugin>();

  for (const plugin of plugins) {
    const key = plugin.toolkit || plugin.id;
    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, plugin);
      continue;
    }

    byKey.set(key, {
      ...current,
      ...plugin,
      connected: current.connected || plugin.connected,
      logo: plugin.logo || current.logo,
      toolsCount: plugin.toolsCount ?? current.toolsCount,
      triggersCount: plugin.triggersCount ?? current.triggersCount,
    });
  }

  return [...byKey.values()];
}

export function PluginMarketplace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [view, setViewState] = useState<PluginView>(() => viewFrom(searchParams.get('view')));
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim());
  const liveQuery = query.trim();
  const [searchVisibleCount, setSearchVisibleCount] = useState(SEARCH_PREVIEW_LIMIT);
  const [catalogItems, setCatalogItems] = useState<XrogaConnectCatalogToolkit[]>([]);
  const [globalCatalogTotal, setGlobalCatalogTotal] = useState<number | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogHydrated, setCatalogHydrated] = useState(false);

  const [searchCatalogItems, setSearchCatalogItems] = useState<XrogaConnectCatalogToolkit[]>([]);
  const [semanticCatalogItems, setSemanticCatalogItems] = useState<XrogaConnectCatalogToolkit[]>([]);
  const [semanticToolkitSlugs, setSemanticToolkitSlugs] = useState<Set<string>>(new Set());
  const [searchLoading, setSearchLoading] = useState(false);
  const [semanticError, setSemanticError] = useState(false);

  const [nativeState, setNativeState] = useState<Record<NativePluginId, NativeSnapshot>>({
    github: { state: 'checking' },
    vercel: { state: 'checking' },
    supabase: { state: 'checking' },
  });
  const [composioConfigured, setComposioConfigured] = useState<boolean | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [toolkitConnections, setToolkitConnections] = useState<Record<string, XrogaConnectToolkit>>({});
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedOverrides, setConnectedOverrides] = useState<Record<string, boolean>>({});
  const [connectedQuery, setConnectedQuery] = useState('');
  const [connectedFilter, setConnectedFilter] = useState<ConnectedFilter>('all');
  const requestSeq = useRef(0);
  const addPluginMenuRef = useRef<HTMLDivElement | null>(null);
  const [addPluginOpen, setAddPluginOpen] = useState(false);
  const [addPluginMode, setAddPluginMode] = useState<'menu' | 'mcp'>('menu');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedFeatured, setExpandedFeatured] = useState<Set<'popular' | 'explore'>>(
    new Set(),
  );
  const [sectionCatalog, setSectionCatalog] = useState<Record<string, XrogaConnectCatalogToolkit[]>>({});
  const [sectionLoading, setSectionLoading] = useState<Record<string, boolean>>({});
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const [sectionVisibleCounts, setSectionVisibleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!addPluginOpen || addPluginMode !== 'menu') return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !addPluginMenuRef.current?.contains(target)) {
        setAddPluginOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAddPluginOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [addPluginOpen, addPluginMode]);

  const setView = (next: PluginView) => {
    setViewState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'discover') params.delete('view');
    else params.set('view', next);
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  };

  const refreshNativeStatus = () => {
    void Promise.allSettled([
      api.github.status(),
      api.vercel.status(),
      api.supabase.status(),
    ]).then((results) => {
      const github =
        results[0].status === 'fulfilled'
          ? {
              state: results[0].value.connected ? ('connected' as const) : ('disconnected' as const),
              accountLabel:
                results[0].value.connected && results[0].value.username
                  ? `@${results[0].value.username}`
                  : undefined,
            }
          : { state: 'error' as const, statusMessage: 'GitHub status unavailable' };

      const vercel =
        results[1].status === 'fulfilled'
          ? {
              state: results[1].value.connected
                ? results[1].value.tokenValid === false
                  ? ('needs_attention' as const)
                  : ('connected' as const)
                : ('disconnected' as const),
              accountLabel: results[1].value.username || undefined,
              statusMessage: results[1].value.warning || results[1].value.error,
            }
          : { state: 'error' as const, statusMessage: 'Vercel status unavailable' };

      const supabase =
        results[2].status === 'fulfilled'
          ? {
              state: results[2].value.connected ? ('connected' as const) : ('disconnected' as const),
              statusMessage: results[2].value.message,
            }
          : { state: 'error' as const, statusMessage: 'Supabase status unavailable' };

      setNativeState({ github, vercel, supabase });
    });
  };

  const absorbConnections = (toolkits: XrogaConnectToolkit[]) => {
    if (!toolkits.length) return;

    setToolkitConnections((current) => {
      const next = { ...current };
      for (const toolkit of toolkits) {
        next[toolkit.toolkit] = toolkit;
      }
      return next;
    });
  };

  useEffect(() => {
    refreshNativeStatus();

    let active = true;

    void xrogaConnect
      .status()
      .then(async (availability) => {
        if (!active) return;
        setComposioConfigured(availability.configured);

        if (!availability.configured) {
          setCatalogLoading(false);
          setCatalogHydrated(true);
          return;
        }

        const [catalogResult, sessionResult] = await Promise.allSettled([
          xrogaConnect.catalog({
            sortBy: 'usage',
            limit: BROWSE_PAGE_SIZE,
          }),
          xrogaConnect.session(),
        ]);

        if (!active) return;

        if (catalogResult.status === 'fulfilled') {
          setCatalogItems(catalogResult.value.items);
          setGlobalCatalogTotal(catalogResult.value.totalItems);

          // Show the first usage-ranked page immediately, then quietly hydrate
          // the remaining app metadata so every category (including Other)
          // has a useful preview without rendering 1,500+ rows at once.
          void (async () => {
            let cursor = catalogResult.value.nextCursor;
            let pages = 1;
            const hydrated = [...catalogResult.value.items];

            while (active && cursor && pages < 20) {
              try {
                const page = await xrogaConnect.catalog({
                  sortBy: 'usage',
                  limit: BROWSE_PAGE_SIZE,
                  cursor,
                });

                for (const item of page.items) {
                  if (!hydrated.some((existing) => existing.slug === item.slug)) {
                    hydrated.push(item);
                  }
                }

                if (active) setCatalogItems([...hydrated]);
                cursor = page.nextCursor;
                pages += 1;
              } catch {
                // Keep the already-loaded catalogue usable if background hydration fails.
                break;
              }
            }

            if (active) setCatalogHydrated(true);
          })();
        }
        setCatalogLoading(false);
        if (catalogResult.status !== 'fulfilled') setCatalogHydrated(true);

        if (sessionResult.status === 'fulfilled') {
          setSessionId(sessionResult.value.sessionId);
          try {
            const connected = await xrogaConnect.toolkits(sessionResult.value.sessionId, {
              connectedOnly: true,
            });
            if (active) absorbConnections(connected.toolkits ?? []);
          } catch {
            // Catalogue browsing remains available when connection status lookup fails.
          }
        }
      })
      .catch(() => {
        if (!active) return;
        setComposioConfigured(false);
        setCatalogLoading(false);
        setCatalogHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const github = params.get('github');
    const vercel = params.get('vercel');
    const supabase = params.get('supabase');
    const composio = params.get('composio');
    const pluginConnection = params.get('plugin');
    const message = params.get('message');

    if (github === 'connected') toast.success('GitHub connected');
    else if (github === 'error' || github === 'missing_code') {
      toast.error(message || 'GitHub authorization failed');
    }

    if (vercel === 'connected') toast.success('Vercel connected');
    else if (vercel === 'error' || vercel === 'missing_code') {
      toast.error(message || 'Vercel authorization failed');
    }

    if (supabase === 'connected') toast.success('Supabase authorized');
    else if (supabase === 'error' || supabase === 'missing_code') {
      toast.error(message || 'Supabase authorization failed');
    }

    if (pluginConnection === 'connected' || composio === 'connected') {
      toast.success('Plugin connected to Xroga');
    } else if (pluginConnection === 'error' || composio === 'error') {
      toast.error(message || 'Plugin connection failed');
    }

    if (github || vercel || supabase || composio || pluginConnection) {
      refreshNativeStatus();

      const returnPath = sessionStorage.getItem('xroga-plugin-return');
      if (returnPath) {
        sessionStorage.removeItem('xroga-plugin-return');
        router.replace(returnPath);
        return;
      }

      const url = new URL(window.location.href);
      ['github', 'vercel', 'supabase', 'composio', 'plugin', 'message', 'username', 'pick'].forEach((key) =>
        url.searchParams.delete(key),
      );
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [router]);

  useEffect(
    () =>
      subscribeOAuthResults((payload) => {
        if (payload.type === 'xroga-composio-connected') {
          if (connectingId) {
            setConnectedOverrides((current) => ({
              ...current,
              [connectingId]: true,
            }));
          }
          setConnectingId(null);
          toast.success('Plugin connected to Xroga');

          if (sessionId) {
            void xrogaConnect
              .toolkits(sessionId, { connectedOnly: true })
              .then((result) => absorbConnections(result.toolkits ?? []))
              .catch(() => undefined);
          }
        }

        if (payload.type === 'xroga-composio-error') {
          setConnectingId(null);
          toast.error(payload.message || 'Plugin connection failed');
        }
      }),
    [connectingId, sessionId],
  );

  useEffect(() => {
    const clean = deferredQuery;

    if (!clean) {
      setSearchCatalogItems([]);
      setSemanticCatalogItems([]);
      setSemanticToolkitSlugs(new Set());
      setSemanticError(false);
      setSearchLoading(false);
      return;
    }

    const seq = ++requestSeq.current;
    const timer = window.setTimeout(() => {
      if (clean.length < 2 || composioConfigured !== true) return;

      setSearchLoading(true);
      setSemanticError(false);

      void Promise.allSettled([
        xrogaConnect.catalog({
          search: clean,
          sortBy: 'usage',
          limit: SEARCH_PAGE_SIZE,
        }),
        xrogaConnect.search(clean, sessionId ?? undefined),
      ]).then(async ([catalogResult, semanticResult]) => {
        if (requestSeq.current !== seq) return;

        if (catalogResult.status === 'fulfilled') {
          setSearchCatalogItems(catalogResult.value.items);
        } else {
          setSearchCatalogItems([]);
        }

        if (semanticResult.status === 'fulfilled') {
          setSessionId(semanticResult.value.sessionId);
          absorbConnections(semanticResult.value.toolkits ?? []);

          const slugs = [
            ...new Set([
              ...(semanticResult.value.toolkits ?? []).map((item) => item.toolkit),
              ...(semanticResult.value.tools ?? []).map((item) => item.toolkit),
            ]),
          ].slice(0, 10);

          setSemanticToolkitSlugs(
            new Set(slugs.map((slug) => slug.toLowerCase())),
          );

          const exactCatalogSlugs = new Set(
            catalogResult.status === 'fulfilled'
              ? catalogResult.value.items.map((item) => item.slug)
              : [],
          );

          const missing = slugs.filter((slug) => !exactCatalogSlugs.has(slug));

          if (missing.length) {
            const metadata = await Promise.allSettled(
              missing.map((slug) => xrogaConnect.catalogToolkit(slug)),
            );

            if (requestSeq.current === seq) {
              setSemanticCatalogItems(
                metadata
                  .filter(
                    (
                      item,
                    ): item is PromiseFulfilledResult<{
                      ok: boolean;
                      toolkit: XrogaConnectCatalogToolkit;
                    }> => item.status === 'fulfilled',
                  )
                  .map((item) => item.value.toolkit),
              );
            }
          } else {
            setSemanticCatalogItems([]);
          }
        } else {
          setSemanticError(true);
          setSemanticToolkitSlugs(new Set());
          setSemanticCatalogItems([]);
        }

        if (requestSeq.current === seq) setSearchLoading(false);
      });
    }, 320);

    return () => window.clearTimeout(timer);
  }, [deferredQuery, composioConfigured, sessionId]);

  const connectionFor = (toolkit: string | undefined) =>
    toolkit ? toolkitConnections[toolkit] : undefined;

  const nativePlugins = useMemo<RuntimePlugin[]>(() => {
    return PLUGIN_DEFINITIONS
      .filter((plugin) => plugin.source === 'native')
      .map((plugin) => {
        const native = nativeState[plugin.id as NativePluginId];
        const catalog = catalogItems.find(
          (item) => canonicalPluginId(item.slug) === plugin.id,
        );

        const enriched = catalog
          ? pluginFromCatalog(catalog)
          : ({
              ...plugin,
              connected: false,
            } as RuntimePlugin);

        return {
          ...enriched,
          ...plugin,
          toolkit: catalog?.slug,
          logo: catalog?.logo || enriched.logo,
          logoFallback: enriched.logoFallback,
          toolsCount: catalog?.toolsCount,
          triggersCount: catalog?.triggersCount,
          authSchemes: catalog?.authSchemes,
          managedAuthSchemes: catalog?.managedAuthSchemes,
          categories: catalog?.categories,
          version: catalog?.version,
          appUrl: catalog?.appUrl,
          connected: native.state === 'connected',
          connectionState: native.state,
          accountLabel: native.accountLabel,
          statusMessage: native.statusMessage,
        };
      });
  }, [catalogItems, nativeState]);

  const runtimeFromCatalog = (
    item: XrogaConnectCatalogToolkit,
  ): RuntimePlugin => {
    const connection = connectionFor(item.slug);
    const canonical = canonicalPluginId(item.slug);
    const overrideConnected =
      connectedOverrides[item.slug] || connectedOverrides[canonical];

    return pluginFromCatalog(item, {
      connected: Boolean(connection?.connected || overrideConnected),
      accountLabel: connection?.connected ? connection.statusMessage : undefined,
      statusMessage: connection?.statusMessage,
    });
  };

  const browsePlugins = useMemo(() => {
    const nativeIds = new Set(nativePlugins.map((plugin) => plugin.id));
    const dynamic = catalogItems
      .map(runtimeFromCatalog)
      .filter((plugin) => !nativeIds.has(plugin.id));

    return mergePlugins([...nativePlugins, ...dynamic]);
    // runtimeFromCatalog intentionally reads the latest connection map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogItems, nativePlugins, toolkitConnections, connectedOverrides]);

  const connectedLongTail = useMemo<RuntimePlugin[]>(() => {
    const existingToolkits = new Set(
      browsePlugins.map((plugin) => plugin.toolkit).filter(Boolean),
    );

    const nativeIds = new Set(nativePlugins.map((plugin) => plugin.id));

    return Object.values(toolkitConnections)
      .filter(
        (item) =>
          item.connected &&
          !existingToolkits.has(item.toolkit) &&
          !nativeIds.has(canonicalPluginId(item.toolkit)),
      )
      .map((item) => {
        const generic = genericPluginDefinition(item.toolkit);
        return {
          ...generic,
          name: item.name || generic.name,
          description:
            item.description ||
            'Connected to Xroga. Open the Plugin to inspect its live capabilities.',
          category: inferCategory(item.name || generic.name, item.description),
          toolkit: item.toolkit,
          logo: item.logo,
          connected: true,
          noAuth: item.noAuth,
          accountLabel: item.statusMessage,
          statusMessage: item.statusMessage,
        };
      });
  }, [browsePlugins, toolkitConnections, nativePlugins]);

  const allPlugins = useMemo(
    () => mergePlugins([...browsePlugins, ...connectedLongTail]),
    [browsePlugins, connectedLongTail],
  );

  const searchPlugins = useMemo(() => {
    const clean = liveQuery;
    if (!clean) return [];

    const nativeIds = new Set(nativePlugins.map((plugin) => plugin.id));
    const dynamicSearchPlugins = searchCatalogItems
      .map(runtimeFromCatalog)
      .filter((plugin) => !nativeIds.has(plugin.id));
    const dynamicSemanticPlugins = semanticCatalogItems
      .map(runtimeFromCatalog)
      .filter((plugin) => !nativeIds.has(plugin.id));

    // Keep the already-hydrated full catalogue in the candidate set while the
    // debounced server search refines the result. This makes typing immediate
    // and prevents a sparse remote response from collapsing to one app.
    const source = mergePlugins([
      ...allPlugins,
      ...nativePlugins,
      ...dynamicSearchPlugins,
      ...dynamicSemanticPlugins,
    ]);

    const semantic = semanticToolkitSlugs;

    return source
      .map((plugin) => ({
        plugin,
        score: pluginSearchScore(plugin, clean, semantic),
      }))
      .filter(({ score, plugin }) => {
        if (score > 0) return true;

        const haystack = [
          plugin.name,
          plugin.description,
          plugin.category,
          ...(plugin.keywords ?? []),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(clean.toLowerCase());
      })
      .sort((a, b) => b.score - a.score || a.plugin.name.localeCompare(b.plugin.name))
      .map(({ plugin }) => plugin);
    // runtimeFromCatalog intentionally reads latest connection state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    liveQuery,
    allPlugins,
    nativePlugins,
    searchCatalogItems,
    semanticCatalogItems,
    semanticToolkitSlugs,
    toolkitConnections,
    connectedOverrides,
  ]);

  const connectedPlugins = useMemo(
    () =>
      allPlugins.filter(
        (plugin) =>
          plugin.connected ||
          plugin.connectionState === 'needs_attention',
      ),
    [allPlugins],
  );

  const filteredConnected = useMemo(() => {
    const clean = connectedQuery.trim().toLowerCase();

    return connectedPlugins.filter((plugin) => {
      if (connectedFilter === 'apps' && plugin.developer) return false;
      if (connectedFilter === 'developer' && !plugin.developer) return false;
      if (
        connectedFilter === 'attention' &&
        plugin.connectionState !== 'needs_attention' &&
        plugin.connectionState !== 'error'
      ) {
        return false;
      }

      if (!clean) return true;

      return [
        plugin.name,
        plugin.category,
        plugin.accountLabel,
        plugin.statusMessage,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(clean);
    });
  }, [connectedPlugins, connectedFilter, connectedQuery]);

  const popularPlugins = useMemo(() => {
    const explicitlyPopular = new Set(
      PLUGIN_DEFINITIONS.filter((plugin) => plugin.popular).map((plugin) => plugin.id),
    );
    const curated = browsePlugins.filter((plugin) => explicitlyPopular.has(plugin.id));
    const rest = browsePlugins.filter((plugin) => !explicitlyPopular.has(plugin.id));
    return mergePlugins([...curated, ...rest]).slice(0, FEATURED_EXPANDED_LIMIT);
  }, [browsePlugins]);

  const explorePlugins = useMemo(() => {
    const popularKeys = new Set(
      popularPlugins.map((plugin) => plugin.toolkit || plugin.id),
    );

    return browsePlugins
      .filter((plugin) => !popularKeys.has(plugin.toolkit || plugin.id))
      .slice(0, FEATURED_EXPANDED_LIMIT);
  }, [browsePlugins, popularPlugins]);

  const developerPlugins = useMemo(
    () =>
      allPlugins.filter(
        (plugin) =>
          plugin.developer ||
          plugin.category === 'Developer Tools' ||
          plugin.category === 'Deployment & Hosting' ||
          plugin.category === 'Cloud & Infrastructure' ||
          plugin.category === 'Databases' ||
          plugin.categories?.some((category) =>
            /developer|engineering|devops|cloud|infrastructure|database|server monitoring/i.test(category.name),
          ),
      ),
    [allPlugins],
  );

  async function loadDiscoverySection(section: DiscoverySection) {
    if (sectionLoading[section.id] || sectionCatalog[section.id]) return;

    setSectionLoading((current) => ({ ...current, [section.id]: true }));
    setSectionErrors((current) => {
      const next = { ...current };
      delete next[section.id];
      return next;
    });

    try {
      const collected: XrogaConnectCatalogToolkit[] = [];

      for (const group of section.groups) {
        let cursor: string | undefined;
        let pages = 0;

        do {
          const page = await xrogaConnect.catalog({
            group,
            sortBy: 'usage',
            limit: 250,
            cursor,
          });

          for (const item of page.items) {
            if (!collected.some((existing) => existing.slug === item.slug)) {
              collected.push(item);
            }
          }

          cursor = page.nextCursor;
          pages += 1;
        } while (cursor && pages < 20);
      }

      setSectionCatalog((current) => ({
        ...current,
        [section.id]: collected,
      }));
    } catch (error) {
      setSectionErrors((current) => ({
        ...current,
        [section.id]:
          error instanceof Error
            ? error.message
            : `Could not load ${section.title} apps.`,
      }));
    } finally {
      setSectionLoading((current) => ({
        ...current,
        [section.id]: false,
      }));
    }
  }

  function toggleDiscoverySection(section: DiscoverySection) {
    const isExpanded = expandedSections.has(section.id);

    setExpandedSections((current) => {
      const next = new Set(current);
      if (isExpanded) next.delete(section.id);
      else next.add(section.id);
      return next;
    });

    setSectionVisibleCounts((current) => {
      if (isExpanded) {
        const next = { ...current };
        delete next[section.id];
        return next;
      }
      return {
        ...current,
        [section.id]:
          (section.id === 'other'
            ? OTHER_PREVIEW_LIMIT
            : CATEGORY_PREVIEW_LIMIT) + CATEGORY_EXPAND_STEP,
      };
    });

    if (
      !isExpanded &&
      section.groups.length > 0 &&
      !sectionCatalog[section.id]
    ) {
      void loadDiscoverySection(section);
    }
  }

  function showMoreDiscoverySection(section: DiscoverySection) {
    setSectionVisibleCounts((current) => ({
      ...current,
      [section.id]:
        (current[section.id] ??
          (section.id === 'other'
            ? OTHER_PREVIEW_LIMIT
            : CATEGORY_PREVIEW_LIMIT) +
            CATEGORY_EXPAND_STEP) + CATEGORY_EXPAND_STEP,
    }));
  }

  function pluginsForSection(section: DiscoverySection): RuntimePlugin[] {
    const raw = sectionCatalog[section.id];
    const source = raw
      ? mergePlugins([
          ...nativePlugins,
          ...raw.map(runtimeFromCatalog),
          ...connectedLongTail,
        ])
      : allPlugins;

    if (section.curatedIds?.length) {
      const allowed = new Set(section.curatedIds.map((id) => canonicalPluginId(id)));
      const filtered = source.filter((plugin) =>
        allowed.has(canonicalPluginId(plugin.toolkit || plugin.id)),
      );
      const rank = new Map(
        section.curatedIds.map((id, index) => [canonicalPluginId(id), index]),
      );

      return [...filtered].sort((a, b) => {
        const aRank =
          rank.get(canonicalPluginId(a.toolkit || a.id)) ??
          Number.POSITIVE_INFINITY;
        const bRank =
          rank.get(canonicalPluginId(b.toolkit || b.id)) ??
          Number.POSITIVE_INFINITY;
        return aRank - bRank;
      });
    }

    const claimedCategories = new Set(
      DISCOVERY_SECTIONS
        .filter((item) => item.id !== 'other' && !item.curatedIds?.length)
        .flatMap((item) => item.categories),
    );

    let filtered = source.filter((plugin) =>
      section.id === 'other'
        ? !claimedCategories.has(plugin.category)
        : section.categories.includes(plugin.category),
    );

    if (section.id === 'other' && filtered.length < OTHER_PREVIEW_LIMIT) {
      const existing = new Set(filtered.map((plugin) => plugin.toolkit || plugin.id));
      const specialtyBackfill = source.filter((plugin) => {
        const key = plugin.toolkit || plugin.id;
        return (
          !existing.has(key) &&
          plugin.source !== 'native' &&
          !plugin.developer
        );
      });

      filtered = mergePlugins([
        ...filtered,
        ...specialtyBackfill.slice(0, OTHER_PREVIEW_LIMIT * 2),
      ]);
    }

    const pins = SECTION_PINNED_IDS[section.id] ?? [];
    const pinRank = new Map(
      pins.map((id, index) => [canonicalPluginId(id), index]),
    );

    return [...filtered].sort((a, b) => {
      const aRank =
        pinRank.get(canonicalPluginId(a.toolkit || a.id)) ??
        Number.POSITIVE_INFINITY;
      const bRank =
        pinRank.get(canonicalPluginId(b.toolkit || b.id)) ??
        Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;
      return 0;
    });
  }

  async function connectNative(plugin: RuntimePlugin) {
    const id = plugin.id as NativePluginId;

    sessionStorage.setItem('xroga-plugin-return', detailHref(plugin));

    if (id === 'github') {
      const { url } = await api.github.oauthUrl();
      if (!url) throw new Error('GitHub authorization is not available.');
      window.location.href = url;
      return;
    }

    if (id === 'vercel') {
      const result = await api.vercel.oauthUrl();
      if (!result.oauthConfigured || !result.url) {
        throw new Error('Vercel authorization is not configured.');
      }
      window.location.href = result.url;
      return;
    }

    const result = await api.supabase.oauthUrl();
    if (!result.oauthConfigured || !result.url) {
      throw new Error(result.message || 'Supabase authorization is not configured.');
    }
    window.location.href = result.url;
  }

  async function connectComposio(plugin: RuntimePlugin) {
    if (!composioConfigured) {
      throw new Error('Connected business apps are temporarily unavailable.');
    }

    const toolkit = plugin.toolkit;
    if (!toolkit) {
      throw new Error(`${plugin.name} does not have a valid app identifier.`);
    }

    let activeSession = sessionId;
    if (!activeSession) {
      const created = await xrogaConnect.session();
      activeSession = created.sessionId;
      setSessionId(created.sessionId);
    }

    const current = await xrogaConnect.toolkits(activeSession, {
      toolkits: [toolkit],
    });
    const metadata = current.toolkits.find((item) => item.toolkit === toolkit);

    if (metadata?.connected || metadata?.noAuth) {
      absorbConnections(current.toolkits);
      setConnectedOverrides((state) => ({
        ...state,
        [toolkit]: true,
      }));
      toast.success(
        metadata.noAuth
          ? `${plugin.name} is ready to use`
          : `${plugin.name} is already connected`,
      );
      return;
    }

    clearOAuthResult();

    const popup = window.open(
      '',
      'xroga-connect-oauth',
      'width=600,height=760,resizable=yes,scrollbars=yes',
    );

    try {
      const result = await xrogaConnect.link(activeSession, toolkit);
      if (!result.redirectUrl) throw new Error('Authorization link was not returned.');

      setConnectingId(toolkit);

      if (popup) {
        popup.location.href = result.redirectUrl;
        popup.focus();
      } else {
        window.location.href = result.redirectUrl;
      }
    } catch (error) {
      try {
        popup?.close();
      } catch {
        // Browser may have already closed the popup.
      }
      throw error;
    }
  }

  async function handleConnect(plugin: RuntimePlugin) {
    if (connectingId || plugin.noAuth) return;
    const connectionKey = plugin.toolkit || plugin.id;
    setConnectingId(connectionKey);

    try {
      if (plugin.source === 'native') await connectNative(plugin);
      else await connectComposio(plugin);
    } catch (error) {
      setConnectingId(null);
      toast.error(error instanceof Error ? error.message : `Could not connect ${plugin.name}`);
    }
  }

  const searchMode = view === 'discover' && liveQuery.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-8 px-3 sm:px-5 lg:px-7 xl:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[28px]">
              Plugins
            </h1>
            {globalCatalogTotal !== null ? (
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-inset)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {globalCatalogTotal.toLocaleString()} available
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            Browse Xroga Apps, connect the services you use, and let Xroga discover the exact actions needed at runtime.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <div className="xv-plugin-search-shell xv-plugin-search-compact min-w-0 flex-1 sm:w-[330px] sm:flex-none">
              <div className="xv-plugin-search-inner">
                <label htmlFor="plugin-marketplace-search" className="sr-only">
                  Search Plugins
                </label>
                <input
                  id="plugin-marketplace-search"
                  value={query}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuery(value);
                    setSearchVisibleCount(SEARCH_PREVIEW_LIMIT);
                    if (view !== 'discover') setView('discover');
                  }}
                  placeholder="Search apps or tasks…"
                  className="xv-plugin-search-input"
                />
                <span className="xv-plugin-search-icon" aria-hidden="true">
                  {searchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </span>
              </div>
            </div>

            <div ref={addPluginMenuRef} className="relative">
              <button
                type="button"
                aria-label="Add new Plugin"
                aria-haspopup="menu"
                aria-expanded={addPluginOpen && addPluginMode === 'menu'}
                onClick={() => {
                  setAddPluginMode('menu');
                  setAddPluginOpen((open) => !open);
                }}
                className="xv-plugin-add-btn inline-flex min-h-10 items-center justify-center gap-1.5 px-4 text-sm font-semibold"
              >
                Add new plugin
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${addPluginOpen && addPluginMode === 'menu' ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {addPluginOpen && addPluginMode === 'menu' ? (
                <div
                  role="menu"
                  aria-label="Add new Plugin"
                  className="absolute right-0 z-40 mt-2 w-[250px] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-1.5 shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setAddPluginMode('mcp')}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--text-primary)] transition hover:bg-[var(--surface-inset)]"
                  >
                    <Server className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                    <span className="min-w-0">
                      <strong className="block text-[13px] font-semibold">Create MCP Plugin</strong>
                      <span className="mt-0.5 block text-[11px] leading-4 text-[var(--text-secondary)]">
                        Add your own remote MCP-compatible service.
                      </span>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {searchMode ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Search results</h2>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {searchPlugins.length
                  ? `${searchPlugins.length} matching Plugins — exact brands first, then capability matches.`
                  : searchLoading
                    ? 'Searching Xroga Apps and real capabilities…'
                    : `No Plugin matched “${liveQuery}”.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              Clear search
            </button>
          </div>

          {semanticError ? (
            

      <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                Capability search is temporarily unavailable. Brand/catalogue search is still working.
              </p>
            </div>
          ) : null}

          {searchPlugins.length ? (
            <>
              <PluginListGrid
                plugins={searchPlugins.slice(0, searchVisibleCount)}
                connectingId={connectingId}
                onConnect={handleConnect}
              />
              {searchPlugins.length > searchVisibleCount ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      setSearchVisibleCount((current) => current + SEARCH_PREVIEW_LIMIT)
                    }
                    className="xv-plugin-show-more inline-flex min-h-10 items-center justify-center px-5 text-xs font-semibold"
                  >
                    Show more results
                  </button>
                </div>
              ) : null}
            </>
          ) : !searchLoading ? (
            <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] px-5 py-8 text-center">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                No Plugin found for “{liveQuery}”
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--text-secondary)]">
                Try an app name or describe the task differently. Xroga searches the full app catalogue and the live capability index.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-40 animate-pulse rounded-token-lg bg-[var(--surface-inset)]" />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <nav className="xv-plugin-segmented" aria-label="Plugin views">
              {(['discover', 'connected', 'developer', 'custom'] as PluginView[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setView(item)}
                  aria-current={view === item ? 'page' : undefined}
                  aria-pressed={view === item}
                  className="xv-plugin-segmented-item"
                >
                  {item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ))}
            </nav>
            <PageFullscreenToggle compact />
          </div>

          {view === 'discover' ? (
            <div className="space-y-8">
              <InstalledPluginsShelf
                plugins={connectedPlugins}
                onViewAll={() => setView('connected')}
              />

              <FeaturedPluginSection
                id="popular"
                title="Popular"
                hint="Most used"
                plugins={popularPlugins}
                expanded={expandedFeatured.has('popular')}
                loading={catalogLoading}
                connectingId={connectingId}
                onConnect={handleConnect}
                onToggle={() =>
                  setExpandedFeatured((current) => {
                    const next = new Set(current);
                    if (next.has('popular')) next.delete('popular');
                    else next.add('popular');
                    return next;
                  })
                }
              />

              {explorePlugins.length ? (
                <FeaturedPluginSection
                  id="explore"
                  title="Explore"
                  hint="Recommended"
                  plugins={explorePlugins}
                  expanded={expandedFeatured.has('explore')}
                  loading={catalogLoading}
                  connectingId={connectingId}
                  onConnect={handleConnect}
                  onToggle={() =>
                    setExpandedFeatured((current) => {
                      const next = new Set(current);
                      if (next.has('explore')) next.delete('explore');
                      else next.add('explore');
                      return next;
                    })
                  }
                />
              ) : null}

              <section>
                <div className="mb-5">
                  <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
                    Categories
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--text-secondary)]">
                    Browse Plugins by what they help you do. Each category starts compact; click its heading to reveal more apps, and click again to collapse it.
                  </p>
                </div>

                <div className="space-y-7">
                  {DISCOVERY_SECTIONS.map((section) => {
                    const sectionPlugins = pluginsForSection(section);
                    if (catalogHydrated && !sectionPlugins.length && !sectionLoading[section.id]) {
                      return null;
                    }

                    return (
                      <CategoryPluginSection
                        key={section.id}
                        section={section}
                        plugins={sectionPlugins}
                        expanded={expandedSections.has(section.id)}
                        visibleCount={
                          sectionVisibleCounts[section.id] ??
                          (section.id === 'other'
                            ? OTHER_PREVIEW_LIMIT
                            : CATEGORY_PREVIEW_LIMIT)
                        }
                        loading={
                          Boolean(sectionLoading[section.id]) ||
                          (!catalogHydrated && !sectionPlugins.length)
                        }
                        error={sectionErrors[section.id]}
                        connectingId={connectingId}
                        onConnect={handleConnect}
                        onToggle={() => toggleDiscoverySection(section)}
                        onShowMore={() => showMoreDiscoverySection(section)}
                      />
                    );
                  })}
                </div>
              </section>
            </div>
          ) : null}

          {view === 'connected' ? (
            <section className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Connected Plugins</h2>
                    <span className="rounded-full bg-[var(--surface-inset)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                      {connectedPlugins.length.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    Manage every active Xroga App connection and native developer service.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                  <label htmlFor="connected-plugin-search" className="sr-only">
                    Search connected Plugins
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                  <input
                    id="connected-plugin-search"
                    value={connectedQuery}
                    onChange={(event) => setConnectedQuery(event.target.value)}
                    placeholder="Search connected Plugins…"
                    className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-raised)] py-2.5 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="xv-plugin-segmented xv-plugin-segmented-compact overflow-x-auto" role="group" aria-label="Connected Plugin filters">
                  {([
                    ['all', 'All'],
                    ['apps', 'Apps'],
                    ['developer', 'Developer'],
                    ['attention', 'Needs attention'],
                  ] as Array<[ConnectedFilter, string]>).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setConnectedFilter(id)}
                      aria-pressed={connectedFilter === id}
                      className="xv-plugin-segmented-item shrink-0"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {filteredConnected.length ? (
                <ConnectedPluginList plugins={filteredConnected} />
              ) : (
                <div className="rounded-token-lg border border-dashed border-[var(--border-subtle)] px-5 py-8">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {connectedPlugins.length ? 'No connected Plugins match this view.' : 'No Plugins connected yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setView('discover')}
                    className="mt-3 text-xs font-semibold text-[var(--accent)] hover:underline"
                  >
                    Browse Plugins
                  </button>
                </div>
              )}
            </section>
          ) : null}

          {view === 'developer' ? (
            <section className="space-y-7">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Developer Plugins</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  Developer, infrastructure, monitoring and data services available to Xroga. Publishing remains separate.
                </p>
              </div>

              {developerPlugins.length ? (
                <PluginGrid
                  plugins={developerPlugins}
                  connectingId={connectingId}
                  onConnect={handleConnect}
                />
              ) : (
                <p className="rounded-token-lg border border-dashed border-[var(--border-subtle)] p-4 text-sm text-[var(--text-secondary)]">
                  Load more catalogue pages or use search to find a specific developer service.
                </p>
              )}

              <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
                Configure production targets, builds and shipping from{' '}
                <Link href="/dashboard/publish" className="font-semibold text-[var(--accent)] hover:underline">
                  Publish
                </Link>
                . Plugins manages providers, real capabilities and connections.
              </div>
            </section>
          ) : null}

          {view === 'custom' ? (
            <section id="custom-plugin-options" className="space-y-6 scroll-mt-8">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Custom Plugins</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  Extend Xroga with your own remote MCP server without cluttering the main app directory.
                </p>
              </div>

              <CustomMcpManager />



            </section>
          ) : null}
        </>
      )}

      <Dialog
        open={addPluginOpen && addPluginMode === 'mcp'}
        onClose={() => {
          setAddPluginMode('menu');
          setAddPluginOpen(false);
        }}
        title="Add Custom MCP"
        description="Turn a remote MCP server into a first-class Xroga Plugin."
        className="max-w-[440px]"
      >
        <CustomMcpCreateForm
          onBack={() => {
            setAddPluginMode('menu');
            setAddPluginOpen(false);
          }}
          onCreated={() => {
            setAddPluginMode('menu');
            setAddPluginOpen(false);
            setView('custom');
          }}
        />
      </Dialog>

      <div className="flex items-start gap-2 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <p className="text-xs leading-5 text-[var(--text-secondary)]">
          Every available Xroga App can be discovered at runtime. Xroga keeps read/write/destructive classification, and your Default permission setting controls when an extra confirmation checkpoint is required.
        </p>
      </div>
    </div>
  );
}