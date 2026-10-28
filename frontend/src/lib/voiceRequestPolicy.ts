/** Only the backend's explicit ordinary availability result permits retaining
 * already-visible browser speech as a fallback. Unknown, security, accounting,
 * cancellation and session-change failures never authorize automatic sending.
 */
export function isTerminalVoiceFailure(error: unknown): boolean {
  const value = error as {status?: unknown; data?: {code?: unknown}} | null;
  return value?.status !== 503 || value.data?.code !== 'VOICE_PROVIDER_UNAVAILABLE';
}

export function voiceClientAwait<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(Object.assign(new Error('Voice request cancelled.'), {name: 'AbortError'}));
    if (signal.aborted) {pending.catch(() => {}); abort(); return;}
    signal.addEventListener('abort', abort, {once: true});
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
