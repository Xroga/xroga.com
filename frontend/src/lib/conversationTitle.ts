const tidy = (text?: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

export function isPlaceholderConversationTitle(title?: string | null): boolean {
  return !tidy(title) || /^(?:#?\d+\s+terminal|terminal(?:\s*(?:#?\d+|session))?|untitled conversation|new chat)$/i.test(tidy(title));
}

/** Automatic title is derived once; the manual sidebar override is separate. */
export function stableConversationTitle(
  title?: string | null,
  messages?: ReadonlyArray<{ role: string; content: string }>,
  initialPrompt?: string | null,
): string {
  if (!isPlaceholderConversationTitle(title)) return tidy(title).slice(0, 120);
  const prompt = messages?.find(message => message.role === 'user' && tidy(message.content))?.content;
  const source = tidy(prompt || initialPrompt).replace(/^[#*>\s]+/, '');
  if (isPlaceholderConversationTitle(source)) return 'Untitled conversation';
  if (source.length <= 90) return source;
  const limit = source.slice(0, 89);
  const boundary = limit.lastIndexOf(' ');
  return `${boundary >= 60 ? limit.slice(0, boundary) : limit}…`;
}
