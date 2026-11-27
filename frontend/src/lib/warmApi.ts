import { apiFetch } from './api';

/** The API scales to zero, so the first request after a quiet spell waits for it to start. */
export const WARM_AGAIN_AFTER_MS = 4 * 60_000;

export function createApiWarmer(wake: () => void, now: () => number = Date.now): () => void {
  let last: number | undefined;
  return () => {
    const at = now();
    if (last !== undefined && at - last < WARM_AGAIN_AFTER_MS) return;
    last = at;
    wake();
  };
}

/**
 * Starts the API while a message is still being written, with its own health check through the shared
 * client. No message is sent and the response is ignored. The voice server can run elsewhere, so waking it
 * would not wake the service that answers.
 */
export const warmApi = createApiWarmer(() => { void apiFetch('/health').catch(() => {}); });
