/** Optional language for dictation. Automatic detection is the default; a speaker whose language is
 * being mistaken for a close one (Hindi written as Urdu) can name it. The voice server accepts only
 * these codes. */
export const VOICE_LANGUAGES = [
  {code: '', label: 'Auto'},
  {code: 'en', label: 'English'},
  {code: 'ur', label: 'اردو'},
  {code: 'hi', label: 'हिन्दी'},
  {code: 'ar', label: 'العربية'},
  {code: 'bn', label: 'বাংলা'},
  {code: 'de', label: 'Deutsch'},
  {code: 'es', label: 'Español'},
  {code: 'fa', label: 'فارسی'},
  {code: 'fr', label: 'Français'},
  {code: 'pa', label: 'ਪੰਜਾਬੀ'},
  {code: 'pt', label: 'Português'},
  {code: 'ru', label: 'Русский'},
  {code: 'tr', label: 'Türkçe'},
  {code: 'zh', label: '中文'},
] as const;

const KEY = 'xroga.voice.language';
type Memory = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function isVoiceLanguage(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && VOICE_LANGUAGES.some(language => language.code === value);
}

export function readVoiceLanguage(memory?: Memory): string {
  try { const value = (memory ?? window.localStorage).getItem(KEY); return isVoiceLanguage(value) ? value : ''; } catch { return ''; }
}

export function saveVoiceLanguage(value: string, memory?: Memory): void {
  try {
    const target = memory ?? window.localStorage;
    if (value === '') target.removeItem(KEY);
    else if (isVoiceLanguage(value)) target.setItem(KEY, value);
  } catch { /* Storage can be blocked; the choice then lasts for this page only. */ }
}
