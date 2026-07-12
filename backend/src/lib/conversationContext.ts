export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TURNS = 4;
const MAX_CHARS_PER_TURN = 600;

/** Compact prior turns for council models — avoids repeating the last reply */
export function formatConversationContext(turns: ChatTurn[] | undefined): string {
  if (!turns?.length) return '';
  const slice = turns.slice(-MAX_TURNS);
  const lines = slice.map((t) => {
    const label = t.role === 'user' ? 'User' : 'XROGA';
    const body = t.content.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS_PER_TURN);
    return `${label}: ${body}`;
  });
  return `\n\nPrior conversation (do not repeat your last opening or reuse the same phrasing):\n${lines.join('\n')}`;
}

export const FRESHNESS_DIRECTIVE =
  'Treat this as a new turn. Never copy or lightly rephrase your previous reply. Answer only what the user asked now.';

export { getCurrentDateDirective } from './currentDateContext.js';
