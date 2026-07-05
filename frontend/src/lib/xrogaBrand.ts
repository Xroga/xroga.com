/** Strip underlying AI provider names from user-visible terminal text */
const PROVIDER_PATTERNS: Array<[RegExp, string]> = [
  [/\b(as (the )?)?(Groq|Gemini|DeepSeek|OpenAI|Anthropic|Claude|GPT-?4|GPT-?3|Mistral|ChatGPT)(\s+(Sprinter|Polymath|Architect|Showrunner|Flash|Neural|Code))?\b/gi, 'XROGA AI Black Hole'],
  [/\bDeepSeek Code\b/gi, 'XROGA AI Black Hole'],
  [/\bDeepSeek Game Alchemist\b/gi, 'XROGA Game Alchemist'],
  [/\bI am (the )?(Groq|Gemini|DeepSeek|Claude|GPT)\b[^.\n]*/gi, 'I am XROGA AI Black Hole'],
  [/---\s*(Gemini|Groq|DeepSeek|Mistral|Claude|GPT)[^-\n]*---\s*/gi, ''],
  [/\bGemini Master Plan\b/gi, 'XROGA Master Plan'],
  [/\bDeepSeek\b/gi, 'XROGA AI Black Hole'],
  [/\bMistral\b/gi, 'XROGA Co-Architect'],
  [/\bGroq\b/gi, 'XROGA Pulse'],
  [/\bGemini\b/gi, 'XROGA Visionary'],
];

export function sanitizeXrogaTerminalText(text: string | null | undefined): string {
  if (text == null) return '';
  let out = String(text);
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

export function clearGitHubConnectedSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(GITHUB_CONNECTED_SESSION_KEY);
}

export function isGitHubConnectedSession(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(GITHUB_CONNECTED_SESSION_KEY) === '1';
}

const GITHUB_CONNECT_MSG = /connect your github account to start building/i;

export function isGitHubConnectRequiredText(text: string): boolean {
  return GITHUB_CONNECT_MSG.test(text);
}
