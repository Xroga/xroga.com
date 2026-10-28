import { xrogaCustomUserToken, xrogaCustomToolkitPrefix, canUserAccessComposioToolkit, canUserAccessComposioToolSlug } from './composioNamespace.js';
import { createHash,randomUUID } from 'node:crypto';
import { redactOperationsValue } from '../../operations/operationsEngine.js';
export { xrogaCustomToolkitPrefix, canUserAccessComposioToolkit, canUserAccessComposioToolSlug } from './composioNamespace.js';
import { canonicalAuthorityValue, preparedActionDigest } from '../../security/authority/digest.js';
import { AuthorityError,assertAuthorityPermit, consumeAuthorityPermit,authorityContextForPermit } from '../../security/authority/enforce.js';
import type { AuthorityDispatchBinding, AuthorityPermit } from '../../security/authority/types.js';
import { businessActionClass } from '../../security/authority/risk.js';
import { requireTenantContext,requireResourceOwner,type TenantContext } from '../../security/tenantContext.js';
import { enforceEgress,EgressDenied } from '../../security/egress/egressPolicy.js';
import { persistSecurityDecision } from '../../security/egress/securityDecision.js';
import {classifyOutboundData} from '../../security/egress/dataClassification.js';
import {publicHttpsUrl} from '../../security/egress/urlPolicy.js';
import {prepareComposioControl,requireComposioControl,type ComposioControlAdmission,type ComposioControlPending} from './composioControl.js';

const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3.1';

const DEFAULT_TIMEOUT_MS = 15_000;
const EXECUTE_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 8_000_000;
const MAX_SEARCH_RESULTS = 20;
// Composio's session toolkit endpoint rejects limit values above 50.
const MAX_TOOLKIT_PAGE_SIZE = 50;
const MAX_CATALOG_PAGE_SIZE = 250;
const MAX_TRIGGER_PAGE_SIZE = 50;
const COMPOSIO_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_COMPOSIO_CACHE_ENTRIES = 60;

const READ_ONLY_TAG = 'readOnlyHint';
const DESTRUCTIVE_TAG = 'destructiveHint';
const actorCredentialEpochs=new WeakMap<object,string>();
function currentComposioCredential(context?:TenantContext):string{
  let key:string;try{key=getComposioApiKey();}catch(error){if(context&&actorCredentialEpochs.has(context))throw new AuthorityError('COMPOSIO_CREDENTIAL_CHANGED');throw error;}
  if(context){requireTenantContext(context);const digest=createHash('sha256').update(key).digest('hex'),prior=actorCredentialEpochs.get(context);if(prior&&prior!==digest)throw new AuthorityError('COMPOSIO_CREDENTIAL_CHANGED');actorCredentialEpochs.set(context,digest);}return key;
}

function requireComposioActor(userId:string,supplied?:TenantContext):TenantContext{
  const context=requireTenantContext(supplied);requireResourceOwner(context,userId);currentComposioCredential(context);return context;
}
export function composioControlSource(context:TenantContext):string{
  requireComposioActor(context.userId,context);return actorCredentialEpochs.get(context)!;
}

export type XrogaConnectMode = 'read' | 'action';

export type XrogaConnectToolRisk =
  | 'read'
  | 'write'
  | 'destructive'
  | 'unknown';

export class ComposioClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
    } = {},
  ) {
    super(message);
    this.name = 'ComposioClientError';
    this.status = options.status ?? 502;
    this.code = options.code ?? 'COMPOSIO_ERROR';
  }
}

interface ComposioTagsConfig {
  enabled?: string[];
  disabled?: string[];
  enable?: string[];
  disable?: string[];
}

interface ComposioWorkbenchConfig {
  enable?: boolean;
  proxy_execution_enabled?: boolean;
  enable_proxy_execution?: boolean;
}

interface ComposioSessionConfig {
  user_id?: string;
  tags?: string[] | ComposioTagsConfig;
  search?: {
    enable?: boolean;
  };
  execute?: {
    enable_multi_execute?: boolean;
  };
  workbench?: ComposioWorkbenchConfig;
  sandbox?: ComposioWorkbenchConfig;
}

export interface ComposioSession {
  session_id: string;
  config?: ComposioSessionConfig;
  warnings?: Array<{
    code?: string;
    message?: string;
  }>;
}

interface ComposioConfigHistoryResponse {
  items?: Array<{
    version?: number;
    created_at?: string;
    config?: ComposioSessionConfig;
    is_current?: boolean;
  }>;
}

interface ComposioToolSchema {
  toolkit?: string;
  tool_slug?: string;
  description?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
}

interface ComposioSearchResponse {
  success?: boolean;
  error?: string;
  results?: Array<{
    index?: number;
    use_case?: string;
    execution_guidance?: string;
    primary_tool_slugs?: string[];
    related_tool_slugs?: string[];
    difficulty?: string;
    recommended_plan_steps?: string[];
    known_pitfalls?: string[];
    toolkits?: string[];
    error?: string;
  }>;
  toolkit_connection_statuses?: Array<{
    toolkit?: string;
    description?: string;
    has_active_connection?: boolean;
    status_message?: string;
    account_selection?: string;
  }>;
  tool_schemas?: Record<string, ComposioToolSchema>;
}

interface ComposioLinkResponse {
  link_token?: string;
  redirect_url?: string;
  connected_account_id?: string;
}

interface ComposioCustomToolkitUpsertResponse {
  slug?: string;
}

interface ComposioCustomToolkitSyncResponse {
  slug?: string;
  version?: string;
  synced_count?: number;
}

interface ComposioCustomToolkitDeleteResponse {
  slug?: string;
  deleted?: boolean;
  revoke_job_ids?: string[];
  auth_configs_soft_deleted?: number;
  connected_accounts_soft_deleted?: number;
}

interface ComposioSessionToolkitResponse {
  items?: Array<{
    slug?: string;
    name?: string;
    enabled?: boolean;
    is_no_auth?: boolean;
    meta?: {
      description?: string;
      logo?: string;
      isNoAuth?: boolean;
    };
    connected_account?:
      | {
          id?: string;
          user_id?: string;
          status?: string;
        }
      | null;
  }>;
  next_cursor?: string;
  total_pages?: number;
  current_page?: number;
  total_items?: number;
}

interface ComposioCatalogCategory {
  id?: string;
  name?: string;
}

interface ComposioCatalogToolkitResponse {
  slug?: string;
  name?: string;
  type?: string;
  auth_schemes?: string[];
  composio_managed_auth_schemes?: string[];
  is_local_toolkit?: boolean;
  no_auth?: boolean;
  auth_guide_url?: string;
  deprecated?: unknown;
  is_deprecated?: boolean;
  meta?: {
    created_at?: string;
    updated_at?: string;
    description?: string;
    logo?: string;
    app_url?: string;
    categories?: ComposioCatalogCategory[];
    triggers_count?: number;
    tools_count?: number;
    version?: string;
  };
}

interface ComposioCatalogToolkitListResponse {
  items?: ComposioCatalogToolkitResponse[];
  next_cursor?: string | null;
  total_pages?: number;
  current_page?: number;
  total_items?: number;
}

interface ComposioCatalogCategoryListResponse {
  items?: ComposioCatalogCategory[];
  next_cursor?: string | null;
  total_pages?: number;
  current_page?: number;
  total_items?: number;
}

interface ComposioCatalogToolResponse {
  slug?: string;
  name?: string;
  description?: string;
  toolkit?: {
    slug?: string;
    name?: string;
    logo?: string;
  };
  tags?: string[];
  scopes?: string[];
  no_auth?: boolean;
  is_deprecated?: boolean;
  version?: string;
  important?: boolean;
}

interface ComposioCatalogToolListResponse {
  items?: ComposioCatalogToolResponse[];
  next_cursor?: string | null;
  total_pages?: number;
  current_page?: number;
  total_items?: number;
}

interface ComposioTriggerTypeResponse {
  slug?: string;
  name?: string;
  description?: string;
  instructions?: string;
  type?: string;
  version?: string;
  toolkit?: {
    slug?: string;
    name?: string;
    logo?: string;
  };
}

interface ComposioTriggerTypeListResponse {
  items?: ComposioTriggerTypeResponse[];
  next_cursor?: string | null;
  total_pages?: number;
  current_page?: number;
  total_items?: number;
}

interface ComposioToolDetailsResponse {
  slug?: string;
  name?: string;
  description?: string;
  human_description?: string;
  toolkit?: {
    slug?: string;
    name?: string;
  };
  input_parameters?: Record<string, unknown>;
  output_parameters?: Record<string, unknown>;
  scopes?: string[];
  scope_requirements?: unknown;
  tags?: string[];
  no_auth?: boolean;
  is_deprecated?: boolean;
  version?: string;
}

export interface ComposioExecuteResponse {
  needsConfirmation?:boolean;
  reviewUrl?:string;
  confirmation?:import('./businessActionConfirmations.js').SafeBusinessActionConfirmation;
  result_type?: string;
  data?: unknown;
  error?: string;
  log_id?: string;
  /** Internal hash of the complete provider data, computed before redaction. */
  resultDigest?: string;
}

export interface XrogaConnectTool {
  slug: string;
  toolkit: string;
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  scopes?: string[];
  tags?: string[];
  version?: string;
  deprecated?: boolean;
  important?: boolean;
  risk: XrogaConnectToolRisk;
  requiresConfirmation: boolean;
}

export interface XrogaConnectToolDetails extends XrogaConnectTool {
  name?: string;
  humanDescription?: string;
  outputSchema?: Record<string, unknown>;
  scopes: string[];
  scopeRequirements?: unknown;
  tags: string[];
  noAuth: boolean;
  deprecated: boolean;
  version?: string;
}

export interface XrogaConnectToolkit {
  toolkit: string;
  name?: string;
  description?: string;
  logo?: string;
  connected: boolean;
  connectedAccountId?: string;
  statusMessage?: string;
  noAuth?: boolean;
}

export interface XrogaConnectSkill {
  useCase?: string;
  primaryToolSlugs: string[];
  relatedToolSlugs: string[];
  difficulty?: string;
  recommendedPlanSteps: string[];
  knownPitfalls: string[];
}

export interface XrogaConnectSearchResult {
  sessionId: string;
  mode: XrogaConnectMode;
  tools: XrogaConnectTool[];
  toolkits: XrogaConnectToolkit[];
  guidance?: string;
  skill?: XrogaConnectSkill;
}

export interface XrogaConnectCatalogToolkit {
  slug: string;
  name: string;
  type?: string;
  authSchemes: string[];
  managedAuthSchemes: string[];
  noAuth: boolean;
  authGuideUrl?: string;
  description?: string;
  logo?: string;
  appUrl?: string;
  categories: Array<{ id: string; name: string }>;
  xrogaGroup?: CanonicalXrogaCatalogGroup;
  triggersCount: number;
  toolsCount: number;
  version?: string;
  deprecated: boolean;
}

export interface XrogaConnectCatalogPage {
  items: XrogaConnectCatalogToolkit[];
  nextCursor?: string;
  totalPages?: number;
  currentPage?: number;
  totalItems: number;
}

export type XrogaCatalogGroup =
  | 'productivity'
  | 'project-management'
  | 'communication'
  | 'sales-crm'
  | 'support'
  | 'business-operations'
  | 'commerce-payments'
  | 'marketing-growth'
  | 'social-media'
  | 'booking-scheduling'
  | 'travel-hospitality'
  | 'maps-location'
  | 'web-search-scraping'
  | 'weather-utilities'
  | 'logistics-shipping'
  | 'forms-surveys'
  | 'legal-contracts'
  | 'real-estate'
  | 'food-restaurants'
  | 'hotels-stays'
  | 'finance-accounting'
  | 'blockchain-crypto'
  | 'data-analytics'
  | 'databases'
  | 'developer-tools'
  | 'deployment-hosting'
  | 'cloud-infrastructure'
  | 'ai-automation'
  | 'content-files'
  | 'design-media'
  | 'hr-recruiting'
  | 'education-research'
  | 'scientific-research'
  | 'security'
  | 'healthcare-fitness'
  | 'entertainment'
  | 'other'
  // Backward-compatible aliases for already-deployed clients.
  | 'engineering'
  | 'commerce'
  | 'marketing'
  | 'finance'
  | 'infrastructure'
  | 'healthcare'
  | 'travel';

type CanonicalXrogaCatalogGroup = Exclude<
  XrogaCatalogGroup,
  | 'engineering'
  | 'commerce'
  | 'marketing'
  | 'finance'
  | 'infrastructure'
  | 'healthcare'
  | 'travel'
>;

const LEGACY_XROGA_GROUP_ALIASES: Partial<
  Record<XrogaCatalogGroup, CanonicalXrogaCatalogGroup>
