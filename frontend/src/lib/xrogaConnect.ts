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
}

export interface XrogaConnectToolkit {
  toolkit: string;

  description?: string;

  connected: boolean;

  statusMessage?: string;
}

export interface XrogaConnectSearchResult {
  ok: boolean;

  sessionId: string;

  tools: XrogaConnectTool[];

  toolkits:
    XrogaConnectToolkit[];

  guidance?: string;
}

export const xrogaConnect = {
  status: () =>
    apiFetch<{
      configured: boolean;

      mode: 'read_only';
    }>(
      '/api/integrations/xroga-connect/status',
    ),

  session: () =>
    apiFetch<{
      ok: boolean;

      sessionId: string;

      mode: 'read_only';
    }>(
      '/api/integrations/xroga-connect/session',
      {
        method: 'POST',

        body: JSON.stringify(
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
        method: 'POST',

        body: JSON.stringify({
          query,

          ...(sessionId
            ? {
                sessionId,
              }
            : {}),
        }),
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
        method: 'POST',

        body: JSON.stringify({
          sessionId,
          toolkit,
        }),
      },
    ),
};
