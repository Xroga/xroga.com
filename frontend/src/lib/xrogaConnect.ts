import { apiFetch } from '@/lib/api';

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
  risk?: 'read' | 'write' | 'destructive' | 'unknown';
  requiresConfirmation?: boolean;
}

export interface XrogaConnectToolDetails extends XrogaConnectTool {
  humanDescription?: string;
  outputSchema?: Record<string, unknown>;
  scopeRequirements?: unknown;
  noAuth: boolean;
  deprecated: boolean;
  scopes: string[];
  tags: string[];
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
  ok: boolean;
  sessionId: string;
  mode?: 'read' | 'action';
  tools: XrogaConnectTool[];
  toolkits: XrogaConnectToolkit[];
  guidance?: string;
  skill?: XrogaConnectSkill;
}

export interface XrogaConnectCatalogCategory {
  id: string;
  name: string;
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
  categories: XrogaConnectCatalogCategory[];
  xrogaGroup?:
    | 'productivity'
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
    | 'other';
  triggersCount: number;
  toolsCount: number;
  version?: string;
  deprecated: boolean;
}

export interface XrogaConnectCatalogPage {
  ok: boolean;
  items: XrogaConnectCatalogToolkit[];
  nextCursor?: string;
  totalPages?: number;
  currentPage?: number;
  totalItems: number;
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
  ok: boolean;
  slug: string;
  version?: string;
  syncedCount?: number;
}

export interface XrogaConnectCatalogToolPage {
  ok: boolean;
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
  ok: boolean;
  items: XrogaConnectTriggerType[];
  nextCursor?: string;
  totalPages?: number;
  currentPage?: number;
  totalItems: number;
}

export type XrogaConnectAvailabilityMode =
  | 'read_only'
  | 'connected_apps'
  | 'read_write';

export type XrogaPluginPermissionMode =
  | 'always_ask'
  | 'read_only'
  | 'low_risk'
  | 'full_access';