> = {
  engineering: 'developer-tools',
  commerce: 'commerce-payments',
  marketing: 'marketing-growth',
  finance: 'finance-accounting',
  infrastructure: 'cloud-infrastructure',
  healthcare: 'healthcare-fitness',
  travel: 'travel-hospitality',
};

export function canonicalXrogaCatalogGroup(
  group: XrogaCatalogGroup,
): CanonicalXrogaCatalogGroup {
  return LEGACY_XROGA_GROUP_ALIASES[group] ?? (group as CanonicalXrogaCatalogGroup);
}

function toolkitCategoryText(
  toolkit: XrogaConnectCatalogToolkit,
): string {
  return toolkit.categories
    .flatMap((category) => [category.id, category.name])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function toolkitFallbackText(
  toolkit: XrogaConnectCatalogToolkit,
): string {
  return [toolkit.name, toolkit.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Xroga's user-facing taxonomy is intentionally smaller and more task-oriented
 * than the provider taxonomy. Prefer the standardized provider categories first,
 * then use name/description fallbacks for long-tail apps.
 */
export function xrogaCatalogGroupFor(
  toolkit: XrogaConnectCatalogToolkit,
): CanonicalXrogaCatalogGroup {
  const categories = toolkitCategoryText(toolkit);
  const text = toolkitFallbackText(toolkit);
  const slug = toolkit.slug.toLowerCase().replace(/[^a-z0-9]/g, '');

  // Keep high-signal brands in the shelves users expect even when an upstream
  // provider applies a broad or surprising category label.
  if (slug.includes('whop')) return 'commerce-payments';
  if (slug.includes('canva')) return 'design-media';
  if (slug === 'flyio' || slug.startsWith('flyio')) return 'deployment-hosting';

  // Specific user intents come first. This keeps category labels aligned with
  // the apps users expect to find there instead of letting broad provider
  // categories (for example "productivity") swallow specialist apps.
  if (
    /\bmaps?\b|geocoding|geospatial|location intelligence|navigation|places/.test(categories) ||
    /\b(google maps|mapbox|geocod|geospatial|directions?|route planning|places api|location data)\b/.test(text)
  ) return 'maps-location';

  if (
    /weather|climate|forecast|time zones?|currency conversion|utilities/.test(categories) ||
    /\b(weather|forecast|climate|temperature|time zone|timezone|currency converter)\b/.test(text)
  ) return 'weather-utilities';

  // Scheduling is checked before broad travel categories because provider
  // taxonomies can be noisy. Cal/Calendly must never appear as travel apps.
  if (
    /scheduling\s*&\s*booking|scheduling and booking|appointment|reservation|calendar booking/.test(categories) ||
    /\b(calendly|cal\.com|appointment|booking page|scheduler|scheduling|meeting booking|availability management)\b/.test(text)
  ) return 'booking-scheduling';

  // Hotels/stays and travel/transport are intentionally split so location and
  // weather utilities never leak into the travel shelf.
  if (
    /hotel|hospitality|lodging|accommodation|vacation rental|short-term rental/.test(categories) ||
    /\b(hotel|hotels|lodging|accommodation|stay|stays|booking\.com|airbnb|agoda|hospitality)\b/.test(text)
  ) return 'hotels-stays';

  if (
    /travel|flight|airline|tourism|transport|rail|rental car/.test(categories) ||
    /\b(flight|flights|airline|airlines|tourism|trip\.com|skyscanner|expedia|travel|transport|rail|train|rental car)\b/.test(text)
  ) return 'travel-hospitality';

  if (
    /shipping|logistics|delivery|fleet|carrier|postal|warehouse|supply chain/.test(categories) ||
    /\b(shippo|shipstation|easypost|aftership|shipping|logistics|courier|delivery|fleet|freight|carrier|warehouse|supply chain)\b/.test(text)
  ) return 'logistics-shipping';

  if (
    /real estate|property management|property listings|mortgage/.test(categories) ||
    /\b(real estate|property listing|property management|realtor|zillow|mortgage|estate agency)\b/.test(text)
  ) return 'real-estate';

  if (
    /food|restaurants?|restaurant management|recipes?|dining/.test(categories) ||
    /\b(restaurant|food delivery|menu|recipe|dining|opentable|doordash|ubereats|yelp)\b/.test(text)
  ) return 'food-restaurants';

  if (
    /legal|contracts?|signatures?|e-signatures?|document signing/.test(categories) ||
    /\b(legal|contract management|contract lifecycle|e-signature|electronic signature|docusign|pandadoc|ironclad)\b/.test(text)
  ) return 'legal-contracts';

  if (
    /forms\s*&\s*surveys|forms and surveys|surveys?|questionnaires?|data collection/.test(categories) ||
    /\b(typeform|jotform|surveymonkey|google forms|tally|form builder|survey|questionnaire)\b/.test(text)
  ) return 'forms-surveys';

  if (
    /social media accounts|social media marketing|social media management|creator tools/.test(categories) ||
    /\b(instagram|linkedin|twitter|x\.com|facebook pages|tiktok|social media|social posting|social network)\b/.test(text)
  ) return 'social-media';

  if (
    /ai web scraping|web scraping|web search|search engine|browser automation|data extraction/.test(categories) ||
    /\b(firecrawl|exa|apify|browser tool|scrapingbee|bright data|web scrape|web scraping|web search|browser automation|search the web)\b/.test(text)
  ) return 'web-search-scraping';

  if (
    /\bdatabases?\b/.test(categories) ||
    /\b(postgres|postgresql|mysql|mongodb|mongo db|neon|planetscale|redis|supabase database|database platform|sql database|data store)\b/.test(text)
  ) return 'databases';

  if (
    /website\s*&\s*app building|website and app building|app builder|website builders|hosting/.test(categories) ||
    /\b(vercel|netlify|render|railway|heroku|fly\.io|deployment platform|deploy apps?|build and deploy|web hosting|app hosting|serverless hosting)\b/.test(text)
  ) return 'deployment-hosting';

  if (/security\s*&\s*identity|security and identity|risk management|compliance|audit management/.test(categories)) return 'security';
  if (/blockchain|crypto|cryptocurrency|web3|on-chain|onchain/.test(categories)) return 'blockchain-crypto';
  if (/developer tools|developer tools\s*&\s*devops|developer tools and devops|api testing/.test(categories)) return 'developer-tools';
  if (/it operations|server monitoring|internet of things|networking|cloud infrastructure/.test(categories)) return 'cloud-infrastructure';
  if (/online courses/.test(categories)) return 'education-research';

  if (
    /artificial intelligence|ai agents|ai assistants|ai chatbots|ai content generation|ai document extraction|ai meeting assistants|ai models|ai safety compliance detection|ai sales tools|model context protocol|creative automation/.test(categories)
  ) return 'ai-automation';

  if (/business intelligence|analytics|dashboards|product analytics|data analytics|reporting/.test(categories)) return 'data-analytics';
  if (/accounting|fundraising|proposal\s*&\s*invoice|proposal and invoice|taxes|banking|expense management/.test(categories)) return 'finance-accounting';
  if (/commerce|ecommerce|payment processing|reviews|retail/.test(categories)) return 'commerce-payments';

  if (/marketing|ads\s*&\s*conversion|ads and conversion|drip emails|email newsletters|event management|marketing automation|transactional email|url shortener|webinars|seo/.test(categories)) {
    return 'marketing-growth';
  }

  if (/customer support|\bsupport\b|customer appreciation|help desk|ticketing/.test(categories)) return 'support';
  if (/sales\s*&\s*crm|sales and crm|contact management|\bcrm\b|lead management/.test(categories)) return 'sales-crm';
  if (/business operations|business management|erp|office management|professional services|workflow management/.test(categories)) return 'business-operations';

  if (/images\s*&\s*design|images and design|video\s*&\s*audio|video and audio|visual content generation/.test(categories)) return 'design-media';
  if (/content\s*&\s*files|content and files|documents|file management\s*&\s*storage|file management and storage|notes|transcription/.test(categories)) {
    return 'content-files';
  }

  if (/human resources|hr talent\s*&\s*recruitment|hr talent and recruitment|recruiting|employee management/.test(categories)) return 'hr-recruiting';
  if (/scientific research|biology|chemistry|genomics|bioinformatics/.test(categories)) return 'scientific-research';
  if (/\beducation\b/.test(categories)) return 'education-research';

  if (/fitness|healthcare|health|medical|wellness|nutrition/.test(categories)) return 'healthcare-fitness';
  if (/gaming|lifestyle\s*&\s*entertainment|lifestyle and entertainment|news\s*&\s*lifestyle|news and lifestyle|music|sports/.test(categories)) {
    return 'entertainment';
  }

  if (/phone\s*&\s*sms|phone and sms|team chat|team collaboration|video conferencing|communication|call tracking|\bemail\b|fax|notifications|messaging/.test(categories)) {
    return 'communication';
  }

  if (/calendar/.test(categories)) return 'booking-scheduling';
  if (/project management|product management|task management|work management|kanban|roadmap/.test(categories)) {
    return 'project-management';
  }
  if (/productivity|bookmark managers|spreadsheets|time tracking software/.test(categories)) {
    return 'productivity';
  }

  // Long-tail fallbacks. These run only after official category signals.
  if (/\b(map|maps|geocoding|geospatial|location|navigation|directions)\b/.test(text)) return 'maps-location';
  if (/\b(weather|forecast|climate|temperature)\b/.test(text)) return 'weather-utilities';
  if (/\b(shipping|logistics|courier|delivery|fleet|freight|warehouse)\b/.test(text)) return 'logistics-shipping';
  if (/\b(real estate|property|realtor|mortgage)\b/.test(text)) return 'real-estate';
  if (/\b(restaurant|food|menu|recipe|dining)\b/.test(text)) return 'food-restaurants';
  if (/\b(legal|contract|signature|signing)\b/.test(text)) return 'legal-contracts';
  if (/\b(form builder|survey|questionnaire|data collection)\b/.test(text)) return 'forms-surveys';
  if (/\b(social media|instagram|linkedin|twitter|tiktok|facebook page)\b/.test(text)) return 'social-media';
  if (/\b(web scrape|web scraping|web search|browser automation|crawler|crawl the web)\b/.test(text)) return 'web-search-scraping';
  if (/\b(security|privacy|malware|threat|vulnerability|cyber|phishing|compliance|audit)\b/.test(text)) return 'security';
  if (/\b(blockchain|crypto|cryptocurrency|web3|on-chain|onchain|wallet|token data)\b/.test(text)) return 'blockchain-crypto';
  if (/\b(scientific|biology|chemistry|genomic|genome|protein|molecular|laboratory|preprint)\b/.test(text)) return 'scientific-research';
  if (/\b(education|academic|learning|university|course|scholar|literature|research paper)\b/.test(text)) return 'education-research';
  if (/\b(health|healthcare|fitness|medical|workout|nutrition|calorie|wellness|garmin|fitbit|patient)\b/.test(text)) return 'healthcare-fitness';
  if (/\b(music|podcast|gaming|game|movie|streaming|sports|astrology|horoscope|chess)\b/.test(text)) return 'entertainment';
  if (/\b(marketing|advertis|campaign|seo|newsletter|growth|conversion)\b/.test(text)) return 'marketing-growth';
  if (/\b(support|helpdesk|service desk|customer service)\b/.test(text)) return 'support';
  if (/\b(crm|lead|prospect|sales pipeline|deal)\b/.test(text)) return 'sales-crm';
  if (/\b(business operations|business management|erp|office management|professional services|operations platform)\b/.test(text)) return 'business-operations';
  if (/\b(payment|checkout|ecommerce|e-commerce|shopping|order|inventory|fulfillment)\b/.test(text)) return 'commerce-payments';
  if (/\b(accounting|banking|invoice|tax|expense|fintech|payroll)\b/.test(text)) return 'finance-accounting';
  if (/\b(analytics|dashboard|business intelligence|data warehouse|etl|reporting)\b/.test(text)) return 'data-analytics';
  if (/\b(deploy|hosting|deployment|serverless)\b/.test(text)) return 'deployment-hosting';
  if (/\b(cloud|infrastructure|cdn|dns|network|container|kubernetes|server monitoring)\b/.test(text)) return 'cloud-infrastructure';
  if (/\b(github|gitlab|developer|devops|source control|code review|api testing|observability)\b/.test(text)) return 'developer-tools';
  if (/\b(ai|agent|automation|workflow|llm|model context protocol|mcp)\b/.test(text)) return 'ai-automation';
  if (/\b(design|creative|image|video|audio|graphics|3d|cad|animation|photo)\b/.test(text)) return 'design-media';
  if (/\b(document|file|storage|note|transcription)\b/.test(text)) return 'content-files';
  if (/\b(email|messaging|chat|sms|phone|voice|meeting|conference)\b/.test(text)) return 'communication';
  if (/\b(project management|task management|project planning|kanban|roadmap|work management)\b/.test(text)) return 'project-management';
  if (/\b(calendar|task|spreadsheet|workspace|productivity)\b/.test(text)) return 'productivity';

  return 'other';
}

export interface XrogaConnectCatalogToolPage {
  items: XrogaConnectTool[];
  nextCursor?: string;
  totalPages?: number;
  currentPage?: number;
  totalItems: number;
}

export interface XrogaConnectTriggerType {
  slug: string;
  name: string;
  description?: string;
  instructions?: string;
  type?: string;
  version?: string;
}

export interface XrogaConnectTriggerPage {
  items: XrogaConnectTriggerType[];
  nextCursor?: string;
  totalPages?: number;
  currentPage?: number;
  totalItems: number;
}

const catalogCache = new Map<
  string,
  {
    expiresAt: number;
    value: unknown;
  }
>();

async function cachedComposioValue<T>(
  key: string,
  load: () => Promise<T>,
  fresh=false,
): Promise<T> {
  if(fresh)return load();
  key=createHash('sha256').update(currentComposioCredential()).digest('hex')+':'+key;
  const now = Date.now();
  const cached = catalogCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const value = await load();
  catalogCache.set(key, {
    expiresAt: now + COMPOSIO_CACHE_TTL_MS,
    value,
  });

  for (const [cacheKey, item] of catalogCache) {
    if (item.expiresAt <= now) catalogCache.delete(cacheKey);
  }

  while (catalogCache.size > MAX_COMPOSIO_CACHE_ENTRIES) {
    const oldest = catalogCache.keys().next().value as string | undefined;
    if (!oldest) break;
    catalogCache.delete(oldest);
  }

  return value;
}

export type XrogaCustomMcpAuthMode =
  | 'none'
  | 'api_key'
  | 'dcr_oauth';

export interface XrogaCustomMcpCreateInput {
  name: string;
  serverUrl: string;
  authMode: XrogaCustomMcpAuthMode;
  headerName?: string;
  headerPrefix?: string;
  discoveryUrl?: string;
}

export interface XrogaCustomMcpSyncResult {
  slug: string;
  version?: string;
  syncedCount?: number;
}

function cleanCustomMcpSlug(value: string): string {
  const clean = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 42);

  if (!clean) {
    throw new ComposioClientError('Custom MCP name must contain letters or numbers.', {
      status: 400,
      code: 'INVALID_CUSTOM_MCP_NAME',
    });
  }

  return clean;
}

function validateCustomMcpUrl(value: string, field: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ComposioClientError(`${field} must be a valid URL.`, {
      status: 400,
      code: 'INVALID_CUSTOM_MCP_URL',
    });
  }

  try{publicHttpsUrl(value);}catch{
    throw new ComposioClientError(`${field} must use HTTPS.`, {
      status: 400,
      code: 'UNSAFE_CUSTOM_MCP_URL',
    });
  }

  return publicHttpsUrl(value).href;
}

function xrogaCustomToolkitRegistrationSlug(
  userId: string,
  name: string,
): string {
  return `XROGA_${xrogaCustomUserToken(userId).toUpperCase()}_${cleanCustomMcpSlug(name)}`;
}

export function filterComposioCatalogForUser(
  userId: string,
  items: XrogaConnectCatalogToolkit[],
): XrogaConnectCatalogToolkit[] {
  return items.filter((item) =>
    canUserAccessComposioToolkit(userId, item.slug),
  );
}

function clearComposioCatalogCache(): void {
  catalogCache.clear();
}

export async function listUserCustomMcpToolkits(
  userId: string,
  tenantContext?: TenantContext,
): Promise<XrogaConnectCatalogToolkit[]> {
  const actor=requireComposioActor(userId,tenantContext);
  const prefix = xrogaCustomToolkitPrefix(userId);
  const collected: XrogaConnectCatalogToolkit[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const page = await listComposioCatalog({
      sortBy: 'alphabetically',
      limit: MAX_CATALOG_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
      fresh:true,
    },actor);

    for (const item of page.items) {
      if (
        item.slug.toLowerCase().startsWith(prefix) &&
        !collected.some((existing) => existing.slug === item.slug)
      ) {
        collected.push(item);
      }
    }

    cursor = page.nextCursor;
    pages += 1;
  } while (cursor && pages < 20);

  return collected;
}

export async function createUserCustomMcpToolkit(
  userId: string,
  input: XrogaCustomMcpCreateInput,
  tenantContext?: TenantContext,
  admission?:ComposioControlAdmission,
): Promise<ComposioControlPending|{
  slug: string;
  toolkit?: XrogaConnectCatalogToolkit;
  initialSync?: XrogaCustomMcpSyncResult;
}> {
  const actor=requireComposioActor(userId,tenantContext);
  input=structuredClone(input);
  if(!['none','api_key','dcr_oauth'].includes(input.authMode)||classifyOutboundData(input,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) {
    throw new ComposioClientError('Custom MCP name is too short.', {
      status: 400,
      code: 'INVALID_CUSTOM_MCP_NAME',
    });
  }

  const serverUrl = validateCustomMcpUrl(input.serverUrl, 'Server URL');
  const registrationSlug = xrogaCustomToolkitRegistrationSlug(userId, name);
  const expectedSlug = `CUSTOM_${registrationSlug}`.toLowerCase();

  const existing = await listUserCustomMcpToolkits(userId,actor);
  if (existing.some((item) => item.slug.toLowerCase() === expectedSlug)) {
    throw new ComposioClientError(
      'A Custom MCP with this name already exists. Remove it before changing its server or authentication mode.',
      {
        status: 409,
        code: 'CUSTOM_MCP_ALREADY_EXISTS',
      },
    );
  }

  let authScheme: Record<string, unknown>;

  if (input.authMode === 'api_key') {
    const headerName = (input.headerName || 'Authorization').trim();
    if (!/^[A-Za-z0-9-]{1,80}$/.test(headerName)) {
      throw new ComposioClientError('API-key header name is invalid.', {
        status: 400,
        code: 'INVALID_CUSTOM_MCP_HEADER',
      });
    }

    const prefix = (input.headerPrefix ?? 'Bearer ').slice(0, 80);
    authScheme = {
      mode: 'API_KEY',
      headers: {
        [headerName]: `${prefix}{{generic_api_key}}`,
      },
      api_key_field: {
        display_name: 'API key',
        description: `Credential sent through the ${headerName} header.`,
      },
    };
  } else if (input.authMode === 'dcr_oauth') {
    if (!input.discoveryUrl?.trim()) {
      throw new ComposioClientError(
        'OAuth discovery URL is required for DCR OAuth.',
        {
          status: 400,
          code: 'CUSTOM_MCP_DISCOVERY_REQUIRED',
        },
      );
    }

    authScheme = {
      mode: 'DCR_OAUTH',
      discovery_url: validateCustomMcpUrl(
        input.discoveryUrl,
        'OAuth discovery URL',
      ),
    };
  } else {
    authScheme = {
      mode: 'NO_AUTH',
    };
  }

  const parameters={resource:expectedSlug,connection:composioControlSource(actor),input};
  if(!admission)return prepareComposioControl(actor,'CREATE_CUSTOM_MCP',parameters,`Register the exact remote MCP ${name} at ${serverUrl}, using ${input.authMode}. Its tool metadata remains untrusted. Registration does not authorize tool execution.`);
  const {beforeDispatch}=requireComposioControl(admission,actor,'CREATE_CUSTOM_MCP',parameters);

  const response =
    await composioRequest<ComposioCustomToolkitUpsertResponse>(
      '/custom/toolkits/upsert',
      {
        method: 'POST',
        beforeDispatch,
        body: {
          slug: registrationSlug,
          toolkit_config: {
            name,
            app_url: serverUrl,
            auth_schemes: [authScheme],
          },
        },
      },actor
    );

  const slug = response.slug?.trim().toLowerCase();
  if (slug!==expectedSlug) {
    throw new ComposioClientError(
      'Custom MCP registration returned an invalid toolkit identifier.',
      {
        status: 502,
        code: 'CUSTOM_MCP_INVALID_RESPONSE',
      },
    );
  }

  if (input.authMode !== 'none') {
    const auth=await composioRequest<{toolkit?:{slug?:string};auth_config?:{id?:string;auth_scheme?:string;is_composio_managed?:boolean}}>('/auth_configs', {
      method: 'POST',
      beforeDispatch,
      body: {
        toolkit: {
          slug,
        },
        auth_config: {
          type: 'use_custom_auth',
          authScheme:
            input.authMode === 'api_key'
              ? 'API_KEY'
              : 'DCR_OAUTH',
          credentials: {},
          is_enabled_for_tool_router: true,
        },
      },
    },actor);
    if(auth.toolkit?.slug?.toLowerCase()!==slug||!/^ac_[A-Za-z0-9_-]{1,190}$/.test(auth.auth_config?.id??'')||auth.auth_config?.is_composio_managed!==false||auth.auth_config.auth_scheme!==(input.authMode==='api_key'?'API_KEY':'DCR_OAUTH'))throw new AuthorityError('COMPOSIO_CUSTOM_AUTH_CONFIG_NOT_VERIFIED');
  }

  clearComposioCatalogCache();

  // Composio starts initial synchronization on registration. A separate sync
  // remains an independently reviewed action, never an automatic denial retry.

  const toolkit=await getComposioCatalogToolkit(slug,actor);
  if(toolkit.slug!==expectedSlug||toolkit.appUrl!==serverUrl)throw new AuthorityError('COMPOSIO_CUSTOM_MCP_READBACK_REQUIRED');

  return {
    slug,
    toolkit,
  };
}

export async function syncUserCustomMcpToolkit(
  userId: string,
  input: {
    toolkit: string;
    connectedAccountId?: string;
  },
  tenantContext?: TenantContext,
  admission?:ComposioControlAdmission,
): Promise<ComposioControlPending|XrogaCustomMcpSyncResult> {
  const actor=requireComposioActor(userId,tenantContext);
  input=structuredClone(input);
  const toolkit = cleanToolkit(input.toolkit);

  if (!toolkit.startsWith(xrogaCustomToolkitPrefix(userId))) {
    throw new ComposioClientError('Custom MCP was not found.', {
      status: 404,
      code: 'CUSTOM_MCP_NOT_FOUND',
    });
  }

  const metadata=await getComposioCatalogToolkit(toolkit,actor);
  if(!metadata.appUrl)throw new AuthorityError('COMPOSIO_CUSTOM_MCP_SOURCE_UNAVAILABLE');
  publicHttpsUrl(metadata.appUrl);
  if(input.connectedAccountId||!metadata.noAuth){
    const session=await createReadOnlyComposioSession(userId,actor),accounts=await listConnectedComposioToolkits(userId,{sessionId:session.session_id,toolkits:[toolkit]},actor);
    if(!input.connectedAccountId||!accounts.some(item=>item.connected&&item.toolkit===toolkit&&item.connectedAccountId===input.connectedAccountId))throw new AuthorityError('COMPOSIO_CUSTOM_MCP_ACCOUNT_DENIED');
  }
  const parameters={resource:toolkit,connection:composioControlSource(actor),source:{appUrl:metadata.appUrl,authSchemes:metadata.authSchemes,noAuth:metadata.noAuth},input};
  if(!admission)return prepareComposioControl(actor,'SYNC_CUSTOM_MCP',parameters,`Re-fetch untrusted tool definitions from ${metadata.appUrl} for ${toolkit}, using only the displayed owned connection. This does not authorize tool execution.`);
  const approval=requireComposioControl(admission,actor,'SYNC_CUSTOM_MCP',parameters),beforeDispatch=async()=>{
    await approval.beforeDispatch();const current=await getComposioCatalogToolkit(toolkit,actor);
    if(preparedActionDigest({appUrl:current.appUrl,authSchemes:current.authSchemes,noAuth:current.noAuth})!==preparedActionDigest(parameters.source))throw new AuthorityError('COMPOSIO_CUSTOM_MCP_SOURCE_CHANGED');
    if(input.connectedAccountId){const session=await createReadOnlyComposioSession(userId,actor),accounts=await listConnectedComposioToolkits(userId,{sessionId:session.session_id,toolkits:[toolkit]},actor);if(!accounts.some(item=>item.connected&&item.connectedAccountId===input.connectedAccountId))throw new AuthorityError('COMPOSIO_CUSTOM_MCP_ACCOUNT_DENIED');}
    await approval.check();
  };

  const response =
    await composioRequest<ComposioCustomToolkitSyncResponse>(
      '/custom/toolkits/sync',
      {
        method: 'POST',
        beforeDispatch,
        body: {
          slug: toolkit,
          ...(input.connectedAccountId
            ? {
                connected_account_id:
                  input.connectedAccountId,
              }
            : {}),
        },
        timeoutMs: EXECUTE_TIMEOUT_MS,
      },actor
    );

  clearComposioCatalogCache();

  if(response.slug?.toLowerCase()!==toolkit||typeof response.version!=='string'||!response.version||response.version.length>100||!Number.isSafeInteger(response.synced_count)||Number(response.synced_count)<0)throw new AuthorityError('COMPOSIO_CUSTOM_MCP_SYNC_NOT_VERIFIED');

  return {
    slug: response.slug?.trim().toLowerCase() || toolkit,
    ...(response.version
      ? {
          version: response.version,
        }
      : {}),
    ...(typeof response.synced_count === 'number'
      ? {
          syncedCount: response.synced_count,
        }
      : {}),
  };
}

export async function deleteUserCustomMcpToolkit(
  userId: string,
  toolkitSlug: string,
  tenantContext?: TenantContext,
  admission?:ComposioControlAdmission,
): Promise<ComposioControlPending|{
  slug: string;
  deleted: boolean;
}> {
  const actor=requireComposioActor(userId,tenantContext);
  const toolkit = cleanToolkit(toolkitSlug);

  if (!toolkit.startsWith(xrogaCustomToolkitPrefix(userId))) {
    throw new ComposioClientError('Custom MCP was not found.', {
      status: 404,
      code: 'CUSTOM_MCP_NOT_FOUND',
    });
  }

  const metadata=await getComposioCatalogToolkit(toolkit,actor),parameters={resource:toolkit,connection:composioControlSource(actor),source:{appUrl:metadata.appUrl??null,authSchemes:metadata.authSchemes,noAuth:metadata.noAuth},input:{toolkit}};
  if(!admission)return prepareComposioControl(actor,'DELETE_CUSTOM_MCP',parameters,`Delete only ${toolkit} and its associated custom authentication configurations and connected accounts. This revokes access to that registered MCP.`);
  const approval=requireComposioControl(admission,actor,'DELETE_CUSTOM_MCP',parameters),beforeDispatch=async()=>{
    await approval.beforeDispatch();const current=await getComposioCatalogToolkit(toolkit,actor);
    if(preparedActionDigest({appUrl:current.appUrl??null,authSchemes:current.authSchemes,noAuth:current.noAuth})!==preparedActionDigest(parameters.source))throw new AuthorityError('COMPOSIO_CUSTOM_MCP_SOURCE_CHANGED');await approval.check();
  };

  const response =
    await composioRequest<ComposioCustomToolkitDeleteResponse>(
      `/custom/toolkits/${encodeURIComponent(toolkit)}`,
      {
        method: 'DELETE',
        beforeDispatch,
      },actor
    );

  clearComposioCatalogCache();

  if(response.slug?.toLowerCase()!==toolkit||response.deleted!==true)throw new AuthorityError('COMPOSIO_CUSTOM_MCP_DELETE_NOT_VERIFIED');

  return {
    slug: response.slug?.trim().toLowerCase() || toolkit,
    deleted: response.deleted === true,
  };
}

function getComposioApiKey(): string {
  const key = process.env.COMPOSIO_API_KEY?.trim();

  if (!key) {
    throw new ComposioClientError('Xroga Connect is not configured.', {
      status: 503,
      code: 'COMPOSIO_NOT_CONFIGURED',
    });
  }

  return key;
}

export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim());
}

