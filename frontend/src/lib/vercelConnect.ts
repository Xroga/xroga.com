/** Shared Vercel OAuth / token connect helpers for Integrations + deploy buttons. */

import { api } from '@/lib/api';

export async function openVercelOAuthPopup(): Promise<{
  opened: boolean;
  /** true when a real popup window was opened; false when we fell back to same-tab */
  popup: boolean;
  oauthConfigured: boolean;
  error?: string;
}> {
  try {
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

    const popup = window.open(url, 'xroga-vercel-oauth', 'width=600,height=720,scrollbars=yes');
    if (!popup) {
      // Popup blocked (mobile / strict browsers) — same-tab authorize still works
      window.location.href = url;
      return { opened: true, popup: false, oauthConfigured: true };
    }

    try {
      popup.focus();
    } catch {
      /* ignore */
    }

    // Some browsers open about:blank then navigate; treat as opened
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

export function listenVercelOAuthMessages(
  onConnected: (username?: string) => void,
  onError?: (message: string) => void
): () => void {
  const handler = (e: MessageEvent) => {
    if (e.origin && typeof window !== 'undefined') {
      try {
        const allowed = new URL(window.location.origin).origin;
        if (e.origin !== allowed && e.origin !== 'https://xroga.com' && e.origin !== 'https://www.xroga.com') {
          // Still accept if same site family — postMessage from callback on same app
          if (!e.origin.includes('xroga.com') && !e.origin.includes('localhost')) return;
        }
      } catch {
        /* ignore */
      }
    }
    if (e.data?.type === 'xroga-vercel-connected') {
      onConnected(typeof e.data.username === 'string' ? e.data.username : undefined);
    }
    if (e.data?.type === 'xroga-vercel-error') {
      onError?.(typeof e.data.message === 'string' ? e.data.message : 'Vercel connection failed');
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
