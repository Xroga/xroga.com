/** Only the backend's explicit ordinary availability result permits retaining
 * already-visible browser speech as a fallback. Unknown, security, accounting,
 * cancellation and session-change failures never authorize automatic sending.
 */
export function isTerminalVoiceFailure(error: unknown): boolean {
  const value = error as {status?: unknown; data?: {code?: unknown}} | null;
  return value?.status !== 503 || value.data?.code !== 'VOICE_PROVIDER_UNAVAILABLE';
}

/** One signal that aborts on timeout or cancellation. AbortSignal.any does not exist before iOS 17.4,
 * where calling it threw a TypeError and every voice upload failed before it was sent. */
export function voiceDeadline(timeoutMs: number, cancellation?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  if (cancellation?.aborted) { controller.abort(); return controller.signal; }
  const abort = () => {
    clearTimeout(timer);
    cancellation?.removeEventListener('abort', abort);
    controller.abort();
  };
  const timer = setTimeout(abort, timeoutMs);
  cancellation?.addEventListener('abort', abort, {once: true});
  return controller.signal;
}

function sessionClaims(token: string): {sub: string; session: string; issuer: unknown} | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload)) as {sub?: unknown; session_id?: unknown; iss?: unknown} | null;
    // Without a session identifier a later sign-in cannot be told apart, so it never matches.
    return typeof claims?.sub === 'string' && claims.sub && typeof claims.session_id === 'string' && claims.session_id
      ? {sub: claims.sub, session: claims.session_id, issuer: claims.iss} : null;
  } catch { return null; }
}

/** True when both access tokens belong to one signed-in session. Access tokens are refreshed while a
 * person is speaking, so comparing the token text would discard the recording. This only decides
 * whether the browser keeps sending; the server still verifies every token itself. */
export function sameVoiceAccount(original: string, current: string | null): boolean {
  if (!original || !current) return false;
  if (original === current) return true;
  const before = sessionClaims(original), after = sessionClaims(current);
  return !!before && !!after && before.sub === after.sub && before.session === after.session && before.issuer === after.issuer;
}

export function voiceClientAwait<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('Voice request cancelled.'), {name: 'AbortError'}));
    if (signal.aborted) {pending.catch(() => {}); abort(); return;}
    signal.addEventListener('abort', abort, {once: true});
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
