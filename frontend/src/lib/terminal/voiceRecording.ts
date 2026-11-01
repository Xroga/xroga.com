/** Preserve typed formatting and legitimate repeated words. Each session publishes once. */
export function appendVoiceTranscript(current: string, transcript: string): string {
  const text = transcript.trim();
  return text ? current + (current && !/\s$/.test(current) ? ' ' : '') + text : current;
}