function composioUserId(userId: string): string {
  const clean = userId.trim();

  if (!clean) {
    throw new ComposioClientError('Authenticated Xroga user is required.', {
      status: 401,
      code: 'XROGA_USER_REQUIRED',
    });
  }

  return `xroga:${clean}`;
}

function cleanSessionId(sessionId: string): string {
  if(classifyOutboundData({value:sessionId},'PUBLIC').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  const clean = sessionId.trim();

  if (!/^trs_[A-Za-z0-9_-]+$/.test(clean)) {
    throw new ComposioClientError('Invalid Xroga Connect session.', {
      status: 400,
      code: 'INVALID_COMPOSIO_SESSION',
    });
  }

  return clean;
}

function cleanToolkit(toolkit: string): string {
  if(classifyOutboundData({value:toolkit},'PUBLIC').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  const clean = toolkit.trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(clean)) {
    throw new ComposioClientError('Invalid integration identifier.', {
      status: 400,
      code: 'INVALID_COMPOSIO_TOOLKIT',
    });
  }

  return clean;
}

function cleanToolSlug(toolSlug: string): string {
  if(classifyOutboundData({value:toolSlug},'PUBLIC').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  const clean = toolSlug.trim();

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$/.test(clean)) {
    throw new ComposioClientError('Invalid external tool.', {
      status: 400,
      code: 'INVALID_COMPOSIO_TOOL',
    });
  }

  if (clean.toUpperCase().startsWith('COMPOSIO_')) {
    throw new ComposioClientError(
      'Xroga internal integration tools are not exposed through Plugins.',
      {
        status: 403,
        code: 'COMPOSIO_META_TOOL_BLOCKED',
      },
    );
  }

  return clean;
}

function mapCatalogToolkit(
  item: ComposioCatalogToolkitResponse,
): XrogaConnectCatalogToolkit | null {
  const slug = item.slug?.trim().toLowerCase();

  if (!slug) return null;

  const name = item.name?.trim() || slug
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const toolkit: XrogaConnectCatalogToolkit = {
    slug,
    name,
    type: item.type,
    authSchemes: Array.isArray(item.auth_schemes)
      ? item.auth_schemes.filter((value): value is string => typeof value === 'string')
      : [],
    managedAuthSchemes: Array.isArray(item.composio_managed_auth_schemes)
      ? item.composio_managed_auth_schemes.filter((value): value is string => typeof value === 'string')
      : [],
    noAuth: item.no_auth === true,
    authGuideUrl: item.auth_guide_url,
    description: item.meta?.description,
    logo: item.meta?.logo,
    appUrl: item.meta?.app_url,
    categories: Array.isArray(item.meta?.categories)
      ? item.meta!.categories!
          .filter(
            (category): category is { id: string; name: string } =>
              typeof category.id === 'string' &&
              category.id.length > 0 &&
              typeof category.name === 'string' &&
              category.name.length > 0,
          )
          .map((category) => ({
            id: category.id,
            name: category.name,
          }))
      : [],
    triggersCount:
      typeof item.meta?.triggers_count === 'number'
        ? Math.max(0, item.meta.triggers_count)
        : 0,
    toolsCount:
      typeof item.meta?.tools_count === 'number'
        ? Math.max(0, item.meta.tools_count)
        : 0,
    version: item.meta?.version,
    // Composio also uses `deprecated` for a legacy metadata object containing
    // toolkitId/proxy details. Only actual boolean flags mean retired.
    deprecated: item.is_deprecated === true || item.deprecated === true,
  };

  return {
    ...toolkit,
    xrogaGroup: xrogaCatalogGroupFor(toolkit),
  };
}
function toolTokens(toolSlug: string): string[] {
  return toolSlug
    .toUpperCase()
    .split(/[^A-Z0-9]+/g)
    .filter(Boolean);
}

const DESTRUCTIVE_TOKENS = new Set([
  'DELETE',
  'DESTROY',
  'DROP',
  'PURGE',
  'REMOVE',
  'REVOKE',
  'REFUND',
  'TRANSFER',
  'CHARGE',
  'PAY',
  'PAYMENT',
  'PURCHASE',
  'BUY',
  'CANCEL',
  'TERMINATE',
  'VOID',
  'GRANT',
  'INVITE',
  'PERMISSION',
  'PERMISSIONS',
  'ACL',
  'SHARE',
  'SHARING',
  'OWNER',
  'OWNERSHIP',
  'ROLE',
]);

const WRITE_TOKENS = new Set([
  'SEND',
  'CREATE',
  'UPDATE',
  'MODIFY',
  'EDIT',
  'WRITE',
  'POST',
  'PUBLISH',
  'UNPUBLISH',
  'UPLOAD',
  'MOVE',
  'RENAME',
  'INVITE',
  'GRANT',
  'ARCHIVE',
  'UNARCHIVE',
  'REPLY',
  'REACT',
  'ADD',
  'SET',
  'ENABLE',
  'DISABLE',
  'APPROVE',
  'REJECT',
  'ACCEPT',
  'DECLINE',
  'MARK',
  'SUBMIT',
]);

const READ_TOKENS = new Set(['GET','LIST','SEARCH','FETCH','FIND','READ','RETRIEVE','LOOKUP','QUERY','DESCRIBE','INSPECT','VIEW','CHECK','DOWNLOAD']);

export function classifyComposioToolRisk(
  toolSlug: string,
  tags: readonly string[] = [],
): XrogaConnectToolRisk {
  if (tags.includes(DESTRUCTIVE_TAG)) {
    return 'destructive';
  }

  const tokens = toolTokens(toolSlug);

  if (tokens.some((token) => DESTRUCTIVE_TOKENS.has(token))) {
    return 'destructive';
  }

  if (tokens.some((token) => WRITE_TOKENS.has(token))) {
    return 'write';
  }

  // Remote readOnlyHint is descriptive data. It cannot downgrade a write or
  // turn an opaque operation into a locally admitted read capability.
  if(tokens.some(token=>READ_TOKENS.has(token)))return 'read';

  return 'unknown';
}

function looksMutatingToolSlug(toolSlug: string): boolean {
  const risk = classifyComposioToolRisk(toolSlug);
  return risk === 'write' || risk === 'destructive';
}

function validateCallbackUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ComposioClientError('Invalid integration callback URL.', {
      status: 500,
      code: 'INVALID_COMPOSIO_CALLBACK',
    });
  }

  const expected=new URL('/dashboard/integrations/connect/callback',(process.env.FRONTEND_URL?.trim()||'https://xroga.com').replace(/\/$/, '')+'/');
  const localHttp=process.env.NODE_ENV!=='production'&&expected.protocol==='http:'&&['localhost','127.0.0.1'].includes(expected.hostname);
  if((expected.protocol!=='https:'&&!localHttp)||url.href!==expected.href||url.username||url.password||url.search||url.hash){
    throw new ComposioClientError('Unsafe integration callback URL.',{status:400,code:'UNSAFE_COMPOSIO_CALLBACK'});
  }

  return url.toString();
}

