/** Shared Vercel OAuth / token connect helpers for Integrations + deploy buttons. */

import { api } from '@/lib/api';
import {
  clearOAuthResult,
  subscribeOAuthResults,
  type OAuthResultPayload,
} from '@/lib/oauthPopupResult';

export const VERCEL_INTEGRATIONS_PATH =
  '/dashboard/integrations?focus=vercel&vercel=setup#ship-setup';

/** True when authorize failed because PKCE/session table is missing or DB bootstrap failed. */
export function isVercelSessionStoreError(message?: string): boolean {
  if (!message) return false;
  // Only treat as session-store failure when authorize truly cannot start
  return /session store failed|storage fallback failed|Could not store OAuth session/i.test(message);
}

/** Leave chat/popup and open Integrations (Ship setup + token paste). */
export function goToVercelIntegrations(opts?: { error?: string }): void {
  if (typeof window === 'undefined') return;
  try {
    if (opts?.error) {
      sessionStorage.setItem('xroga-vercel-setup-error', opts.error.slice(0, 280));
    }
  } catch {
    /* ignore */
  }
  window.location.assign(VERCEL_INTEGRATIONS_PATH);
}

export async function openVercelOAuthPopup(): Promise<{
  opened: boolean;
  /** true when a real popup window was opened; false when we fell back to same-tab */
  popup: boolean;
  oauthConfigured: boolean;
  error?: string;
  /** Caller should leave popup UX and open Integrations */
  goToIntegrations?: boolean;
}> {
  try {
    clearOAuthResult();
    // Resolve authorize URL BEFORE opening any window — never leave a blank popup on failure
    const res = await api.vercel.oauthUrl();
    const { url, oauthConfigured } = res;
    if (!url || !oauthConfigured) {
      return {
        opened: false,
        popup: false,
        oauthConfigured: false,
        goToIntegrations: true,
        error:
          'Vercel OAuth is not configured on the server. Open Integrations and paste a personal token from vercel.com/account/tokens.',
      };
    }

    const popup = window.open(
      'about:blank',
      'xroga-vercel-oauth',
      'width=600,height=720,scrollbars=yes,resizable=yes',
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
    const sessionStore = isVercelSessionStoreError(raw);
    return {
      opened: false,
      popup: false,
      oauthConfigured: !sessionStore,
      goToIntegrations: true,
      error: network
        ? 'Cannot reach the Xroga API to start Vercel login. Open Integrations to paste a Vercel token.'
        : sessionStore
          ? 'Vercel authorize needs a database table that is missing. Opening Integrations — paste a Vercel personal token to connect now.'
          : raw || 'Could not start Vercel authorization',
    };
  }
}

function isVercelPayload(data: OAuthResultPayload): boolean {
  return data.type === 'xroga-vercel-connected' || data.type === 'xroga-vercel-error';
}

/**
 * Listen for Vercel OAuth completion via postMessage, storage, BroadcastChannel,
 * and status polling (covers COOP nulling window.opener).
 */
export function listenVercelOAuthMessages(
  onConnected: (username?: string) => void,
  onError?: (message: string) => void,
  opts?: { pollMs?: number; pollTimeoutMs?: number }
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

  const finishOk = (username?: string) => {
    if (settled) return;
    settled = true;
    clearOAuthResult();
    cleanup();
    onConnected(username);
  };

  const finishErr = (message: string) => {
    if (settled) return;
    settled = true;
    clearOAuthResult();
    cleanup();
    onError?.(message);
  };

  const onPayload = (data: OAuthResultPayload) => {
    if (!isVercelPayload(data)) return;
    if (data.type === 'xroga-vercel-connected') {
      finishOk(typeof data.username === 'string' ? data.username : undefined);
    } else if (data.type === 'xroga-vercel-error') {
      finishErr(typeof data.message === 'string' ? data.message : 'Vercel connection failed');
    }
  };

  unsubBus = subscribeOAuthResults(onPayload);

  const pollMs = opts?.pollMs ?? 1500;
  const pollTimeoutMs = opts?.pollTimeoutMs ?? 5 * 60 * 1000;

  poll = window.setInterval(() => {
    void (async () => {
      try {
        const status = await api.vercel.status();
        if (status.connected) {
          finishOk(status.username);
        }
      } catch {
        /* keep polling */
      }
    })();
  }, pollMs);

  timeout = window.setTimeout(() => {
    finishErr('Vercel authorization timed out. Click Authorize again.');
  }, pollTimeoutMs);

  return () => {
    if (!settled) {
      settled = true;
      cleanup();
    }
  };
}
