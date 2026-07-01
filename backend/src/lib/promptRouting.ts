/**
 * Extract the user's actual message when the frontend wraps prior thread context.
 * Format: `[Previous conversation...]\n...\n\n[Current message]\n{actual prompt}`
 */
const CURRENT_MESSAGE_MARKER = /\[Current message\]\s*\n([\s\S]*)$/i;

export function extractCurrentUserMessage(prompt: string): string {
  const trimmed = prompt.trim();
  const match = CURRENT_MESSAGE_MARKER.exec(trimmed);
  if (match?.[1]?.trim()) return match[1].trim();
  return trimmed;
}

/** Prompt slice used for routing, classification, and moderation — never the memory wrapper. */
export function routingPrompt(prompt: string): string {
  return extractCurrentUserMessage(prompt);
}