async function composioRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
    beforeDispatch?:()=>Promise<void>;
  } = {},
  tenantContext?: TenantContext,
): Promise<T> {
  const method=options.method??'GET',context=tenantContext===undefined?undefined:requireTenantContext(tenantContext);
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[\\\x00-\x20\x7f#]/.test(path)||/%(?:2e|2f|5c)/i.test(path.split('?')[0]))throw new EgressDenied('UNSAFE_DESTINATION');
  const url=new URL(COMPOSIO_API_BASE+path),relative=url.pathname.slice('/api/v3.1'.length);
  if(url.origin!=='https://backend.composio.dev'||!url.pathname.startsWith('/api/v3.1/')||!['GET','POST','DELETE'].includes(method))throw new EgressDenied('UNSAFE_DESTINATION');
  const publicMetadata=method==='GET'&&/^\/(?:toolkits(?:\/[A-Za-z0-9_-]+(?:\/tools)?)?|tools(?:\/[A-Za-z0-9_-]+)?|triggers_types(?:\/[A-Za-z0-9_-]+)?)$/.test(relative);
  if(!publicMetadata)requireTenantContext(context);
  const credential=currentComposioCredential(context),body=options.body===undefined?undefined:JSON.stringify(options.body),signal=options.signal,timeout=options.timeoutMs??DEFAULT_TIMEOUT_MS;
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>EXECUTE_TIMEOUT_MS||body!==undefined&&Buffer.byteLength(body)>128000)throw new EgressDenied('INVALID_EGRESS_INPUT');
  const check=()=>{signal?.throwIfAborted();if(context)requireTenantContext(context);if(currentComposioCredential(context)!==credential)throw new AuthorityError('COMPOSIO_CREDENTIAL_CHANGED');};
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeout,
  );

  try {
    if(options.beforeDispatch)await options.beforeDispatch();
    controller.signal.throwIfAborted();check();
    const response = await fetch(url.href, {
      method,
      redirect:'manual',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': credential,
      },
      body,
      signal: AbortSignal.any([controller.signal,...(signal?[signal]:[])]),
    });
    check();
    if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);throw new AuthorityError('COMPOSIO_PROVIDER_AUTHORIZATION_DENIED');}

    if(response.redirected||response.status>=300&&response.status<400){
      await response.body?.cancel().catch(()=>undefined);
      throw new EgressDenied('UNSAFE_DESTINATION');
    }

    const declaredLength = Number(
      response.headers.get('content-length') ?? 0,
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_RESPONSE_SIZE
    ) {
      await response.body?.cancel().catch(()=>undefined);
      throw new ComposioClientError(
        'External integration response was too large.',
        {
          status: 502,
          code: 'COMPOSIO_RESPONSE_TOO_LARGE',
        },
      );
    }

    const chunks:Uint8Array[]=[];let size=0;const reader=response.body?.getReader();
    try{
      if(reader)for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
        if(size>MAX_RESPONSE_SIZE)throw new ComposioClientError('External integration response was too large.',{status:502,code:'COMPOSIO_RESPONSE_TOO_LARGE'});
        chunks.push(next.value);
      }
    }finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
    const text=Buffer.concat(chunks).toString('utf8');
    check();

    let payload: unknown = {};

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ComposioClientError(
          'External integration returned invalid data.',
          {
            status: 502,
            code: 'COMPOSIO_INVALID_RESPONSE',
          },
        );
      }
    }

    if (!response.ok) {
      let message = 'Xroga Connect could not complete the external request.';

      if (response.status === 401 || response.status === 403) {
        message = 'Xroga Connect authorization failed.';
      } else if (response.status === 400 || response.status === 422) {
        message = 'Xroga Connect rejected this app request. Please check the selected app and required details, then try again.';
      } else if (response.status === 404) {
        message = 'The requested Xroga Connect resource was not found.';
      } else if (response.status === 409) {
        message = 'Xroga Connect reported a conflict with this app request. Refresh the connection and try again.';
      } else if (response.status === 408) {
        message = 'Xroga Connect request timed out.';
      } else if (response.status === 413) {
        message = 'The external request was too large.';
      } else if (response.status === 429) {
        message = 'Xroga Connect is temporarily rate limited.';
      } else if (response.status >= 500) {
        message = 'Xroga Connect is temporarily unavailable. Please try again shortly.';
      }

      throw new ComposioClientError(message, {
        status: response.status >= 500 ? 502 : response.status,
        code: 'COMPOSIO_UPSTREAM_ERROR',
      });
    }

    return payload as T;
  } catch (error) {
    // Caller cancellation is terminal, not a provider timeout or retry signal.
    signal?.throwIfAborted();
    if (error instanceof ComposioClientError || error instanceof EgressDenied ||error instanceof AuthorityError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ComposioClientError('Xroga Connect timed out.', {
        status: 504,
        code: 'COMPOSIO_TIMEOUT',
      });
    }

    throw new ComposioClientError('Xroga Connect is temporarily unavailable.', {
      status: 502,
      code: 'COMPOSIO_NETWORK_ERROR',
    });
  } finally {
    clearTimeout(timer);
  }
}

