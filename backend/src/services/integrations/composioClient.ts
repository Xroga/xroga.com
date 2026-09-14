const COMPOSIO_API_BASE =
  'https://backend.composio.dev/api/v3.1';

const DEFAULT_TIMEOUT_MS = 15_000;
const EXECUTE_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 2_000_000;

const READ_ONLY_TAG = 'readOnlyHint';
const DESTRUCTIVE_TAG = 'destructiveHint';

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
    this.code =
      options.code ??
      'COMPOSIO_ERROR';
  }
}

interface ComposioTagsConfig {
  enabled?: string[];
  disabled?: string[];

  /*
   * Some Composio SDK/docs surfaces use
   * enable/disable while REST responses
   * use enabled/disabled.
   *
   * Accept both when validating a
   * returned session.
   */
  enable?: string[];
  disable?: string[];
}

interface ComposioSessionConfig {
  user_id?: string;

  tags?:
    | ComposioTagsConfig
    | string[];

  search?: {
    enable?: boolean;
  };

  execute?: {
    enable_multi_execute?: boolean;
  };

  workbench?: {
    enable?: boolean;

    proxy_execution_enabled?: boolean;

    enable_proxy_execution?: boolean;
  };
}

export interface ComposioSession {
  session_id: string;

  config?: ComposioSessionConfig;

  warnings?: Array<{
    code?: string;
    message?: string;
  }>;
}

interface ComposioToolSchema {
  toolkit?: string;

  tool_slug?: string;

  description?: string;

  input_schema?: Record<
    string,
    unknown
  >;

  output_schema?: Record<
    string,
    unknown
  >;
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

  toolkit_connection_statuses?:
    Array<{
      toolkit?: string;

      description?: string;

      has_active_connection?:
        boolean;

      status_message?: string;

      account_selection?:
        string;
    }>;

  tool_schemas?: Record<
    string,
    ComposioToolSchema
  >;
}

interface ComposioLinkResponse {
  link_token?: string;

  redirect_url?: string;

  connected_account_id?: string;
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

  inputSchema?: Record<
    string,
    unknown
  >;
}

export interface XrogaConnectToolkit {
  toolkit: string;

  description?: string;

  connected: boolean;

  statusMessage?: string;
}

export interface XrogaConnectSearchResult {
  sessionId: string;

  tools: XrogaConnectTool[];

  toolkits:
    XrogaConnectToolkit[];

  guidance?: string;
}

function getComposioApiKey():
  string {
  const key =
    process.env
      .COMPOSIO_API_KEY
      ?.trim();

  if (!key) {
    throw new ComposioClientError(
      'Xroga Connect is not configured.',
      {
        status: 503,

        code:
          'COMPOSIO_NOT_CONFIGURED',
      },
    );
  }

  return key;
}

export function isComposioConfigured():
  boolean {
  return Boolean(
    process.env
      .COMPOSIO_API_KEY
      ?.trim(),
  );
}

function composioUserId(
  userId: string,
): string {
  const clean =
    userId.trim();

  if (!clean) {
    throw new ComposioClientError(
      'Authenticated Xroga user is required.',
      {
        status: 401,

        code:
          'XROGA_USER_REQUIRED',
      },
    );
  }

  return `xroga:${clean}`;
}

function cleanSessionId(
  sessionId: string,
): string {
  const clean =
    sessionId.trim();

  if (
    !/^trs_[A-Za-z0-9_-]+$/.test(
      clean,
    )
  ) {
    throw new ComposioClientError(
      'Invalid Xroga Connect session.',
      {
        status: 400,

        code:
          'INVALID_COMPOSIO_SESSION',
      },
    );
  }

  return clean;
}

function cleanToolkit(
  toolkit: string,
): string {
  const clean =
    toolkit
      .trim()
      .toLowerCase();

  if (
    !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(
      clean,
    )
  ) {
    throw new ComposioClientError(
      'Invalid integration identifier.',
      {
        status: 400,

        code:
          'INVALID_COMPOSIO_TOOLKIT',
      },
    );
  }

  return clean;
}

