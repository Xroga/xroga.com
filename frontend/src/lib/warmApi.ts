import { warmVoiceBackend } from './voiceApi';

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
 * Starts the API while a message is still being written. It reuses the reviewed wake-up request: no
 * credential, no message, and the response is ignored. Voice and chat are served by the same service.
 */
export const warmApi = createApiWarmer(warmVoiceBackend);
