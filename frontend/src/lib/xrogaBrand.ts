/** Strip underlying AI provider names from user-visible terminal text */
const PROVIDER_PATTERNS: Array<[RegExp, string]> = [
  [/\b(as (the )?)?(Groq|Gemini|DeepSeek|OpenAI|Anthropic|Claude|GPT-?4|GPT-?3|Mistral|ChatGPT)(\s+(Sprinter|Polymath|Architect|Showrunner|Flash|Neural))?\b/gi, 'XROGA AI'],
  [/\bI am (the )?(Groq|Gemini|DeepSeek|Claude|GPT)\b[^.\n]*/gi, 'I am XROGA AI'],
  [/---\s*(Gemini|Groq|DeepSeek|Mistral|Claude|GPT)[^-\n]*---\s*/gi, ''],
  [/\bGemini Master Plan\b/gi, 'XROGA Master Plan'],
  [/\bDeepSeek\b/gi, 'XROGA Architect'],
  [/\bMistral\b/gi, 'XROGA Co-Architect'],
];

export function sanitizeXrogaTerminalText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PROVIDER_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

export const GITHUB_CONNECTED_SESSION_KEY = 'xroga-github-connected-session';

export function markGitHubConnectedSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GITHUB_CONNECTED_SESSION_KEY, '1');
}

export function isGitHubConnectedSession(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(GITHUB_CONNECTED_SESSION_KEY) === '1';
}
