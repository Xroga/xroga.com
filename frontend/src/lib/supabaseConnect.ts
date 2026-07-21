/** Shared Supabase OAuth helpers — same popup pattern as Vercel. */

import { api } from '@/lib/api';
import {
  clearOAuthResult,
  subscribeOAuthResults,
  type OAuthResultPayload,
} from '@/lib/oauthPopupResult';

export type SupabaseOAuthSuccess = {
  provisioned?: boolean;
  needsProjectPick?: boolean;
  projects?: Array<{ id: string; ref: string; name: string; region?: string }>;
  message?: string;
};

/** Resolve authorize URL before opening any window — never leave a blank popup on failure. */
export async function openSupabaseOAuthPopup(): Promise<{
  opened: boolean;
  popup: boolean;
  oauthConfigured: boolean;
  error?: string;
}> {
  try {
    clearOAuthResult();
    const res = await api.supabase.oauthUrl();
    const { url, oauthConfigured } = res;
    if (!url || !oauthConfigured) {
      return {
        opened: false,
        popup: false,
        oauthConfigured: false,
        error:
          'Supabase OAuth is not configured on the server. Set SUPABASE_OAUTH_CLIENT_ID/SECRET on Fly (Org → OAuth Apps).',
      };
    }

    const popup = window.open(
      'about:blank',
      'xroga-supabase-oauth',
      'width=560,height=720,scrollbars=yes,resizable=yes',
    );
    if (!popup) {
      window.location.href = url;
      return { opened: true, popup: false, oauthConfigured: true };
    }

    try {
      popup.location.href = url;
      popup.focus();
    } catch {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      window.location.href = url;
      return { opened: true, popup: false, oauthConfigured: true };
    }

    return { opened: true, popup: true, oauthConfigured: true };
  } catch (err) {
    const raw = (err as Error).message || '';
    const network =
      /failed to fetch|networkerror|load failed|network request failed/i.test(raw) ||
      raw === 'Failed to fetch';
    return {
      opened: false,
      popup: false,
      oauthConfigured: true,
      error: network
        ? 'Cannot reach the Xroga API to start Supabase login. Check you are signed in and try again.'
        : raw || 'Could not start Supabase authorization',
    };
  }
}

function isSupabasePayload(data: OAuthResultPayload): boolean {
  return data.type === 'xroga-supabase-connected' || data.type === 'xroga-supabase-error';
}

/**
 * Listen for Supabase OAuth completion (postMessage + storage + BroadcastChannel + status poll).
 * Covers COOP nulling window.opener after authorize.
 */
export function listenSupabaseOAuthMessages(
  onConnected: (result: SupabaseOAuthSuccess) => void,
  onError?: (message: string) => void,
  opts?: { pollMs?: number; pollTimeoutMs?: number },
): () => void {
  let settled = false;
  let poll = 0;
  let timeout = 0;
  let unsubBus: (() => void) | null = null;

  const cleanup = () => {
    unsubBus?.();
    unsubBus = null;
    if (poll) window.clearInterval(poll);
    if (timeout) window.clearTimeout(timeout);
    poll = 0;
    timeout = 0;
  };

  const finishOk = (result: SupabaseOAuthSuccess) => {
    if (settled) return;
    settled = true;
    clearOAuthResult();
    cleanup();
    onConnected(result);
  };

  const finishErr = (message: string) => {
    if (settled) return;
    settled = true;
    clearOAuthResult();
    cleanup();
    onError?.(message);
  };

  const onPayload = (data: OAuthResultPayload) => {
    if (!isSupabasePayload(data)) return;
    if (data.type === 'xroga-supabase-connected') {
      finishOk({
        provisioned: Boolean(data.provisioned),
        needsProjectPick: Boolean(data.needsProjectPick),
        projects: (data.projects as SupabaseOAuthSuccess['projects']) ?? [],
        message: typeof data.message === 'string' ? data.message : undefined,
      });
    } else if (data.type === 'xroga-supabase-error') {
      finishErr(typeof data.message === 'string' ? data.message : 'Supabase connection failed');
    }
  };

  unsubBus = subscribeOAuthResults(onPayload);

  const pollMs = opts?.pollMs ?? 1500;
  const pollTimeoutMs = opts?.pollTimeoutMs ?? 5 * 60 * 1000;

  poll = window.setInterval(() => {
    void (async () => {
      try {
        const status = await api.supabase.status();
        if (status.oauthConnected || status.connected) {
          finishOk({
            provisioned: Boolean(status.provisioned || status.ready),
            needsProjectPick: !status.provisioned && !status.ready,
            message: status.message,
          });
        }
      } catch {
        /* keep polling */
      }
    })();
  }, pollMs);

  timeout = window.setTimeout(() => {
    finishErr('Supabase authorization timed out. Click Authorize again.');
  }, pollTimeoutMs);

  return () => {
    if (!settled) {
      settled = true;
      cleanup();
    }
  };
}