function queryString(
  input: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export const xrogaConnect = {
  status: () =>
    apiFetch<{
      configured: boolean;
      mode: XrogaConnectAvailabilityMode;
    }>('/api/integrations/xroga-connect/status'),

  permissionPolicy: {
    get: (toolkit?: string) =>
      apiFetch<{
        ok: boolean;
        mode: XrogaPluginPermissionMode;
        toolkit?: string;
      }>(
        `/api/integrations/xroga-connect/permission-policy${queryString({
          toolkit,
        })}`,
      ),

    update: (
      mode: XrogaPluginPermissionMode,
      toolkit?: string,
    ) =>
      apiFetch<{
        ok: boolean;
        mode: XrogaPluginPermissionMode;
        toolkit?: string;
      }>('/api/integrations/xroga-connect/permission-policy', {
        method: 'PATCH',
        body: JSON.stringify({
          mode,
          ...(toolkit ? { toolkit } : {}),
        }),
      }),
  },

  session: () =>
    apiFetch<{
      ok: boolean;
      sessionId: string;
      mode: XrogaConnectAvailabilityMode;
    }>('/api/integrations/xroga-connect/session', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  catalog: (opts?: {
    search?: string;
    category?: string;
    group?:
      | 'productivity'
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
      | 'engineering'
      | 'commerce'
      | 'marketing'
      | 'finance'
      | 'infrastructure'
      | 'healthcare'
      | 'travel';
    sortBy?: 'usage' | 'alphabetically';
    limit?: number;
    cursor?: string;
  }) =>
    apiFetch<XrogaConnectCatalogPage>(
      `/api/integrations/xroga-connect/catalog${queryString({
        search: opts?.search,
        category: opts?.category,
        group: opts?.group,
        sortBy: opts?.sortBy,
        limit: opts?.limit,
        cursor: opts?.cursor,
      })}`,
    ),

  catalogCategories: () =>
    apiFetch<{
      ok: boolean;
      categories: XrogaConnectCatalogCategory[];
    }>('/api/integrations/xroga-connect/catalog-categories'),

  catalogToolkit: (toolkit: string) =>
    apiFetch<{
      ok: boolean;
      toolkit: XrogaConnectCatalogToolkit;
    }>(
      `/api/integrations/xroga-connect/catalog/${encodeURIComponent(toolkit)}`,
    ),

  catalogTools: (
    toolkit: string,
    opts?: {
      limit?: number;
      cursor?: string;
    },
  ) =>
    apiFetch<XrogaConnectCatalogToolPage>(
      `/api/integrations/xroga-connect/catalog/${encodeURIComponent(
        toolkit,
      )}/tools${queryString({
        limit: opts?.limit,
        cursor: opts?.cursor,
      })}`,
    ),

  toolDetails: (toolSlug: string) =>
    apiFetch<{
      ok: boolean;
      tool: XrogaConnectToolDetails;
    }>(
      `/api/integrations/xroga-connect/tool-details/${encodeURIComponent(
        toolSlug,
      )}`,
    ),

  catalogTriggers: (
    toolkit: string,
    opts?: {
      limit?: number;
      cursor?: string;
    },
  ) =>
    apiFetch<XrogaConnectTriggerPage>(
      `/api/integrations/xroga-connect/catalog/${encodeURIComponent(
        toolkit,
      )}/triggers${queryString({
        limit: opts?.limit,
        cursor: opts?.cursor,
      })}`,
    ),

  search: (
    query: string,
    sessionId?: string,
  ) =>
    apiFetch<XrogaConnectSearchResult>(
      '/api/integrations/xroga-connect/search',
      {
        method: 'POST',
        body: JSON.stringify({
          query,
          ...(sessionId ? { sessionId } : {}),
        }),
      },
    ),

  actionSearch: (
    query: string,
    sessionId?: string,
  ) =>
    apiFetch<XrogaConnectSearchResult>(
      '/api/integrations/xroga-connect/action-search',
      {
        method: 'POST',
        body: JSON.stringify({
          query,
          ...(sessionId ? { sessionId } : {}),
        }),
      },
    ),

  toolkits: (
    sessionId: string,
    opts?: {
      connectedOnly?: boolean;
      toolkits?: string[];
    },
  ) =>
    apiFetch<{
      ok: boolean;
      toolkits: XrogaConnectToolkit[];
    }>('/api/integrations/xroga-connect/toolkits', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        connectedOnly: opts?.connectedOnly ?? false,
        ...(opts?.toolkits?.length
          ? {
              toolkits: opts.toolkits,
            }
          : {}),
      }),
    }),

  link: (
    sessionId: string,
    toolkit: string,
  ) =>
    apiFetch<{
      ok: boolean;
      toolkit: string;
      redirectUrl: string;
      connectedAccountId?: string;
    }>('/api/integrations/xroga-connect/link', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        toolkit,
      }),
    }),

  customMcp: {
    list: () =>
      apiFetch<{
        ok: boolean;
        items: XrogaConnectCatalogToolkit[];
      }>('/api/integrations/xroga-connect/custom-mcp'),

    create: (input: XrogaCustomMcpCreateInput) =>
      apiFetch<{
        ok: boolean;
        slug: string;
        toolkit?: XrogaConnectCatalogToolkit;
        initialSync?: {
          slug: string;
          version?: string;
          syncedCount?: number;
        };
      }>('/api/integrations/xroga-connect/custom-mcp', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    sync: (
      toolkit: string,
      connectedAccountId?: string,
    ) =>
      apiFetch<XrogaCustomMcpSyncResult>(
        `/api/integrations/xroga-connect/custom-mcp/${encodeURIComponent(
          toolkit,
        )}/sync`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...(connectedAccountId
              ? {
                  connectedAccountId,
                }
              : {}),
          }),
        },
      ),

    remove: (toolkit: string) =>
      apiFetch<{
        ok: boolean;
        slug: string;
        deleted: boolean;
      }>(
        `/api/integrations/xroga-connect/custom-mcp/${encodeURIComponent(
          toolkit,
        )}`,
        {
          method: 'DELETE',
        },
      ),
  },
};