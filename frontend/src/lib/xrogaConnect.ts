import {
  apiFetch,
} from '@/lib/api';

export interface XrogaConnectTool {
  slug: string;
  toolkit: string;
  description?: string;
  inputSchema?: Record<
    string,
    unknown
  >;
  risk?:
    | 'read'
    | 'write'
    | 'destructive'
    | 'unknown';
  requiresConfirmation?:
    boolean;
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

export interface XrogaConnectSearchResult {
  ok: boolean;
  sessionId: string;
  mode?:
    | 'read'
    | 'action';
  tools:
    XrogaConnectTool[];
  toolkits:
    XrogaConnectToolkit[];
  guidance?: string;
}

export type XrogaConnectAvailabilityMode =
  | 'read_only'
  | 'connected_apps'
  | 'read_write';

export const xrogaConnect = {
  status: () =>
    apiFetch<{
      configured: boolean;
      mode:
        XrogaConnectAvailabilityMode;
    }>(
      '/api/integrations/xroga-connect/status',
    ),

  session: () =>
    apiFetch<{
      ok: boolean;
      sessionId: string;
      mode:
        XrogaConnectAvailabilityMode;
    }>(
      '/api/integrations/xroga-connect/session',
      {
        method:
          'POST',

        body:
          JSON.stringify(
            {},
          ),
      },
    ),

  search: (
    query: string,
    sessionId?: string,
  ) =>
    apiFetch<XrogaConnectSearchResult>(
      '/api/integrations/xroga-connect/search',
      {
        method:
          'POST',

        body:
          JSON.stringify(
            {
              query,

              ...(sessionId
                ? {
                    sessionId,
                  }
                : {}),
            },
          ),
      },
    ),

  actionSearch: (
    query: string,
    sessionId?: string,
  ) =>
    apiFetch<XrogaConnectSearchResult>(
      '/api/integrations/xroga-connect/action-search',
      {
        method:
          'POST',

        body:
          JSON.stringify(
            {
              query,

              ...(sessionId
                ? {
                    sessionId,
                  }
                : {}),
            },
          ),
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
    }>(
      '/api/integrations/xroga-connect/toolkits',
      {
        method:
          'POST',

        body:
          JSON.stringify(
            {
              sessionId,
              connectedOnly:
                opts?.connectedOnly ?? false,
              ...(opts?.toolkits?.length
                ? {
                    toolkits:
                      opts.toolkits,
                  }
                : {}),
            },
          ),
      },
    ),

  link: (
    sessionId: string,
    toolkit: string,
  ) =>
    apiFetch<{
      ok: boolean;
      toolkit: string;
      redirectUrl: string;
      connectedAccountId?: string;
    }>(
      '/api/integrations/xroga-connect/link',
      {
        method:
          'POST',

        body:
          JSON.stringify(
            {
              sessionId,
              toolkit,
            },
          ),
      },
    ),
};