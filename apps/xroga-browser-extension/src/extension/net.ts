// The recording kept in the offscreen document is named recording:last wherever a media address is taken (compose_video, media, convert_media, transcribe).
export const recordings = {
  last: undefined as string | undefined,
  /** Lets the offscreen document forget a blob URL it held. */
  release: undefined as ((url: string) => void) | undefined,
  /** Keeps a new recording's address; the one before it is let go. */
  keep(url: string): void {
    if (this.last && this.last !== url) this.release?.(this.last);
    this.last = url;
  },
};

export const RECORDING_ADDRESS = 'recording:last';

/** The address to fetch: recording:last is the kept recording's blob URL; anything else is left as it is. */
export function resolveAddress(url: string): string {
  if (url !== RECORDING_ADDRESS) return url;
  if (!recordings.last) throw new Error('no recording is kept: record the tab with record_screen first');
  return recordings.last;
}

// fetch with a short retry on a network failure (the connection dropped or timed out), never on an answer: a 404 or 403 is final.
export async function fetchRetry(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(resolveAddress(url), init);
    } catch (error) {
      last = error;
      if (init.signal?.aborted) break;
      await new Promise(resolve => setTimeout(resolve, 600 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}
