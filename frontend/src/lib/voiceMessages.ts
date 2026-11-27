/** What the person is told when voice input fails. */
function common(failure: unknown): string | null {
  const name = failure instanceof Error ? failure.name : '';
  const status = (failure as { status?: number } | null)?.status;
  const code = (failure as { data?: { code?: unknown } } | null)?.data?.code;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Allow microphone access in your browser to start recording.';
  if (name === 'NotFoundError') return 'No microphone was found. Connect one and try again.';
  if (name === 'NotReadableError') return 'The microphone is busy or unavailable. Close other apps using it and try again.';
  if (status === 401 || code === 'VOICE_SESSION_CHANGED') return 'Please sign in again to use voice input. Your typed text is unchanged.';
  return null;
}

/** Recording never began, so there is nothing to retry or keep. */
export function describeVoiceStartFailure(failure: unknown): string {
  return common(failure) ?? 'The microphone could not start. Tap the mic to try again, or reload the page. Your typed text is unchanged.';
}

/** Something was recorded and turning it into text failed. */
export function describeVoiceFailure(failure: unknown): string {
  const known = common(failure);
  if (known) return known;
  if ((failure as { status?: number } | null)?.status === 429 && failure instanceof Error) return failure.message;
  if (failure instanceof TypeError) return 'Connection lost. Your recording is kept for a few minutes; retry when you are back online.';
  return 'Part of this recording could not be transcribed. Retry or record again. Your typed text is unchanged.';
}
