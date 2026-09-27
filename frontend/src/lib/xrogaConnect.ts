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

export type XrogaMarketplaceSectionId =
  | 'small-business'
  | 'productivity'
  | 'creativity'
  | 'developer-tools'
  | 'business-operations'
  | 'data-analytics'
  | 'communication'
  | 'travel'
  | 'entertainment'
  | 'other';

export interface XrogaMarketplaceSection {
  id: XrogaMarketplaceSectionId;
  label: string;
  totalItems: number;
  items: XrogaConnectCatalogToolkit[];
}

export interface XrogaCustomMcp {
  toolkit: string;
  slug: string;
  name: string;
  serverUrl: string;
  authMode: 'no_auth' | 'api_key' | 'dcr_oauth';
  createdAt?: string;
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

  session: (opts?: { toolkits?: string[] }) =>
    apiFetch<{
      ok: boolean;
      sessionId: string;
      mode: XrogaConnectAvailabilityMode;
    }>('/api/integrations/xroga-connect/session', {
      method: 'POST',
      body: JSON.stringify(
        opts?.toolkits?.length
          ? { toolkits: opts.toolkits }
          : {},
      ),
    }),

  catalog: (opts?: {
    search?: string;
    category?: string;
    group?:
      | 'productivity'
      | 'communication'
      | 'engineering'
      | 'ai-automation'
      | 'sales-crm'
      | 'commerce'
      | 'marketing'
      | 'finance'
      | 'data-analytics'
      | 'design-media'
      | 'support'
      | 'infrastructure'
      | 'hr-recruiting'
      | 'other';
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

  marketplaceSections: (previewLimit = 6) =>
    apiFetch<{
      ok: boolean;
      sections: XrogaMarketplaceSection[];
    }>(
      `/api/integrations/xroga-connect/marketplace-sections${queryString({
        previewLimit,
      })}`,
    ),

  marketplaceSection: (
    section: XrogaMarketplaceSectionId,
    opts?: { limit?: number; cursor?: string },
  ) =>
    apiFetch<XrogaConnectCatalogPage>(
      `/api/integrations/xroga-connect/marketplace-sections/${encodeURIComponent(
        section,
      )}${queryString({
        limit: opts?.limit,
        cursor: opts?.cursor,
      })}`,
    ),

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

  customMcpList: () =>
    apiFetch<{
      ok: boolean;
      items: XrogaCustomMcp[];
    }>('/api/integrations/xroga-connect/custom-mcp'),

  customMcpCreate: (input: {
    name: string;
    slug: string;
    serverUrl: string;
    authMode: 'no_auth' | 'api_key' | 'dcr_oauth';
    discoveryUrl?: string;
  }) =>
    apiFetch<{
      ok: boolean;
      item: XrogaCustomMcp;
      sync?: {
        slug: string;
        version?: string;
        syncedCount?: number;
      };
      connectRequired: boolean;
    }>('/api/integrations/xroga-connect/custom-mcp', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  customMcpSync: (toolkit: string) =>
    apiFetch<{
      ok: boolean;
      slug: string;
      version?: string;
      syncedCount?: number;
    }>(
      `/api/integrations/xroga-connect/custom-mcp/${encodeURIComponent(
        toolkit,
      )}/sync`,
      { method: 'POST' },
    ),

  customMcpDelete: (toolkit: string) =>
    apiFetch<{ ok: boolean }>(
      `/api/integrations/xroga-connect/custom-mcp/${encodeURIComponent(
        toolkit,
      )}`,
      { method: 'DELETE' },
    ),
};