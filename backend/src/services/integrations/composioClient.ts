const COMPOSIO_API_BASE = 'https://backend.composio.dev/api/v3.1';

const DEFAULT_TIMEOUT_MS = 15_000;
const EXECUTE_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 2_000_000;
const MAX_SEARCH_RESULTS = 20;
const MAX_TOOLKIT_PAGE_SIZE = 50;

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
  description?: string;
  inputSchema?: Record<string, unknown>;
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
  description?: string;
  connected: boolean;
  statusMessage?: string;
  noAuth?: boolean;
}

export interface XrogaConnectSearchResult {
  sessionId: string;
  mode: XrogaConnectMode;
  tools: XrogaConnectTool[];
  toolkits: XrogaConnectToolkit[];
  guidance?: string;
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

  return {
    sessionId: session.session_id,
    mode,
    tools,
    toolkits,
    guidance: response.results?.[0]?.execution_guidance,
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

export async function listConnectedComposioToolkits(
  userId: string,
  input: {
    sessionId: string;
    mode?: XrogaConnectMode;
    toolkits?: string[];
  },
): Promise<XrogaConnectToolkit[]> {
  const mode = input.mode ?? 'read';
  const sessionId = cleanSessionId(input.sessionId);

  await assertComposioSession(userId, sessionId, mode);

  const params = new URLSearchParams();
  params.set('is_connected', 'true');
  params.set('limit', String(MAX_TOOLKIT_PAGE_SIZE));

  if (input.toolkits?.length) {
    const toolkits = [...new Set(input.toolkits.map(cleanToolkit))];
    params.set('toolkits', toolkits.join(','));
  }

  const response = await composioRequest<ComposioSessionToolkitResponse>(
    `/tool_router/session/${encodeURIComponent(
      sessionId,
    )}/toolkits?${params.toString()}`,
  );

  return (response.items ?? [])
    .filter(
      (
        item,
      ): item is typeof item & {
        slug: string;
      } => typeof item.slug === 'string' && item.slug.length > 0,
    )
    .map((item) => ({
      toolkit: item.slug,
      description: item.meta?.description,
      connected:
        item.is_no_auth === true || Boolean(item.connected_account),
      statusMessage: item.connected_account?.status,
      noAuth:
        item.is_no_auth === true || item.meta?.isNoAuth === true,
    }));
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
