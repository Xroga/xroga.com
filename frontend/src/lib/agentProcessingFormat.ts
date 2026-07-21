/** Honest SSE activity line cleanup — no Architect/Pulse theater rewrites. */

import { sanitizeXrogaTerminalText } from '@/lib/xrogaBrand';

export function formatAgentActivityLine(raw: string): string {
  const line = sanitizeXrogaTerminalText(raw.trim());
  if (!line) return '';
  return line.replace(/\[Phase \d+\]\s*/gi, '').replace(/^🚀\s*/, '').trim() || line;
}
