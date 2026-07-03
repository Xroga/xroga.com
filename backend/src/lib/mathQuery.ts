/** Math / STEM queries — fast chat, never architect DAG or background queue */

import { routingPrompt } from './promptRouting.js';

export function isMathQuery(prompt: string): boolean {
  const t = routingPrompt(prompt).toLowerCase();
  if (t.length > 500) return false;
  return (
    /\bsolve\s+for\b/.test(t) ||
    /\b(solve|simplify|factor|expand|derive|integrate|differentiate)\b/.test(t) ||
    /\b(equation|polynomial|quadratic|linear equation|algebra)\b/.test(t) ||
    /[0-9x]\s*[+\-*/^=]\s*[0-9x]/.test(t) ||
    /\\\(|\\\)|\$\$/.test(t)
  );
}
