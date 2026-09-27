const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3.1';

const DEFAULT_TIMEOUT_MS = 15_000;
const EXECUTE_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 8_000_000;
const MAX_SEARCH_RESULTS = 20;
const MAX_TOOLKIT_PAGE_SIZE = 100;
const MAX_CATALOG_PAGE_SIZE = 250;
const MAX_TRIGGER_PAGE_SIZE = 50;
const COMPOSIO_CACHE_TTL_MS = 5 * 60 * 1_000;

const READ_ONLY_TAG = 'readOnlyHint';
const DESTRUCTIVE_TAG = 'destructiveHint';

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
  data?: unknown;
  error?: string;
  log_id?: string;
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
): Promise<T> {
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

  if (catalogCache.size > 200) {
    for (const [cacheKey, item] of catalogCache) {
      if (item.expiresAt <= now) catalogCache.delete(cacheKey);
    }
  }

  return value;
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
  const clean = toolSlug.trim();

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$/.test(clean)) {
    throw new ComposioClientError('Invalid external tool.', {
      status: 400,
      code: 'INVALID_COMPOSIO_TOOL',
    });
  }

  if (clean.toUpperCase().startsWith('COMPOSIO_')) {
    throw new ComposioClientError(
      'Composio meta tools are not available through Xroga Connect.',
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

  return {
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
    deprecated: Boolean(item.deprecated),
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

export function classifyComposioToolRisk(
  toolSlug: string,
  tags: readonly string[] = [],
): XrogaConnectToolRisk {
  if (tags.includes(DESTRUCTIVE_TAG)) {
    return 'destructive';
  }

  if (tags.includes(READ_ONLY_TAG)) {
    return 'read';
  }

  const tokens = toolTokens(toolSlug);

  if (tokens.some((token) => DESTRUCTIVE_TOKENS.has(token))) {
    return 'destructive';
  }

  if (tokens.some((token) => WRITE_TOKENS.has(token))) {
    return 'write';
  }

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

  const localHttp =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

  if (url.protocol !== 'https:' && !localHttp) {
    throw new ComposioClientError('Unsafe integration callback URL.', {
      status: 500,
      code: 'UNSAFE_COMPOSIO_CALLBACK',
    });
  }

  return url.toString();
}

async function composioRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(`${COMPOSIO_API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': getComposioApiKey(),
      },
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const declaredLength = Number(
      response.headers.get('content-length') ?? 0,
    );

    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_RESPONSE_SIZE
    ) {
      throw new ComposioClientError(
        'External integration response was too large.',
        {
          status: 502,
          code: 'COMPOSIO_RESPONSE_TOO_LARGE',
        },
      );
    }

    const text = await response.text();

    if (text.length > MAX_RESPONSE_SIZE) {
      throw new ComposioClientError(
        'External integration response was too large.',
        {
          status: 502,
          code: 'COMPOSIO_RESPONSE_TOO_LARGE',
        },
      );
    }

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
      } else if (response.status === 404) {
        message = 'The requested Xroga Connect resource was not found.';
      } else if (response.status === 408) {
        message = 'Xroga Connect request timed out.';
      } else if (response.status === 413) {
        message = 'The external request was too large.';
      } else if (response.status === 429) {
        message = 'Xroga Connect is temporarily rate limited.';
      }

      throw new ComposioClientError(message, {
        status: response.status >= 500 ? 502 : response.status,
        code: 'COMPOSIO_UPSTREAM_ERROR',
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ComposioClientError) {
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
): Promise<ComposioSessionConfig | undefined> {
  if (
    session.config?.user_id &&
    (!requireTags || enabledSessionTags(session.config).length > 0)
  ) {
    return session.config;
  }

  const history = await composioRequest<ComposioConfigHistoryResponse>(
    `/tool_router/session/${encodeURIComponent(
      sessionId,
    )}/config_history?limit=1`,
  );

  const current =
    history.items?.find((item) => item.is_current === true) ??
    history.items?.[0];

  return current?.config ?? session.config;
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
): Promise<ComposioSession> {
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
    },
  );

  if (!session.session_id || !session.session_id.startsWith('trs_')) {
    throw new ComposioClientError(
      'Composio did not return a valid session.',
      {
        status: 502,
        code: 'COMPOSIO_SESSION_MISSING',
      },
    );
  }

  return session;
}

export async function createReadOnlyComposioSession(
  userId: string,
): Promise<ComposioSession> {
  return createComposioSession(userId, 'read');
}

export async function createActionComposioSession(
  userId: string,
): Promise<ComposioSession> {
  return createComposioSession(userId, 'action');
}

export async function getComposioSession(
  sessionId: string,
): Promise<ComposioSession> {
  const clean = cleanSessionId(sessionId);

  return composioRequest<ComposioSession>(
    `/tool_router/session/${encodeURIComponent(clean)}`,
  );
}

export async function assertComposioSession(
  userId: string,
  sessionId: string,
  mode: XrogaConnectMode,
): Promise<ComposioSession> {
  const clean = cleanSessionId(sessionId);
  const session = await getComposioSession(clean);
  const currentConfig = await getCurrentSessionConfig(
    clean,
    session,
    mode === 'read',
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
): Promise<ComposioSession> {
  return assertComposioSession(userId, sessionId, 'read');
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
): Promise<XrogaConnectSearchResult> {
  const query = input.query.trim();

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
    ? await assertComposioSession(userId, input.sessionId, mode)
    : await createComposioSession(userId, mode);

  const response = await composioRequest<ComposioSearchResponse>(
    `/tool_router/session/${encodeURIComponent(session.session_id)}/search`,
    {
      method: 'POST',
      body: {
        queries: [
          {
            use_case: query,
          },
        ],
        search_strategy: 'tool_search',
      },
    },
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
              ? searchResult.primary_tool_slugs
              : [],
            relatedToolSlugs: Array.isArray(searchResult.related_tool_slugs)
              ? searchResult.related_tool_slugs
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
): Promise<XrogaConnectSearchResult> {
  return searchComposioTools(userId, {
    ...input,
    mode: 'action',
  });
}

async function listSessionComposioToolkits(
  userId: string,
  input: {
    sessionId: string;
    mode?: XrogaConnectMode;
    toolkits?: string[];
    connectedOnly?: boolean;
  },
): Promise<XrogaConnectToolkit[]> {
  const mode = input.mode ?? 'read';
  const sessionId = cleanSessionId(input.sessionId);

  await assertComposioSession(userId, sessionId, mode);

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
      )}/toolkits?${params.toString()}`,
    );

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
            item.is_no_auth === true || Boolean(item.connected_account),
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

  return collected;
}

export async function listComposioToolkits(
  userId: string,
  input: {
    sessionId: string;
    mode?: XrogaConnectMode;
    toolkits?: string[];
  },
): Promise<XrogaConnectToolkit[]> {
  return listSessionComposioToolkits(userId, {
    ...input,
    connectedOnly: false,
  });
}

export async function listConnectedComposioToolkits(
  userId: string,
  input: {
    sessionId: string;
    mode?: XrogaConnectMode;
    toolkits?: string[];
  },
): Promise<XrogaConnectToolkit[]> {
  return listSessionComposioToolkits(userId, {
    ...input,
    connectedOnly: true,
  });
}

export async function listComposioCatalog(
  input: {
    search?: string;
    category?: string;
    sortBy?: 'usage' | 'alphabetically';
    limit?: number;
    cursor?: string;
  } = {},
): Promise<XrogaConnectCatalogPage> {
  const params = new URLSearchParams();
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? 120), 1),
    MAX_CATALOG_PAGE_SIZE,
  );

  params.set('limit', String(limit));
  params.set('sort_by', input.sortBy ?? 'usage');
  params.set('managed_by', 'all');
  params.set('include_deprecated', 'false');

  if (input.search?.trim()) {
    params.set('search', input.search.trim());
  }

  if (input.category?.trim()) {
    params.set('category', input.category.trim());
  }

  if (input.cursor?.trim()) {
    params.set('cursor', input.cursor.trim());
  }

  const cacheKey = `catalog:${params.toString()}`;

  return cachedComposioValue(cacheKey, async () => {
    const response = await composioRequest<ComposioCatalogToolkitListResponse>(
      `/toolkits?${params.toString()}`,
    );

    const items = (response.items ?? [])
      .map(mapCatalogToolkit)
      .filter(
        (item): item is XrogaConnectCatalogToolkit => Boolean(item),
      );

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

export async function listComposioCatalogCategories(): Promise<
  Array<{ id: string; name: string }>
> {
  return cachedComposioValue('catalog:categories', async () => {
    const response =
      await composioRequest<ComposioCatalogCategoryListResponse>(
        '/toolkits/categories?limit=250',
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
): Promise<XrogaConnectCatalogToolkit> {
  const slug = cleanToolkit(toolkitSlug);

  return cachedComposioValue(`catalog:toolkit:${slug}`, async () => {
    const response = await composioRequest<ComposioCatalogToolkitResponse>(
      `/toolkits/${encodeURIComponent(slug)}?version=latest`,
    );

    const toolkit = mapCatalogToolkit(response);

    if (!toolkit) {
      throw new ComposioClientError('Composio toolkit metadata was not found.', {
        status: 404,
        code: 'COMPOSIO_TOOLKIT_NOT_FOUND',
      });
    }

    return toolkit;
  });
}

export async function listComposioCatalogTools(
  toolkitSlug: string,
  input: {
    limit?: number;
    cursor?: string;
  } = {},
): Promise<XrogaConnectCatalogToolPage> {
  const toolkit = cleanToolkit(toolkitSlug);
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
      `/tools?${params.toString()}`,
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
): Promise<XrogaConnectTriggerPage> {
  const toolkit = cleanToolkit(toolkitSlug);
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
      `/triggers_types?${params.toString()}`,
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

export async function getComposioToolDetails(
  toolSlug: string,
): Promise<XrogaConnectToolDetails> {
  const clean = cleanToolSlug(toolSlug);

  const details = await composioRequest<ComposioToolDetailsResponse>(
    `/tools/${encodeURIComponent(clean)}?toolkit_versions=latest`,
  );

  const resolvedSlug = details.slug ?? clean;
  const toolkit = details.toolkit?.slug;

  if (!toolkit) {
    throw new ComposioClientError(
      'Composio did not return tool metadata.',
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
): Promise<{
  toolkit: string;
  redirectUrl: string;
  connectedAccountId?: string;
}> {
  const sessionId = cleanSessionId(input.sessionId);

  await assertComposioSession(
    userId,
    sessionId,
    input.mode ?? 'read',
  );

  const toolkit = cleanToolkit(input.toolkit);
  const callbackUrl = validateCallbackUrl(input.callbackUrl);

  const response = await composioRequest<ComposioLinkResponse>(
    `/tool_router/session/${encodeURIComponent(sessionId)}/link`,
    {
      method: 'POST',
      body: {
        toolkit,
        callback_url: callbackUrl,
      },
    },
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
  },
): Promise<ComposioExecuteResponse> {
  const sessionId = cleanSessionId(input.sessionId);

  await assertComposioSession(userId, sessionId, input.mode);

  const toolSlug = cleanToolSlug(input.toolSlug);

  const discovery = await searchComposioTools(userId, {
    sessionId,
    query: input.useCase,
    mode: input.mode,
  });

  const allowed = discovery.tools.some((tool) => tool.slug === toolSlug);

  if (!allowed) {
    throw new ComposioClientError(
      'This external action was not discovered inside the current Xroga Connect session.',
      {
        status: 403,
        code: 'COMPOSIO_TOOL_NOT_ALLOWED',
      },
    );
  }

  return composioRequest<ComposioExecuteResponse>(
    `/tool_router/session/${encodeURIComponent(sessionId)}/execute`,
    {
      method: 'POST',
      body: {
        tool_slug: toolSlug,
        arguments: input.arguments,
        enable_auto_workbench_offload: false,
      },
      timeoutMs: EXECUTE_TIMEOUT_MS,
    },
  );
}

export async function executeComposioReadTool(
  userId: string,
  input: {
    sessionId: string;
    useCase: string;
    toolSlug: string;
    arguments: Record<string, unknown>;
  },
): Promise<ComposioExecuteResponse> {
  const toolSlug = cleanToolSlug(input.toolSlug);

  if (looksMutatingToolSlug(toolSlug)) {
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
  },
): Promise<ComposioExecuteResponse> {
  if (input.authorization.confirmed !== true) {
    throw new ComposioClientError(
      'Xroga Connect action authorization is required.',
      {
        status: 409,
        code: 'COMPOSIO_ACTION_CONFIRMATION_REQUIRED',
      },
    );
  }

  return executeDiscoveredComposioTool(userId, {
    sessionId: input.sessionId,
    useCase: input.useCase,
    toolSlug: input.toolSlug,
    arguments: input.arguments,
    mode: 'action',
  });
}