function enabledSessionTags(
  config: ComposioSessionConfig | undefined,
): string[] {
  const tags = config?.tags;

  if (!tags) {
    return [];
  }

  if (Array.isArray(tags)) {
    return tags.filter(
      (tag): tag is string => typeof tag === 'string',
    );
  }

  return [...(tags.enabled ?? []), ...(tags.enable ?? [])];
}

async function getCurrentSessionConfig(
  sessionId: string,
  session: ComposioSession,
  requireTags: boolean,
  tenantContext?: TenantContext,
): Promise<ComposioSessionConfig | undefined> {
  const actor=requireTenantContext(tenantContext);
  if (
    session.config?.user_id &&
    (!requireTags || enabledSessionTags(session.config).length > 0)
  ) {
    return session.config;
  }

  const history = await composioRequest<ComposioConfigHistoryResponse>(
    `/tool_router/session/${encodeURIComponent(
      sessionId,
    )}/config_history?limit=1`,{},actor
  );

  const current=history.items?.filter(item=>item.is_current===true);
  if(current?.length!==1||!current[0].config)throw new AuthorityError('COMPOSIO_CURRENT_CONFIG_UNAVAILABLE');
  return current[0].config;
}

function validateSafeRuntimeConfig(
  config: ComposioSessionConfig | undefined,
): void {
  const sandbox = config?.sandbox ?? config?.workbench;

  if (sandbox?.enable === true) {
    throw new ComposioClientError(
      'Xroga Connect rejected a session with sandbox access enabled.',
      {
        status: 403,
        code: 'COMPOSIO_SANDBOX_BLOCKED',
      },
    );
  }

  if (
    sandbox?.proxy_execution_enabled === true ||
    sandbox?.enable_proxy_execution === true
  ) {
    throw new ComposioClientError(
      'Xroga Connect rejected a session with proxy execution enabled.',
      {
        status: 403,
        code: 'COMPOSIO_PROXY_EXECUTION_BLOCKED',
      },
    );
  }

  if (config?.execute?.enable_multi_execute === true) {
    throw new ComposioClientError(
      'Xroga Connect rejected a session with multi-execution enabled.',
      {
        status: 403,
        code: 'COMPOSIO_MULTI_EXECUTE_BLOCKED',
      },
    );
  }
}

function validateReadOnlyConfig(
  config: ComposioSessionConfig | undefined,
): void {
  const enabled = enabledSessionTags(config);

  if (!enabled.includes(READ_ONLY_TAG)) {
    throw new ComposioClientError(
      'Xroga Connect session is missing the required read-only policy.',
      {
        status: 403,
        code: 'COMPOSIO_READ_ONLY_POLICY_MISSING',
      },
    );
  }

  if (enabled.includes(DESTRUCTIVE_TAG)) {
    throw new ComposioClientError(
      'Xroga Connect rejected an unsafe read-only session policy.',
      {
        status: 403,
        code: 'COMPOSIO_UNSAFE_POLICY',
      },
    );
  }
}

async function createComposioSession(
  userId: string,
  mode: XrogaConnectMode,
  tenantContext?: TenantContext,
): Promise<ComposioSession> {
  const actor=requireComposioActor(userId,tenantContext);
  const body: Record<string, unknown> = {
    user_id: composioUserId(userId),
    workbench: {
      enable: false,
      enable_proxy_execution: false,
    },
    search: {
      enable: true,
    },
    execute: {
      enable_multi_execute: false,
    },
    manage_connections: {
      enable: true,
      enable_wait_for_connections: false,
      enable_connection_removal: false,
    },
  };

  if (mode === 'read') {
    body.tags = [READ_ONLY_TAG];
  }

  const session = await composioRequest<ComposioSession>(
    '/tool_router/session',
    {
      method: 'POST',
      body,
    },actor
  );

  if (!session.session_id || !session.session_id.startsWith('trs_')) {
    throw new ComposioClientError(
      'Xroga Apps could not start a valid connection session.',
      {
        status: 502,
        code: 'COMPOSIO_SESSION_MISSING',
      },
    );
  }

  // Session creation is a provider receipt, never ownership proof by itself.
  return assertComposioSession(userId,session.session_id,mode,actor);
}

export async function createReadOnlyComposioSession(
  userId: string,
  tenantContext?: TenantContext,
): Promise<ComposioSession> {
  const actor=requireComposioActor(userId,tenantContext);
  return createComposioSession(userId, 'read',actor);
}

export async function createActionComposioSession(
  userId: string,
  tenantContext?: TenantContext,
): Promise<ComposioSession> {
  const actor=requireComposioActor(userId,tenantContext);
  return createComposioSession(userId, 'action',actor);
}

export async function getComposioSession(
  sessionId: string,
  tenantContext?: TenantContext,
): Promise<ComposioSession> {
  const actor=requireTenantContext(tenantContext);
  const clean = cleanSessionId(sessionId);

  const session=await composioRequest<ComposioSession>(
    `/tool_router/session/${encodeURIComponent(clean)}`,{},actor
  );
  if(session.session_id!==clean)throw new AuthorityError('COMPOSIO_SESSION_CHANGED');
  const config=await getCurrentSessionConfig(clean,session,false,actor),owners=[session.config?.user_id,config?.user_id].filter(value=>typeof value==='string'&&value.length>0);
  if(!owners.length||owners.some(owner=>owner!==composioUserId(actor.userId)))throw new AuthorityError('COMPOSIO_SESSION_FORBIDDEN');
  validateSafeRuntimeConfig(config);return{...session,config};
}

export async function assertComposioSession(
  userId: string,
  sessionId: string,
  mode: XrogaConnectMode,
  tenantContext?: TenantContext,
): Promise<ComposioSession> {
  const actor=requireComposioActor(userId,tenantContext);
  const clean = cleanSessionId(sessionId);
  const session = await getComposioSession(clean,actor);
  const currentConfig = await getCurrentSessionConfig(
    clean,
    session,
    mode === 'read',actor
  );
  const expectedUserId = composioUserId(userId);

  const owners = [session.config?.user_id, currentConfig?.user_id].filter(
    (value): value is string =>
      typeof value === 'string' && value.length > 0,
  );

  if (owners.length === 0) {
    throw new ComposioClientError(
      'Xroga Connect could not verify session ownership.',
      {
        status: 403,
        code: 'COMPOSIO_SESSION_OWNER_MISSING',
      },
    );
  }

  if (owners.some((owner) => owner !== expectedUserId)) {
    throw new ComposioClientError(
      'Xroga Connect session does not belong to this user.',
      {
        status: 403,
        code: 'COMPOSIO_SESSION_FORBIDDEN',
      },
    );
  }

  validateSafeRuntimeConfig(currentConfig);

  if (mode === 'read') {
    validateReadOnlyConfig(currentConfig);
  }

  return {
    ...session,
    config: currentConfig ?? session.config,
  };
}

export async function assertReadOnlyComposioSession(
  userId: string,
  sessionId: string,
  tenantContext?: TenantContext,
): Promise<ComposioSession> {
  const actor=requireComposioActor(userId,tenantContext);
  return assertComposioSession(userId, sessionId, 'read',actor);
}

function mapSearchTool(
  tool: ComposioToolSchema & {
    toolkit: string;
    tool_slug: string;
  },
  mode: XrogaConnectMode,
): XrogaConnectTool {
  const risk =
    mode === 'read'
      ? 'read'
      : classifyComposioToolRisk(tool.tool_slug);

  return {
    slug: tool.tool_slug,
    toolkit: tool.toolkit,
    description: tool.description,
    inputSchema: tool.input_schema,
    risk,
    requiresConfirmation: risk === 'destructive',
  };
}

