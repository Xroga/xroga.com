/** Shared Vercel OAuth / token connect helpers for Integrations + deploy buttons. */

import { api } from '@/lib/api';
import {
  clearOAuthResult,
  subscribeOAuthResults,
  type OAuthResultPayload,
} from '@/lib/oauthPopupResult';

export async function openVercelOAuthPopup(): Promise<{
  opened: boolean;
  /** true when a real popup window was opened; false when we fell back to same-tab */
  popup: boolean;
  oauthConfigured: boolean;
  error?: string;
}> {
  try {
    clearOAuthResult();
    const { url, oauthConfigured } = await api.vercel.oauthUrl();
    if (!url || !oauthConfigured) {
      return {
        opened: false,
        popup: false,
        oauthConfigured: false,
        error:
          'Vercel OAuth is not configured on the server. Paste a personal token from vercel.com/account/tokens instead.',
      };
    }

    // Open blank first (keeps user-gesture → popup), then navigate — more reliable than
    // window.open(longCrossOriginUrl) which some browsers treat as a blocked navigation.
    const popup = window.open(
      'about:blank',
      'xroga-vercel-oauth',
      'width=600,height=720,scrollbars=yes,resizable=yes'
    );
    if (!popup) {
      // Popup blocked (mobile / strict browsers) — same-tab authorize still works
      window.location.href = url;
      return { opened: true, popup: false, oauthConfigured: true };
    }

    try {
      popup.location.href = url;
      popup.focus();
    } catch {
      // If we cannot set location (rare), fall back to same-tab
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
        ? 'Cannot reach the Xroga API to start Vercel login. Check your connection and try again — or paste a Vercel token under Integrations.'
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
    // Soft stop — do not toast error if caller already cleaned up; only notify if still waiting
    finishErr('Vercel authorization timed out. Click Authorize again.');
  }, pollTimeoutMs);

  return () => {
    if (!settled) {
      settled = true;
      cleanup();
    }
  };
}