function cleanToolSlug(
  toolSlug: string,
): string {
  const clean =
    toolSlug.trim();

  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$/.test(
      clean,
    )
  ) {
    throw new ComposioClientError(
      'Invalid external tool.',
      {
        status: 400,

        code:
          'INVALID_COMPOSIO_TOOL',
      },
    );
  }

  if (
    clean
      .toUpperCase()
      .startsWith(
        'COMPOSIO_',
      )
  ) {
    throw new ComposioClientError(
      'Composio meta tools are not available through Xroga Connect.',
      {
        status: 403,

        code:
          'COMPOSIO_META_TOOL_BLOCKED',
      },
    );
  }

  return clean;
}

/**
 * Extra Xroga-side defense.
 *
 * Even though the Composio session
 * exposes only readOnlyHint tools,
 * obviously mutating tool names are
 * also rejected before execution.
 */
function looksMutatingToolSlug(
  toolSlug: string,
): boolean {
  const normalized =
    toolSlug
      .toUpperCase()
      .replace(
        /[^A-Z0-9]+/g,
        '_',
      );

  const dangerousWords = [
    'SEND',
    'CREATE',
    'DELETE',
    'REMOVE',
    'UPDATE',
    'MODIFY',
    'EDIT',
    'WRITE',
    'POST',
    'PUBLISH',
    'UNPUBLISH',
    'REFUND',
    'TRANSFER',
    'PAY',
    'CHARGE',
    'CANCEL',
    'ARCHIVE',
    'INVITE',
    'ADD_MEMBER',
    'REMOVE_MEMBER',
    'GRANT',
    'REVOKE',
    'CHANGE_PERMISSION',
    'SET_PERMISSION',
    'CREATE_EVENT',
    'UPDATE_EVENT',
    'DELETE_EVENT',
    'CREATE_INVOICE',
    'UPDATE_INVOICE',
    'DELETE_INVOICE',
    'CREATE_ORDER',
    'UPDATE_ORDER',
    'DELETE_ORDER',
  ];

  return dangerousWords.some(
    (word) =>
      normalized === word ||
      normalized.startsWith(
        `${word}_`,
      ) ||
      normalized.endsWith(
        `_${word}`,
      ) ||
      normalized.includes(
        `_${word}_`,
      ),
  );
}