export async function searchComposioTools(
  userId: string,
  input: {
    query: string;
    sessionId?: string;
    mode?: XrogaConnectMode;
  },
  tenantContext?: TenantContext,
): Promise<XrogaConnectSearchResult> {
  const actor=requireComposioActor(userId,tenantContext);
  input=structuredClone(input);
  const query = input.query.trim();
  if(classifyOutboundData({query},'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');

  if (query.length < 2 || query.length > 500) {
    throw new ComposioClientError(
      'Search query must be between 2 and 500 characters.',
      {
        status: 400,
        code: 'INVALID_COMPOSIO_QUERY',
      },
    );
  }

  const mode = input.mode ?? 'read';
  const session = input.sessionId
    ? await assertComposioSession(userId, input.sessionId, mode,actor)
    : await createComposioSession(userId, mode,actor);

  // Discovery receives a finite server vocabulary and provider-owned app IDs.
  // Names, recipients, private project text and query values stay local for the
  // existing selector. Metadata never supplies execution authority.
  const connected=await listSessionComposioToolkits(userId,{sessionId:session.session_id,mode,connectedOnly:true},actor);
  const apps=connected.filter(item=>item.connected&&!item.toolkit.toLowerCase().startsWith('custom_')&&/^[a-z0-9_-]{1,80}$/i.test(item.toolkit)).map(item=>item.toolkit.toLowerCase()).slice(0,20);
  const vocabulary=['get','list','find','search','read','send','create','update','delete','archive','upload','download','publish','message','email','task','issue','file','event','contact','row','record','invoice','calendar','channel','document','spreadsheet'];
  const words=new Set(query.toLowerCase().match(/[a-z]+/g)??[]),terms=vocabulary.filter(word=>words.has(word));
  const publicQuery=`Find ${mode} tools for ${apps.join(', ')||'available applications'}: ${terms.join(' ')||'available operations'}.`;
  const payload={queries:[{use_case:publicQuery}],search_strategy:'tool_search'};
  const digest=preparedActionDigest(payload);
  await enforceEgress({context:actor,actionClass:'READ',destination:COMPOSIO_API_BASE,recipient:'composio-owned-session-metadata',purpose:'finite-tool-discovery',payload,declaredClass:'PUBLIC',toolTrust:'SERVER_REGISTERED',binding:{userId,provider:'composio',connectedAccountId:'catalog',operation:'DISCOVER_TOOL_METADATA',targetDigest:digest,planDigest:digest}},receipt=>persistSecurityDecision(actor,receipt));
  await assertComposioSession(userId,session.session_id,mode,actor);

  const response = await composioRequest<ComposioSearchResponse>(
    `/tool_router/session/${encodeURIComponent(session.session_id)}/search`,
    {
      method: 'POST',
      body: payload,
    },actor
  );

  const tools = Object.values(response.tool_schemas ?? {})
    .filter(
      (
        tool,
      ): tool is ComposioToolSchema & {
        toolkit: string;
        tool_slug: string;
      } => Boolean(tool.toolkit && tool.tool_slug),
    )
    .filter(
      (tool) => !tool.tool_slug.toUpperCase().startsWith('COMPOSIO_'),
    )
    .filter(
      (tool) => mode === 'action' || !looksMutatingToolSlug(tool.tool_slug),
    )
    .filter(
      (tool) =>
        canUserAccessComposioToolkit(userId, tool.toolkit) &&
        canUserAccessComposioToolSlug(userId, tool.tool_slug),
    )
    .slice(0, MAX_SEARCH_RESULTS)
    .map((tool) => mapSearchTool(tool, mode));

  const toolkits = (response.toolkit_connection_statuses ?? [])
    .filter(
      (
        status,
      ): status is typeof status & {
        toolkit: string;
      } => Boolean(status.toolkit),
    )
    .filter((status) =>
      canUserAccessComposioToolkit(userId, status.toolkit),
    )
    .slice(0, MAX_SEARCH_RESULTS)
    .map((status) => ({
      toolkit: status.toolkit,
      description: status.description,
      connected: Boolean(status.has_active_connection),
      statusMessage: status.status_message,
    }));

  const searchResult = response.results?.[0];

  return {
    sessionId: session.session_id,
    mode,
    tools,
    toolkits,
    guidance: searchResult?.execution_guidance,
    ...(searchResult
      ? {
          skill: {
            useCase: searchResult.use_case,
            primaryToolSlugs: Array.isArray(searchResult.primary_tool_slugs)
              ? searchResult.primary_tool_slugs.filter((slug) =>
                  canUserAccessComposioToolSlug(userId, slug),
                )
              : [],
            relatedToolSlugs: Array.isArray(searchResult.related_tool_slugs)
              ? searchResult.related_tool_slugs.filter((slug) =>
                  canUserAccessComposioToolSlug(userId, slug),
                )
              : [],
            difficulty: searchResult.difficulty,
            recommendedPlanSteps: Array.isArray(searchResult.recommended_plan_steps)
              ? searchResult.recommended_plan_steps
              : [],
            knownPitfalls: Array.isArray(searchResult.known_pitfalls)
              ? searchResult.known_pitfalls
              : [],
          },
        }
      : {}),
  };
}

export async function searchComposioActionTools(
  userId: string,
  input: {
    query: string;
    sessionId?: string;
  },
  tenantContext?: TenantContext,
): Promise<XrogaConnectSearchResult> {
  const actor=requireComposioActor(userId,tenantContext);
  input=structuredClone(input);
  return searchComposioTools(userId, {
    ...input,
    mode: 'action',
  },actor);
}

async function listSessionComposioToolkits(
  userId: string,
  input: {
    sessionId: string;
    mode?: XrogaConnectMode;
    toolkits?: string[];
    connectedOnly?: boolean;
  },
  tenantContext?: TenantContext,
): Promise<XrogaConnectToolkit[]> {
  const actor=requireComposioActor(userId,tenantContext);
  input=structuredClone(input);
  const mode = input.mode ?? 'read';
  const sessionId = cleanSessionId(input.sessionId);

  await assertComposioSession(userId, sessionId, mode,actor);

  const toolkits = input.toolkits?.length
    ? [...new Set(input.toolkits.map(cleanToolkit))]
    : undefined;

  const collected: XrogaConnectToolkit[] = [];
  let cursor: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams();
    params.set('limit', String(MAX_TOOLKIT_PAGE_SIZE));

    if (input.connectedOnly) {
      params.set('is_connected', 'true');
    }

    if (toolkits?.length) {
      params.set('toolkits', toolkits.join(','));
    }

    if (cursor) {
      params.set('cursor', cursor);
    }

    const response = await composioRequest<ComposioSessionToolkitResponse>(
      `/tool_router/session/${encodeURIComponent(
        sessionId,
      )}/toolkits?${params.toString()}`,{},actor
    );

    if((response.items??[]).some(item=>item.connected_account?.user_id&&item.connected_account.user_id!==composioUserId(userId)))throw new AuthorityError('COMPOSIO_CONNECTED_ACCOUNT_OWNER_CHANGED');
    collected.push(
      ...(response.items ?? [])
        .filter(
          (
            item,
          ): item is typeof item & {
            slug: string;
          } => typeof item.slug === 'string' && item.slug.length > 0,
        )
        .map((item) => ({
          toolkit: item.slug,
          name: item.name,
          description: item.meta?.description,
          logo: item.meta?.logo,
          connected:
            item.is_no_auth === true || item.meta?.isNoAuth===true || Boolean(item.connected_account?.id&&item.connected_account.status?.toUpperCase()==='ACTIVE'),
          ...(item.connected_account?.id
            ? {
                connectedAccountId: item.connected_account.id,
              }
            : {}),
          statusMessage: item.connected_account?.status,
          noAuth:
            item.is_no_auth === true || item.meta?.isNoAuth === true,
        })),
    );

    cursor =
      typeof response.next_cursor === 'string' && response.next_cursor.length > 0
        ? response.next_cursor
        : undefined;
    pages += 1;

    if (toolkits?.length) {
      // Specific-toolkit lookups are expected to fit in one page.
      break;
    }
  } while (cursor && pages < 30);

  return collected.filter((item) =>
    canUserAccessComposioToolkit(userId, item.toolkit),
  );
}

export async function listComposioToolkits(
  userId: string,
  input: {
    sessionId: string;
    mode?: XrogaConnectMode;
    toolkits?: string[];
  },
  tenantContext?: TenantContext,
): Promise<XrogaConnectToolkit[]> {
  const actor=requireComposioActor(userId,tenantContext);
  input=structuredClone(input);
  return listSessionComposioToolkits(userId, {
    ...input,
    connectedOnly: false,
  },actor);
}

export async function listConnectedComposioToolkits(
  userId: string,
  input: {
    sessionId: string;
    mode?: XrogaConnectMode;
    toolkits?: string[];
  },
  tenantContext?: TenantContext,
): Promise<XrogaConnectToolkit[]> {
  const actor=requireComposioActor(userId,tenantContext);
  input=structuredClone(input);
  return listSessionComposioToolkits(userId, {
    ...input,
    connectedOnly: true,
  },actor);
}

export async function listComposioCatalog(
  input: {
    search?: string;
    category?: string;
    sortBy?: 'usage' | 'alphabetically';
    limit?: number;
    cursor?: string;
    fresh?:boolean;
  } = {},
  tenantContext?: TenantContext,
): Promise<XrogaConnectCatalogPage> {
  const actor=tenantContext===undefined?undefined:requireTenantContext(tenantContext);if(actor)requireComposioActor(actor.userId,actor);
  input=structuredClone(input);
  const params = new URLSearchParams();
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? 120), 1),
    MAX_CATALOG_PAGE_SIZE,
  );

  if(classifyOutboundData({search:input.search??'',category:input.category??'',cursor:input.cursor??''},'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  if(input.search?.trim()){
    const query=input.search.trim().toLowerCase();if(query.length>120)throw new ComposioClientError('Catalog search is too long.',{status:400,code:'INVALID_CATALOG_SEARCH'});
    const offsetMatch=input.cursor?.match(/^xroga-search-(\d+)$/);if(input.cursor&&!offsetMatch)throw new ComposioClientError('Restart this catalog search.',{status:400,code:'INVALID_CATALOG_CURSOR'});
    const offset=offsetMatch?Number(offsetMatch[1]):0;if(!Number.isSafeInteger(offset)||offset>10000)throw new ComposioClientError('Invalid catalog position.',{status:400,code:'INVALID_CATALOG_CURSOR'});
    const matches:XrogaConnectCatalogToolkit[]=[];let cursor:string|undefined,pages=0;
    do{
      const page=await listComposioCatalog({sortBy:input.sortBy,limit:MAX_CATALOG_PAGE_SIZE,...(input.category?{category:input.category}:{}),...(cursor?{cursor}:{}),fresh:input.fresh},actor);
      matches.push(...page.items.filter(item=>`${item.slug} ${item.name} ${item.description??''}`.toLowerCase().includes(query)));
      cursor=page.nextCursor;pages++;
    }while(cursor&&pages<20);
    if(cursor)throw new ComposioClientError('Catalog search exceeded its safe page limit. Narrow the app category.',{status:422,code:'CATALOG_SEARCH_LIMIT'});
    const items=matches.slice(offset,offset+limit),next=offset+items.length;
    return{items,totalItems:matches.length,currentPage:Math.floor(offset/limit)+1,totalPages:Math.max(1,Math.ceil(matches.length/limit)),...(next<matches.length?{nextCursor:`xroga-search-${next}`}:{})};
  }

  params.set('limit', String(limit));
  params.set('sort_by', input.sortBy ?? 'usage');
  params.set('managed_by', 'all');
  params.set('include_deprecated', 'false');

  if (input.category?.trim()) {
    params.set('category', input.category.trim());
  }

  if (input.cursor?.trim()) {
    params.set('cursor', input.cursor.trim());
  }

  const cacheKey = `catalog:${actor?.userId??'public'}:${params.toString()}`;

  return cachedComposioValue(cacheKey, async () => {
    const response = await composioRequest<ComposioCatalogToolkitListResponse>(
      `/toolkits?${params.toString()}`,{},actor
    );

    const items = (response.items ?? [])
      .map(mapCatalogToolkit)
      .filter(
        (item): item is XrogaConnectCatalogToolkit => Boolean(item),
      ).filter(item=>actor?canUserAccessComposioToolkit(actor.userId,item.slug):!item.slug.startsWith('custom_')&&canUserAccessComposioToolkit('',item.slug));

    return {
      items,
      ...(response.next_cursor
        ? {
            nextCursor: response.next_cursor,
          }
        : {}),
      totalPages: response.total_pages,
      currentPage: response.current_page,
      totalItems:
        typeof response.total_items === 'number'
          ? response.total_items
          : items.length,
    };
  },input.fresh===true);
}


export async function listComposioCatalogGroup(
  input: {
    group: XrogaCatalogGroup;
    limit?: number;
    cursor?: string;
  },
  tenantContext?: TenantContext,
): Promise<XrogaConnectCatalogPage> {
  const actor=tenantContext===undefined?undefined:requireTenantContext(tenantContext);if(actor)requireComposioActor(actor.userId,actor);
  input=structuredClone(input);
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? 120), 1),
    MAX_CATALOG_PAGE_SIZE,
  );
  const offsetMatch = input.cursor?.match(/^xroga-group-(\d+)$/);
  const offset = offsetMatch ? Number(offsetMatch[1]) : 0;

  return cachedComposioValue(
    `catalog:group:${actor?.userId??'public'}:${input.group}:all`,
    async () => {
      const items: XrogaConnectCatalogToolkit[] = [];
      let cursor: string | undefined;
      let pages = 0;

      do {
        const page = await listComposioCatalog({
          sortBy: 'usage',
          limit: MAX_CATALOG_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },actor);

        items.push(
          ...page.items.filter(
            (toolkit) =>
              (toolkit.xrogaGroup ?? xrogaCatalogGroupFor(toolkit)) ===
              canonicalXrogaCatalogGroup(input.group),
          ),
        );

        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 20);

      return {
        items,
        totalItems: items.length,
      };
    },
  ).then((all) => {
    const pageItems = all.items.slice(offset, offset + limit);
    const nextOffset = offset + pageItems.length;

    return {
      items: pageItems,
      totalItems: all.totalItems,
      currentPage: Math.floor(offset / limit) + 1,
      totalPages: Math.max(1, Math.ceil(all.totalItems / limit)),
      ...(nextOffset < all.totalItems
        ? { nextCursor: `xroga-group-${nextOffset}` }
        : {}),
    };
  });
}

export async function listComposioCatalogCategories(): Promise<
  Array<{ id: string; name: string }>
