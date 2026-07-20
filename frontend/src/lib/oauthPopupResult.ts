/**
 * Cross-window OAuth completion bus.
 *
 * Vercel (and some IdPs) set Cross-Origin-Opener-Policy so `window.opener`
 * becomes null after authorize. postMessage alone is not enough — also write
 * localStorage + BroadcastChannel so the opener tab always learns the result.
 */

const STORAGE_KEY = 'xroga-oauth-result';
const CHANNEL = 'xroga-oauth';

export type OAuthResultPayload = {
  type: string;
  username?: string;
  message?: string;
  needsProjectPick?: boolean;
  projects?: unknown[];
  autoSelected?: boolean;
  provisioned?: boolean;
  t?: number;
};

export function publishOAuthResult(payload: OAuthResultPayload): void {
  const full: OAuthResultPayload = { ...payload, t: Date.now() };

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(full, '*');
    }
  } catch {
    /* COOP / closed */
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  } catch {
    /* private mode */
  }

  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(full);
    bc.close();
  } catch {
    /* unsupported */
  }
}

export function subscribeOAuthResults(
  handler: (payload: OAuthResultPayload) => void
): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.data && typeof e.data === 'object' && typeof (e.data as OAuthResultPayload).type === 'string') {
      handler(e.data as OAuthResultPayload);
    }
  };

  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      handler(JSON.parse(e.newValue) as OAuthResultPayload);
    } catch {
      /* ignore */
    }
  };

  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => {
      if (e.data && typeof e.data === 'object') handler(e.data as OAuthResultPayload);
    };
  } catch {
    bc = null;
  }

  window.addEventListener('message', onMessage);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('storage', onStorage);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}

/** Clear a stale result so the next authorize does not replay it. */
export function clearOAuthResult(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