function validateCallbackUrl(
  value: string,
): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ComposioClientError(
      'Invalid integration callback URL.',
      {
        status: 500,

        code:
          'INVALID_COMPOSIO_CALLBACK',
      },
    );
  }

  const localHttp =
    url.protocol ===
      'http:' &&
    (
      url.hostname ===
        'localhost' ||
      url.hostname ===
        '127.0.0.1'
    );

  if (
    url.protocol !==
      'https:' &&
    !localHttp
  ) {
    throw new ComposioClientError(
      'Unsafe integration callback URL.',
      {
        status: 500,

        code:
          'UNSAFE_COMPOSIO_CALLBACK',
      },
    );
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
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      options.timeoutMs ??
        DEFAULT_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        `${COMPOSIO_API_BASE}${path}`,
        {
          method:
            options.method ??
            'GET',

          headers: {
            Accept:
              'application/json',

            'Content-Type':
              'application/json',

            'x-api-key':
              getComposioApiKey(),
          },

          body:
            options.body ===
            undefined
              ? undefined
              : JSON.stringify(
                  options.body,
                ),

          signal:
            controller.signal,
        },
      );

    const declaredLength =
      Number(
        response.headers.get(
          'content-length',
        ) ?? 0,
      );

    if (
      Number.isFinite(
        declaredLength,
      ) &&
      declaredLength >
        MAX_RESPONSE_SIZE
    ) {
      throw new ComposioClientError(
        'External integration response was too large.',
        {
          status: 502,

          code:
            'COMPOSIO_RESPONSE_TOO_LARGE',
        },
      );
    }

    const text =
      await response.text();

    if (
      text.length >
      MAX_RESPONSE_SIZE
    ) {
      throw new ComposioClientError(
        'External integration response was too large.',
        {
          status: 502,

          code:
            'COMPOSIO_RESPONSE_TOO_LARGE',
        },
      );
    }

    let payload: unknown = {};

    if (text) {
      try {
        payload =
          JSON.parse(text);
      } catch {
        throw new ComposioClientError(
          'External integration returned invalid data.',
          {
            status: 502,

            code:
              'COMPOSIO_INVALID_RESPONSE',
          },
        );
      }
    }

    if (!response.ok) {
      let message =
        'Xroga Connect could not complete the external request.';

      if (
        response.status ===
          401 ||
        response.status ===
          403
      ) {
        message =
          'Xroga Connect authorization failed.';
      } else if (
        response.status ===
        404
      ) {
        message =
          'The requested Xroga Connect resource was not found.';
      } else if (
        response.status ===
        408
      ) {
        message =
          'Xroga Connect request timed out.';
      } else if (
        response.status ===
        413
      ) {
        message =
          'The external request was too large.';
      } else if (
        response.status ===
        429
      ) {
        message =
          'Xroga Connect is temporarily rate limited.';
      }

      throw new ComposioClientError(
        message,
        {
          status:
            response.status >=
            500
              ? 502
              : response.status,

          code:
            'COMPOSIO_UPSTREAM_ERROR',
        },
      );
    }

    return payload as T;
  } catch (error) {
    if (
      error instanceof
      ComposioClientError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name ===
        'AbortError'
    ) {
      throw new ComposioClientError(
        'Xroga Connect timed out.',
        {
          status: 504,

          code:
            'COMPOSIO_TIMEOUT',
        },
      );
    }

    throw new ComposioClientError(
      'Xroga Connect is temporarily unavailable.',
      {
        status: 502,

        code:
          'COMPOSIO_NETWORK_ERROR',
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function createReadOnlyComposioSession(
  userId: string,
): Promise<ComposioSession> {
  const session =
    await composioRequest<ComposioSession>(
      '/tool_router/session',
      {
        method: 'POST',

        body: {
          user_id:
            composioUserId(
              userId,
            ),

          /*
           * Primary security boundary:
           * Composio may expose ONLY tools
           * tagged readOnlyHint.
           *
           * destructiveHint remains explicitly
           * disabled as defense in depth.
           */
          tags: {
            enabled: [
              READ_ONLY_TAG,
            ],

            disabled: [
              DESTRUCTIVE_TAG,
            ],
          },

          /*
           * Xroga does not expose Composio's
           * remote workbench or shell.
           */
          workbench: {
            enable: false,
          },

          search: {
            enable: true,
          },

          /*
           * Prevent batching multiple tools
           * into one unrestricted execution.
           */
          execute: {
            enable_multi_execute:
              false,
          },

          /*
           * Users may connect applications,
           * but Xroga does not let tools
           * remove their connections.
           */
          manage_connections: {
            enable: true,

            enable_wait_for_connections:
              false,

            enable_connection_removal:
              false,
          },
        },
      },
    );

  if (
    !session.session_id ||
    !session.session_id.startsWith(
      'trs_',
    )
  ) {
    throw new ComposioClientError(
      'Composio did not return a valid session.',
      {
        status: 502,

        code:
          'COMPOSIO_SESSION_MISSING',
      },
    );
  }

  return session;
}

export async function getComposioSession(
  sessionId: string,
): Promise<ComposioSession> {
  const clean =
    cleanSessionId(
      sessionId,
    );

  return composioRequest<ComposioSession>(
    `/tool_router/session/${encodeURIComponent(
      clean,
    )}`,
  );
}

function enabledSessionTags(
  config:
    | ComposioSessionConfig
    | undefined,
): string[] {
  const tags =
    config?.tags;

  if (
    Array.isArray(tags)
  ) {
    return tags;
  }

  if (!tags) {
    return [];
  }

  return [
    ...(tags.enabled ?? []),
    ...(tags.enable ?? []),
  ];
}

function disabledSessionTags(
  config:
    | ComposioSessionConfig
    | undefined,
): string[] {
  const tags =
    config?.tags;

  if (
    !tags ||
    Array.isArray(tags)
  ) {
    return [];
  }

  return [
    ...(tags.disabled ?? []),
    ...(tags.disable ?? []),
  ];
}

export async function assertReadOnlyComposioSession(
  userId: string,
  sessionId: string,
): Promise<ComposioSession> {
  const session =
    await getComposioSession(
      sessionId,
    );

  /*
   * Never trust a browser/model supplied
   * session ID unless the session belongs
   * to this authenticated Xroga user.
   */
  if (
    session.config?.user_id !==
    composioUserId(userId)
  ) {
    throw new ComposioClientError(
      'Xroga Connect session does not belong to this user.',
      {
        status: 403,

        code:
          'COMPOSIO_SESSION_FORBIDDEN',
      },
    );
  }

  const enabled =
    enabledSessionTags(
      session.config,
    );

  const disabled =
    disabledSessionTags(
      session.config,
    );

  /*
   * IMPORTANT:
   *
   * readOnlyHint is the real fail-closed
   * policy boundary.
   *
   * We do NOT require Composio to echo
   * destructiveHint inside its returned
   * disabled array because Composio may
   * normalize redundant negative filters.
   *
   * We DO reject the session if the
   * destructive tag is explicitly enabled.
   */
  if (
    !enabled.includes(
      READ_ONLY_TAG,
    )
  ) {
    throw new ComposioClientError(
      'Xroga Connect session is missing the required read-only policy.',
      {
        status: 403,

        code:
          'COMPOSIO_READ_ONLY_POLICY_MISSING',
      },
    );
  }

  if (
    enabled.includes(
      DESTRUCTIVE_TAG,
    )
  ) {
    throw new ComposioClientError(
      'Xroga Connect rejected an unsafe session policy.',
      {
        status: 403,

        code:
          'COMPOSIO_UNSAFE_POLICY',
      },
    );
  }

  /*
   * If Composio echoes the negative
   * destructive filter, good.
   *
   * If it canonicalizes it away,
   * readOnlyHint remains the required
   * positive restriction.
   */
  void disabled;

  /*
   * Reject unexpected dangerous runtime
   * configuration when Composio explicitly
   * reports it as enabled.
   */
  if (
    session.config
      ?.workbench
      ?.enable === true
  ) {
    throw new ComposioClientError(
      'Xroga Connect rejected a session with workbench access enabled.',
      {
        status: 403,

        code:
          'COMPOSIO_WORKBENCH_BLOCKED',
      },
    );
  }

  if (
    session.config
      ?.execute
      ?.enable_multi_execute ===
    true
  ) {
    throw new ComposioClientError(
      'Xroga Connect rejected a session with multi-execution enabled.',
      {
        status: 403,

        code:
          'COMPOSIO_MULTI_EXECUTE_BLOCKED',
      },
    );
  }

  return session;
}

export async function searchComposioTools(
  userId: string,
  input: {
    query: string;
    sessionId?: string;
  },
): Promise<XrogaConnectSearchResult> {
  const query =
    input.query.trim();

  if (
    query.length < 2 ||
    query.length > 500
  ) {
    throw new ComposioClientError(
      'Search query must be between 2 and 500 characters.',
      {
        status: 400,

        code:
          'INVALID_COMPOSIO_QUERY',
      },
    );
  }

  const session =
    input.sessionId
      ? await assertReadOnlyComposioSession(
          userId,
          input.sessionId,
        )
      : await createReadOnlyComposioSession(
          userId,
        );

  const response =
    await composioRequest<ComposioSearchResponse>(
      `/tool_router/session/${encodeURIComponent(
        session.session_id,
      )}/search`,
      {
        method: 'POST',

        body: {
          queries: [
            {
              use_case:
                query,
            },
          ],

          search_strategy:
            'tool_search',
        },
      },
    );

  const tools =
    Object.values(
      response.tool_schemas ??
        {},
    )
      .filter(
        (
          tool,
        ): tool is ComposioToolSchema & {
          toolkit: string;
          tool_slug: string;
        } =>
          Boolean(
            tool.toolkit &&
              tool.tool_slug,
          ),
      )
      /*
       * Never expose Composio's own
       * internal/meta tools.
       */
      .filter(
        (tool) =>
          !tool.tool_slug
            .toUpperCase()
            .startsWith(
              'COMPOSIO_',
            ),
      )
      /*
       * Xroga-side read-only defense.
       *
       * A tool that looks obviously
       * mutating is not presented to
       * the model even if provider
       * metadata is wrong.
       */
      .filter(
        (tool) =>
          !looksMutatingToolSlug(
            tool.tool_slug,
          ),
      )
      .slice(
        0,
        20,
      )
      .map(
        (tool) => ({
          slug:
            tool.tool_slug,

          toolkit:
            tool.toolkit,

          description:
            tool.description,

          inputSchema:
            tool.input_schema,
        }),
      );

  const toolkits =
    (
      response
        .toolkit_connection_statuses ??
      []
    )
      .filter(
        (
          status,
        ): status is typeof status & {
          toolkit: string;
        } =>
          Boolean(
            status.toolkit,
          ),
      )
      .slice(
        0,
        20,
      )
      .map(
        (status) => ({
          toolkit:
            status.toolkit,

          description:
            status.description,

          connected:
            Boolean(
              status
                .has_active_connection,
            ),

          statusMessage:
            status.status_message,
        }),
      );

  return {
    sessionId:
      session.session_id,

    tools,

    toolkits,

    guidance:
      response
        .results?.[0]
        ?.execution_guidance,
  };
}

export async function createComposioConnectionLink(
  userId: string,
  input: {
    sessionId: string;
    toolkit: string;
    callbackUrl: string;
  },
): Promise<{
  toolkit: string;
  redirectUrl: string;
  connectedAccountId?: string;
}> {
  const sessionId =
    cleanSessionId(
      input.sessionId,
    );

  /*
   * Re-check ownership and read-only
   * policy before starting OAuth.
   */
  await assertReadOnlyComposioSession(
    userId,
    sessionId,
  );

  const toolkit =
    cleanToolkit(
      input.toolkit,
    );

  const callbackUrl =
    validateCallbackUrl(
      input.callbackUrl,
    );

  const response =
    await composioRequest<ComposioLinkResponse>(
      `/tool_router/session/${encodeURIComponent(
        sessionId,
      )}/link`,
      {
        method: 'POST',

        body: {
          toolkit,

          callback_url:
            callbackUrl,
        },
      },
    );

  if (
    !response.redirect_url
  ) {
    throw new ComposioClientError(
      'External authorization URL was not returned.',
      {
        status: 502,

        code:
          'COMPOSIO_LINK_MISSING',
      },
    );
  }

  return {
    toolkit,

    redirectUrl:
      response.redirect_url,

    ...(response
      .connected_account_id
      ? {
          connectedAccountId:
            response
              .connected_account_id,
        }
      : {}),
  };
}

export async function executeComposioReadTool(
  userId: string,
  input: {
    sessionId: string;

    useCase: string;

    toolSlug: string;

    arguments: Record<
      string,
      unknown
    >;
  },
): Promise<ComposioExecuteResponse> {
  const sessionId =
    cleanSessionId(
      input.sessionId,
    );

  /*
   * Verify session ownership and
   * read-only policy before every
   * execution.
   */
  await assertReadOnlyComposioSession(
    userId,
    sessionId,
  );

  const toolSlug =
    cleanToolSlug(
      input.toolSlug,
    );

  /*
   * Hard Xroga-side mutation block.
   */
  if (
    looksMutatingToolSlug(
      toolSlug,
    )
  ) {
    throw new ComposioClientError(
      'This action is not available in Xroga Connect read-only mode.',
      {
        status: 403,

        code:
          'COMPOSIO_MUTATION_BLOCKED',
      },
    );
  }

  /*
   * Defense in depth:
   *
   * Re-discover the requested tool
   * inside the SAME authenticated,
   * read-only Composio session.
   *
   * The browser/model cannot invent
   * an arbitrary hidden tool slug.
   */
  const discovery =
    await searchComposioTools(
      userId,
      {
        sessionId,

        query:
          input.useCase,
      },
    );

  const allowed =
    discovery.tools.some(
      (tool) =>
        tool.slug ===
        toolSlug,
    );

  if (!allowed) {
    throw new ComposioClientError(
      'This action is not available in Xroga Connect read-only mode.',
      {
        status: 403,

        code:
          'COMPOSIO_TOOL_NOT_ALLOWED',
      },
    );
  }

  return composioRequest<ComposioExecuteResponse>(
    `/tool_router/session/${encodeURIComponent(
      sessionId,
    )}/execute`,
    {
      method: 'POST',

      body: {
        tool_slug:
          toolSlug,

        arguments:
          input.arguments,

        /*
         * Never let Composio offload
         * execution to workbench.
         */
        enable_auto_workbench_offload:
          false,
      },

      timeoutMs:
        EXECUTE_TIMEOUT_MS,
    },
  );
}