> {
  return cachedComposioValue('catalog:categories', async () => {
    const response =
      await composioRequest<ComposioCatalogCategoryListResponse>(
        '/toolkits/categories',
      );

    return (response.items ?? [])
      .filter(
        (item): item is { id: string; name: string } =>
          typeof item.id === 'string' &&
          item.id.length > 0 &&
          typeof item.name === 'string' &&
          item.name.length > 0,
      )
      .map((item) => ({
        id: item.id,
        name: item.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function getComposioCatalogToolkit(
  toolkitSlug: string,
  tenantContext?: TenantContext,
): Promise<XrogaConnectCatalogToolkit> {
  const actor=tenantContext===undefined?undefined:requireTenantContext(tenantContext);if(actor)requireComposioActor(actor.userId,actor);
  const slug = cleanToolkit(toolkitSlug);
  if(slug.startsWith('custom_')&&(!actor||!slug.startsWith(xrogaCustomToolkitPrefix(actor.userId))))throw new AuthorityError('COMPOSIO_CUSTOM_METADATA_FORBIDDEN');

  return cachedComposioValue(`catalog:toolkit:${slug}`, async () => {
    const response = await composioRequest<ComposioCatalogToolkitResponse>(
      `/toolkits/${encodeURIComponent(slug)}?version=latest`,{},actor
    );

    const toolkit = mapCatalogToolkit(response);

    if (!toolkit||toolkit.slug!==slug) {
      throw new ComposioClientError('Plugin metadata was not found.', {
        status: 404,
        code: 'COMPOSIO_TOOLKIT_NOT_FOUND',
      });
    }

    return toolkit;
  },slug.startsWith('custom_'));
}

export async function listComposioCatalogTools(
  toolkitSlug: string,
  input: {
    limit?: number;
    cursor?: string;
  } = {},
  tenantContext?: TenantContext,
): Promise<XrogaConnectCatalogToolPage> {
  const actor=tenantContext===undefined?undefined:requireTenantContext(tenantContext);if(actor)requireComposioActor(actor.userId,actor);
  input=structuredClone(input);
  const toolkit = cleanToolkit(toolkitSlug);
  if(toolkit.startsWith('custom_')&&(!actor||!toolkit.startsWith(xrogaCustomToolkitPrefix(actor.userId))))throw new AuthorityError('COMPOSIO_CUSTOM_METADATA_FORBIDDEN');
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? 250), 1),
    MAX_CATALOG_PAGE_SIZE,
  );

  const params = new URLSearchParams();
  params.set('toolkit_slug', toolkit);
  params.set('toolkit_versions', 'latest');
  params.set('include_deprecated', 'false');
  params.set('limit', String(limit));

  if (input.cursor?.trim()) {
    params.set('cursor', input.cursor.trim());
  }

  const cacheKey = `catalog:tools:${toolkit}:${params.toString()}`;

  return cachedComposioValue(cacheKey, async () => {
    const response = await composioRequest<ComposioCatalogToolListResponse>(
      `/tools?${params.toString()}`,{},actor
    );

    const items = (response.items ?? [])
      .filter(
        (item): item is ComposioCatalogToolResponse & { slug: string } =>
          typeof item.slug === 'string' && item.slug.length > 0,
      )
      .map((item) => {
        const tags = Array.isArray(item.tags)
          ? item.tags.filter((value): value is string => typeof value === 'string')
          : [];
        const risk = classifyComposioToolRisk(item.slug, tags);

        return {
          slug: item.slug,
          toolkit: item.toolkit?.slug || toolkit,
          name: item.name,
          description: item.description,
          scopes: Array.isArray(item.scopes)
            ? item.scopes.filter((value): value is string => typeof value === 'string')
            : [],
          tags,
          version: item.version,
          deprecated: item.is_deprecated === true,
          important: item.important === true,
          risk,
          requiresConfirmation: risk === 'destructive',
        };
      });

    return {
      items,
      ...(response.next_cursor
        ? {
            nextCursor: response.next_cursor,
          }
        : {}),
      totalPages: response.total_pages,
      currentPage: response.current_page,
      totalItems:
        typeof response.total_items === 'number'
          ? response.total_items
          : items.length,
    };
  });
}

export async function listComposioTriggerTypes(
  toolkitSlug: string,
  input: {
    limit?: number;
    cursor?: string;
  } = {},
  tenantContext?: TenantContext,
): Promise<XrogaConnectTriggerPage> {
  const actor=tenantContext===undefined?undefined:requireTenantContext(tenantContext);if(actor)requireComposioActor(actor.userId,actor);
  input=structuredClone(input);
  const toolkit = cleanToolkit(toolkitSlug);
  if(toolkit.startsWith('custom_')&&(!actor||!toolkit.startsWith(xrogaCustomToolkitPrefix(actor.userId))))throw new AuthorityError('COMPOSIO_CUSTOM_METADATA_FORBIDDEN');
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? MAX_TRIGGER_PAGE_SIZE), 1),
    MAX_TRIGGER_PAGE_SIZE,
  );

  const params = new URLSearchParams();
  params.set('toolkit_slugs', toolkit);
  params.set('toolkit_versions', 'latest');
  params.set('limit', String(limit));

  if (input.cursor?.trim()) {
    params.set('cursor', input.cursor.trim());
  }

  const cacheKey = `catalog:triggers:${toolkit}:${params.toString()}`;

  return cachedComposioValue(cacheKey, async () => {
    const response = await composioRequest<ComposioTriggerTypeListResponse>(
      `/triggers_types?${params.toString()}`,{},actor
    );

    const items = (response.items ?? [])
      .filter(
        (item): item is ComposioTriggerTypeResponse & { slug: string } =>
          typeof item.slug === 'string' && item.slug.length > 0,
      )
      .map((item) => ({
        slug: item.slug,
        name: item.name?.trim() || item.slug,
        description: item.description,
        instructions: item.instructions,
        type: item.type,
        version: item.version,
      }));

    return {
      items,
      ...(response.next_cursor
        ? {
            nextCursor: response.next_cursor,
          }
        : {}),
      totalPages: response.total_pages,
      currentPage: response.current_page,
      totalItems:
        typeof response.total_items === 'number'
          ? response.total_items
          : items.length,
    };
  });
}

export async function resolveComposioTriggerTarget(actor:TenantContext,input:{toolkit:string;triggerSlug:string;triggerConfig:Record<string,unknown>}){
  actor=requireComposioActor(actor.userId,actor);const userId=actor.userId;
  const toolkit = cleanToolkit(input.toolkit);
  const triggerSlug = input.triggerSlug.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,119}$/.test(triggerSlug)
    || !canUserAccessComposioToolkit(userId, toolkit)
    || JSON.stringify(input.triggerConfig).length > 8_000) {
    throw new ComposioClientError('This trigger is not available for your connected apps.', { status: 403, code: 'COMPOSIO_TRIGGER_NOT_ALLOWED' });
  }
  if(toolkit.startsWith('custom_'))throw new EgressDenied('UNTRUSTED_TOOL_REQUIRES_SANDBOX');
  if(classifyOutboundData(input.triggerConfig,'USER_PRIVATE').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  const type = await composioRequest<ComposioTriggerTypeResponse>(`/triggers_types/${encodeURIComponent(triggerSlug)}`,{},actor);
  if (type.toolkit?.slug?.trim().toLowerCase() !== toolkit) {
    throw new ComposioClientError('The selected trigger does not belong to that app.', { status: 422, code: 'COMPOSIO_TRIGGER_TOOLKIT_MISMATCH' });
  }
  const session = await createReadOnlyComposioSession(userId,actor);
  const connected = await listConnectedComposioToolkits(userId, { sessionId: session.session_id, toolkits: [toolkit] },actor);
  const account=connected.find(item=>item.connected&&item.toolkit.toLowerCase()===toolkit&&!item.noAuth&&item.connectedAccountId);
  if (!account?.connectedAccountId) {
    throw new ComposioClientError('Connect this app before enabling its trigger.', { status: 409, code: 'COMPOSIO_TRIGGER_CONNECTION_REQUIRED' });
  }
  return{toolkit,triggerSlug,connectedAccountId:account.connectedAccountId};
}

/** Called only inside the existing exact native configuration confirmation. */
export async function upsertComposioTriggerForUser(
  userId:string,
  input:{toolkit:string;triggerSlug:string;triggerConfig:Record<string,unknown>},
  tenantContext?:TenantContext,
  control?:{admission:ComposioControlAdmission;parameters:Record<string,unknown>;expectedAccount:string},
):Promise<string>{
  const actor=requireComposioActor(userId,tenantContext);input=structuredClone(input);
  if(!control)throw new AuthorityError('COMPOSIO_TRIGGER_APPROVAL_REQUIRED');
  const approval=requireComposioControl(control.admission,actor,'CREATE_AUTOMATION_TRIGGER',control.parameters),target=await resolveComposioTriggerTarget(actor,input);
  const schedule=(control.parameters.input as{schedule?:{kind?:string;toolkit?:string;triggerSlug?:string;triggerConfig?:unknown}})?.schedule;
  if(target.connectedAccountId!==control.expectedAccount||control.parameters.account!==target.connectedAccountId||control.parameters.resource!==`${target.toolkit}:${target.triggerSlug}:${target.connectedAccountId}`||control.parameters.connection!==composioControlSource(actor)||schedule?.kind!=='trigger'||preparedActionDigest({toolkit:schedule.toolkit,triggerSlug:schedule.triggerSlug,triggerConfig:schedule.triggerConfig})!==preparedActionDigest(input))throw new AuthorityError('COMPOSIO_TRIGGER_SCOPE_CHANGED');
  const{triggerSlug}=target;
  const result = await composioRequest<{ trigger_id?: string }>(`/trigger_instances/${encodeURIComponent(triggerSlug)}/upsert`, {
    method: 'POST',
    beforeDispatch:async()=>{await approval.beforeDispatch();const current=await resolveComposioTriggerTarget(actor,input);if(current.connectedAccountId!==control.expectedAccount)throw new AuthorityError('COMPOSIO_TRIGGER_ACCOUNT_CHANGED');await approval.check();},
    body: { user_id: composioUserId(userId), connected_account_id:control.expectedAccount,trigger_config: input.triggerConfig },
  },actor);
  if (!result.trigger_id?.startsWith('ti_')) throw new ComposioClientError('Composio did not return a trigger instance.', { status: 502, code: 'COMPOSIO_TRIGGER_CREATE_FAILED' });
  return result.trigger_id;
}

export async function getComposioToolDetails(
  toolSlug: string,
  tenantContext?: TenantContext,
): Promise<XrogaConnectToolDetails> {
  const actor=tenantContext===undefined?undefined:requireTenantContext(tenantContext);if(actor)requireComposioActor(actor.userId,actor);
  const clean = cleanToolSlug(toolSlug);
  if(classifyOutboundData({toolSlug:clean},'PUBLIC').classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  if(clean.toLowerCase().startsWith('custom_')&&(!actor||!clean.toLowerCase().startsWith(xrogaCustomToolkitPrefix(actor.userId))))throw new AuthorityError('COMPOSIO_CUSTOM_METADATA_FORBIDDEN');

  const details = await composioRequest<ComposioToolDetailsResponse>(
    `/tools/${encodeURIComponent(clean)}?toolkit_versions=latest`,{},actor
  );

  const resolvedSlug = details.slug ?? clean;
  if (resolvedSlug !== clean) {
    throw new ComposioClientError('The app provider returned metadata for a different action.', {
      status: 502, code: 'COMPOSIO_TOOL_METADATA_MISMATCH',
    });
  }
  const toolkit = details.toolkit?.slug;

  if (!toolkit) {
    throw new ComposioClientError(
      'The app provider did not return action metadata.',
      {
        status: 502,
        code: 'COMPOSIO_TOOL_METADATA_MISSING',
      },
    );
  }

  const tags = Array.isArray(details.tags)
    ? details.tags.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];

  const risk = classifyComposioToolRisk(resolvedSlug, tags);

  return {
    slug: resolvedSlug,
    toolkit,
    name: details.name,
    description: details.description,
    humanDescription: details.human_description,
    inputSchema: details.input_parameters,
    outputSchema: details.output_parameters,
    scopes: Array.isArray(details.scopes)
      ? details.scopes.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    scopeRequirements: details.scope_requirements,
    tags,
    noAuth: details.no_auth === true,
    deprecated: details.is_deprecated === true,
    version: details.version,
    risk,
    requiresConfirmation: risk === 'destructive',
  };
}

