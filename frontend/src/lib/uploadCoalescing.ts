/**
 * Decides whether a terminal-session save is worth sending to the server.
 *
 * Autosave is driven by React state: it fires on repo selection, on remount, on
 * window focus, on a resumed workspace and after every chat turn. Most of those
 * carry a payload byte-identical to the one already stored, and each one used to
 * become a full upload of up to 300 messages plus a full response echoing them
 * back. That amplification is the frontend half of the Supabase egress overrun.
 *
 * The state here is deliberately kept free of any `@/`-aliased import so it can be
 * unit-tested directly; `cloudTerminalSessions` owns the network calls that consume
 * these decisions.
 */

export interface UploadPayload {
  githubRepoName: string;
  githubBranch?: string;
  title?: string;
  prompt?: string;
  preview?: string;
  messages: unknown[];
  kind?: string;
  status?: string;
}

/**
 * Order-sensitive fingerprint of exactly what a save would persist.
 *
 * Only fields the server actually stores are included, so a purely local change —
 * a re-render, a new array identity, a recomputed timestamp — cannot masquerade as
 * a change worth uploading.
 */
export function fingerprintUpload(body: UploadPayload): string {
  try {
    return JSON.stringify([
      body.githubRepoName,
      body.githubBranch ?? '',
      body.title ?? '',
      body.prompt ?? '',
      body.preview ?? '',
      body.kind ?? '',
      body.status ?? '',
      body.messages.length,
      body.messages,
    ]);
  } catch {
    // Unserializable payload: return a unique value so the upload still happens.
    // Failing open costs one request; failing closed would silently lose a session.
    return `unhashable:${Math.random()}`;
  }
}

/** sessionId → fingerprint of the payload the server last accepted. */
const lastUploadedFingerprint = new Map<string, string>();
/** sessionId → when the server last accepted anything for it. */
const lastUploadedAt = new Map<string, number>();

/**
 * True when this exact payload is already on the server, so sending it again
 * would spend a round trip storing what is already stored.
 */
export function isDuplicateUpload(sessionId: string, fingerprint: string): boolean {
  return lastUploadedFingerprint.get(sessionId) === fingerprint;
}

export function rememberUpload(sessionId: string, fingerprint: string, at: number): void {
  lastUploadedFingerprint.set(sessionId, fingerprint);
  lastUploadedAt.set(sessionId, at);
}

/** First save for a session is worth sending promptly so "#1 terminal" appears. */
export function isFirstUpload(sessionId: string): boolean {
  return !lastUploadedAt.has(sessionId);
}

/**
 * Debounce window for a queued save.
 *
 * The first save stays near-instant. Later saves are coalesced over a longer
 * window: during an active response the payload changes on every settled token
 * batch, and the previous 900ms was short enough to upload the whole transcript
 * several times within a single answer.
 */
export const FIRST_UPLOAD_DELAY_MS = 80;
export const SUBSEQUENT_UPLOAD_DELAY_MS = 4_000;

export function uploadDelayMs(sessionId: string): number {
  return isFirstUpload(sessionId) ? FIRST_UPLOAD_DELAY_MS : SUBSEQUENT_UPLOAD_DELAY_MS;
}

/** Test-only: start a case from a clean slate. */
export function resetUploadCoalescing(): void {
  lastUploadedFingerprint.clear();
  lastUploadedAt.clear();
}
