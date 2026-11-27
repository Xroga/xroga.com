/** The voice server scales to zero, so the first request after idle waits for it to boot. Waking it
 * when a signed-in person opens or returns to the Workspace spends that wait before they speak.
 * It runs on activity only, never on a timer, so an abandoned tab sends nothing. */
export const VOICE_WARMUP_GAP_MS = 5 * 60 * 1000;

export function createVoiceWarmup(options: {
  warm: () => void;
  token: () => Promise<string | null | undefined>;
  visible: () => boolean;
  now?: () => number;
}): () => Promise<void> {
  const now = options.now ?? (() => Date.now());
  let last: number | undefined, checking = false;
  return async () => {
    if (checking || !options.visible() || last !== undefined && now() - last < VOICE_WARMUP_GAP_MS) return;
    checking = true;
    try {
      if (!await options.token()) return;
      last = now();
      options.warm();
    } catch { /* Best effort: recording wakes the server again. */ } finally { checking = false; }
  };
}