export async function createComposioConnectionLink(
  userId: string,
  input: {
    sessionId: string;
    toolkit: string;
    callbackUrl: string;
    mode?: XrogaConnectMode;
  },
  tenantContext?: TenantContext,
): Promise<{
  toolkit: string;
  redirectUrl: string;
  connectedAccountId?: string;
}> {
  const actor=requireComposioActor(userId,tenantContext);
  input=structuredClone(input);
  const sessionId = cleanSessionId(input.sessionId);
  const toolkit = cleanToolkit(input.toolkit);
  const callbackUrl = validateCallbackUrl(input.callbackUrl);
  if(!canUserAccessComposioToolkit(userId,toolkit))throw new AuthorityError('COMPOSIO_TOOLKIT_FORBIDDEN');


  await assertComposioSession(
    userId,
    sessionId,
    input.mode ?? 'read',actor
  );

  const response = await composioRequest<ComposioLinkResponse>(
    `/tool_router/session/${encodeURIComponent(sessionId)}/link`,
    {
      method: 'POST',
      body: {
        toolkit,
        callback_url: callbackUrl,
      },
    },actor
  );

  if (!response.redirect_url) {
    throw new ComposioClientError(
      'External authorization URL was not returned.',
      {
        status: 502,
        code: 'COMPOSIO_LINK_MISSING',
      },
    );
  }

  return {
    toolkit,
    redirectUrl: response.redirect_url,
    ...(response.connected_account_id
      ? {
          connectedAccountId: response.connected_account_id,
        }
      : {}),
  };
}

async function executeDiscoveredComposioTool(
  userId: string,
  input: {
    sessionId: string;
    useCase: string;
    toolSlug: string;
    arguments: Record<string, unknown>;
    mode: XrogaConnectMode;
    authorityPermit?: AuthorityPermit;
    authorityBinding?: AuthorityDispatchBinding;
    tenantContext?: TenantContext;
    signal?: AbortSignal;
  },
): Promise<ComposioExecuteResponse> {
  // Snapshot before any metadata wait. The actual dispatch must match this
  // exact payload, not a mutable object still held by its caller.
  const context=input.mode==='action'?authorityContextForPermit(input.authorityPermit,input.authorityBinding!):requireTenantContext(input.tenantContext);
  const signal=input.signal;signal?.throwIfAborted();
  requireResourceOwner(context,userId);
  userId = context.userId;
  input = { ...input, arguments: canonicalAuthorityValue(input.arguments) as Record<string, unknown>,
    ...(input.authorityBinding ? { authorityBinding: { ...input.authorityBinding } } : {}) };
  // Metadata discovery itself transmits the use case. Apply the shared secret
  // floor before discovery, not only at the later consequential-action gate.
  // This denial floor never grants authority or certifies a read's provenance.
  if(classifyOutboundData({useCase:input.useCase,arguments:input.arguments}).classification==='CREDENTIAL_SECRET')throw new EgressDenied('SECRET_EGRESS_DENIED');
  const sessionId = cleanSessionId(input.sessionId);

  await assertComposioSession(userId, sessionId, input.mode,context);
  signal?.throwIfAborted();

  const toolSlug = cleanToolSlug(input.toolSlug);

  const discovery = await searchComposioTools(userId, {
    sessionId,
    query: input.useCase,
    mode: input.mode,
  },context);
  signal?.throwIfAborted();

  const allowedTool = discovery.tools.find((tool) => tool.slug === toolSlug);
  const allowed =
    Boolean(allowedTool) &&
    canUserAccessComposioToolkit(
      userId,
      allowedTool?.toolkit || '',
    );

  if (!allowed) {
    throw new ComposioClientError(
      'This external action was not discovered inside the current Xroga Connect session.',
      {
        status: 403,
        code: 'COMPOSIO_TOOL_NOT_ALLOWED',
      },
    );
  }

  let account: string | undefined;
  if(input.mode==='read'){
    const toolkit=allowedTool!.toolkit.trim().toLowerCase(),payload={sessionId,useCase:input.useCase,toolSlug,arguments:input.arguments},digest=preparedActionDigest(payload);
    if(toolkit.startsWith('custom_')){
      await enforceEgress({context,actionClass:'READ',destination:COMPOSIO_API_BASE,recipient:'untrusted-custom-mcp',purpose:'custom-mcp-read-admission',payload,declaredClass:'USER_PRIVATE',toolTrust:'UNTRUSTED_CAPABILITY_METADATA',binding:{userId,provider:toolkit,connectedAccountId:'untrusted-custom-mcp',operation:toolSlug,targetDigest:digest,planDigest:digest}},receipt=>persistSecurityDecision(context,receipt));
      throw new EgressDenied('UNTRUSTED_TOOL_REQUIRES_SANDBOX');
    }
    const accounts=await listComposioToolkits(userId,{sessionId,mode:'read',toolkits:[toolkit]},context),current=accounts.find(item=>item.toolkit.toLowerCase()===toolkit),connectedAccountId=current?.noAuth?`no-auth:${toolkit}`:current?.connectedAccountId;
    if(!current?.connected||!connectedAccountId)throw new AuthorityError('COMPOSIO_READ_ACCOUNT_UNAVAILABLE');
    signal?.throwIfAborted();
    const {actionPlanDigest}=await import('./businessAction.js'),{createBusinessActionConfirmation,cancelBusinessActionConfirmation}=await import('./businessActionConfirmations.js'),issuedAt=new Date().toISOString();
    const value:Omit<import('./businessAction.js').BusinessActionPlan,'planDigest'>={version:'1.0',sessionId,useCase:input.useCase,toolkit,toolSlug,arguments:input.arguments,risk:'read',requiresConfirmation:true,forceConfirmation:true,summary:`Read using ${toolSlug} in ${toolkit}, sending only the displayed arguments to the connected account. This consent covers this exact private-data request.`,requiredScopes:[],authority:{version:'1',userId,tenantId:context.tenantId,connectedAccountId,actionClass:businessActionClass(toolSlug),projectId:null,runId:null,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+15*60000).toISOString(),nonce:randomUUID(),maxSpendMicroUsd:null,currency:null}};
    const confirmation=await createBusinessActionConfirmation(userId,{...value,planDigest:actionPlanDigest(value)});
    if(signal?.aborted){await cancelBusinessActionConfirmation(userId,confirmation.id);signal.throwIfAborted();}
    return{needsConfirmation:true,confirmation,reviewUrl:`/dashboard/actions/confirm/${confirmation.id}`};
  }
  if (input.mode === 'action') {
    const binding = input.authorityBinding;
    if (!binding || !allowedTool || toolSlug.startsWith('COMPOSIO_')) {
      throw new ComposioClientError('Exact application authority is required.', { status: 403, code: 'COMPOSIO_ACTION_CONFIRMATION_REQUIRED' });
    }
    const toolkit = allowedTool.toolkit.trim().toLowerCase();
    const actualBinding: AuthorityDispatchBinding = { ...binding, userId, provider: toolkit, operation: toolSlug,
      targetDigest: preparedActionDigest({ sessionId, useCase: input.useCase, toolSlug, arguments: input.arguments }) };
    assertAuthorityPermit(input.authorityPermit, actualBinding);
    const accounts = await listComposioToolkits(userId, { sessionId, mode: 'action', toolkits: [toolkit] },context);
    signal?.throwIfAborted();
    const current = accounts.find(item => item.toolkit.trim().toLowerCase() === toolkit);
    const accountId = current?.noAuth ? `no-auth:${toolkit}` : current?.connectedAccountId;
    if (!current?.connected || !accountId || accountId !== binding.connectedAccountId) {
      throw new ComposioClientError('The connected application account changed. Prepare the action again.', {
        status: 409, code: 'COMPOSIO_ACTION_ACCOUNT_CHANGED',
      });
    }
    account = current.noAuth ? undefined : accountId;
    // Existing exact permit and live account readback precede the egress gate.
    // Provider headers/credentials are attached only inside composioRequest.
    await enforceEgress({context,actionClass:businessActionClass(toolSlug),binding:actualBinding,
      authorityPermit:input.authorityPermit,destination:COMPOSIO_API_BASE,
      recipient:accountId,purpose:'confirmed_business_action',
      payload:{sessionId,useCase:input.useCase,toolSlug,arguments:input.arguments},
      toolTrust:toolkit.startsWith(xrogaCustomToolkitPrefix(userId))?'UNTRUSTED_CAPABILITY_METADATA':'SERVER_REGISTERED',
    },receipt=>persistSecurityDecision(context,receipt));
    signal?.throwIfAborted();
    await consumeAuthorityPermit(input.authorityPermit, actualBinding);
    signal?.throwIfAborted();
    // Egress receipt persistence and durable claim consumption can wait. A
    // session/account reassigned during either wait cannot inherit this permit.
    const finalAccounts=await listComposioToolkits(userId,{sessionId,mode:'action',toolkits:[toolkit]},context);
    signal?.throwIfAborted();
    const final=finalAccounts.find(item=>item.toolkit.trim().toLowerCase()===toolkit);
    const finalAccountId=final?.noAuth?`no-auth:${toolkit}`:final?.connectedAccountId;
    if(!final?.connected||finalAccountId!==accountId)throw new ComposioClientError('The connected application account changed. Prepare the action again.',{status:409,code:'COMPOSIO_ACTION_ACCOUNT_CHANGED'});
  }

  const response = await composioRequest<ComposioExecuteResponse>(
    `/tool_router/session/${encodeURIComponent(sessionId)}/execute`,
    {
      method: 'POST',
      body: {
        tool_slug: toolSlug,
        arguments: input.arguments,
        // Official session execute API selects the exact account using `account`.
        // https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSessionBySessionIdExecute
        ...(account ? { account } : {}),
        enable_auto_workbench_offload: false,
      },
      timeoutMs: EXECUTE_TIMEOUT_MS,
      signal,
    },context
  );
  // v3.1 can report input_required or failed with HTTP 200. Neither is a
  // completed effect. Never answer a provider approval request automatically.
  // Legacy inline responses with explicit data remain wire-compatible.
  if (!response || typeof response !== 'object' || Array.isArray(response)
    || (Object.hasOwn(response, 'result_type') && response.result_type !== 'completed')
    || (!response.error && !Object.hasOwn(response, 'data'))) {
    throw new ComposioClientError('The provider did not report a completed action. Review its state before preparing another attempt.', {
      status: 409, code: 'COMPOSIO_EXECUTION_NOT_COMPLETED',
    });
  }
  // Both read and write result paths can feed a user response or model prompt.
  // Whitelist the DTO and redact credential-bearing fields before either path.
  // The full response digest remains private receipt evidence, not raw content.
  return {
    data: redactOperationsValue(response.data ?? {}, 'tool_output'),
    resultDigest: createHash('sha256').update(JSON.stringify(response.data ?? {})).digest('hex'),
    ...(response.error ? { error: typeof response.error === 'string' ? String(redactOperationsValue(response.error, 'tool_output')) : 'Provider returned an error' } : {}),
    ...(typeof response.log_id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(response.log_id)
      && redactOperationsValue(response.log_id, 'tool_output') === response.log_id ? { log_id: response.log_id } : {}),
  };
}

export async function executeComposioReadTool(
  userId: string,
  input: {
    sessionId: string;
    useCase: string;
    toolSlug: string;
    arguments: Record<string, unknown>;
    /** Original authenticated context, required at runtime before any network. */
    tenantContext?: TenantContext;
    signal?: AbortSignal;
  },
): Promise<ComposioExecuteResponse> {
  const toolSlug = cleanToolSlug(input.toolSlug);

  if (classifyComposioToolRisk(toolSlug)!=='read') {
    throw new ComposioClientError(
      'This action is not available through the Xroga Connect read capability.',
      {
        status: 403,
        code: 'COMPOSIO_MUTATION_BLOCKED',
      },
    );
  }

  return executeDiscoveredComposioTool(userId, {
    ...input,
    toolSlug,
    mode: 'read',
  });
}

export async function executeComposioActionTool(
  userId: string,
  input: {
    sessionId: string;
    useCase: string;
    toolSlug: string;
    arguments: Record<string, unknown>;
    authorization: {
      confirmed: true;
    };
    authorityPermit?: AuthorityPermit;
    authorityBinding?: AuthorityDispatchBinding;
    signal?: AbortSignal;
  },
): Promise<ComposioExecuteResponse> {
  if (input.authorization.confirmed !== true || !input.authorityBinding || !input.authorityPermit) {
    throw new ComposioClientError(
      'Xroga Connect action authorization is required.',
      {
        status: 409,
        code: 'COMPOSIO_ACTION_CONFIRMATION_REQUIRED',
      },
    );
  }

  assertAuthorityPermit(input.authorityPermit, { ...input.authorityBinding, userId,
    operation: input.toolSlug, targetDigest: preparedActionDigest({ sessionId: input.sessionId,
      useCase: input.useCase, toolSlug: input.toolSlug, arguments: input.arguments }) });

  return executeDiscoveredComposioTool(userId, {
    sessionId: input.sessionId,
    useCase: input.useCase,
    toolSlug: input.toolSlug,
    arguments: input.arguments,
    mode: 'action',
    authorityPermit: input.authorityPermit,
    authorityBinding: input.authorityBinding,
    signal:input.signal,
  });
}
