/** Map internal API errors to user-friendly voice messages (never expose provider names). */
export function toVoiceUserError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();

  if (lower.includes('recording too short')) return raw;
  if (lower.includes('could not hear')) return raw;
  if (lower.includes('sign in')) return raw;

  if (
    lower.includes('gemini') ||
    lower.includes('groq') ||
    lower.includes('api error') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('whisper') ||
    lower.includes('tts') ||
    lower.includes('not configured')
  ) {
    return 'Voice AI is busy right now — please try again in a moment.';
  }

  return raw.length > 120 ? 'Something went wrong — please try again.' : raw;
}
