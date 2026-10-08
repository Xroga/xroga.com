/** Voice turns use the same unmodified text as typed chat. Risky recognition is reviewed first. */
export function requiresVoiceReview(transcript: string): boolean {
  return /\b(?:don't|do not|never|without|not|deploy|publish|send|email|delete|remove|pay|purchase|transfer|cancel)\b|مت|نہیں|मत|नहीं|لا\s|لا تن|بدون|منع/iu.test(transcript);
}

export function spokenReply(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Code details are in the chat. ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

export function preferredSpeechLanguage(text: string): string {
  if (/[\u0600-\u06ff]/u.test(text)) return /[ٹڈڑںےھ]/u.test(text) ? 'ur-PK' : 'ar-SA';
  if (/[\u0900-\u097f]/u.test(text)) return 'hi-IN';
  return 'en-US';
}

/** A permission prompt can resolve after End; those tracks must never become live. */
export function acceptMicStream(
  tracks: ArrayLike<{ stop: () => void }>,
  requestedGeneration: number,
  currentGeneration: number,
  ending: boolean,
): boolean {
  if (requestedGeneration === currentGeneration && !ending) return true;
  Array.from(tracks).forEach((track) => track.stop());
  return false;
}
