/** Recognize an explicit request to connect an app before action-tool discovery. */
export function connectionSearchTerms(message: string): string[] | null {
  const text = message.trim().toLowerCase();
  // A requested URL/source "link" is a noun, not authorization to link an app.
  const linkCommand = /(?:^|[;.!?]\s*|\b(?:please|can you|could you|would you|i want to|we want to|and|then)\s+)link\s+(?:(?:my|our|the|to|with|an?)\s+){0,4}[a-z]/.test(text);
  if (!(/\b(?:connect|reconnect|authorize|authorise)\b/.test(text) || linkCommand)
    || /\b(?:do not|don't|without|never)\s+(?:want(?:ing)?\s+to\s+)?(?:connect|reconnect|link|authorize|authorise)\b/.test(text)) return null;

  const stop = new Set([
    'a', 'an', 'and', 'app', 'apps', 'account', 'accounts', 'authorize', 'authorise', 'automatic', 'automatically',
    'before', 'can', 'connect', 'connection', 'do', 'email', 'emails', 'first', 'for', 'from', 'give', 'help',
    'i', 'invite', 'it', 'link', 'me', 'my', 'now', 'of', 'our', 'please', 'reconnect', 'send', 'so', 'the', 'then',
    'to', 'try', 'us', 'use', 'want', 'we', 'with', 'xroga', 'you', 'your', 'plugin', 'plugins',
  ]);
  const tokens = [...text.matchAll(/[a-z][a-z0-9_.+-]*/g)]
    .map((match) => match[0])
    .filter((word) => word.length >= 3 && !stop.has(word));
  if (!tokens.length) return [];

  const anchored: string[] = [];
  for (const match of text.matchAll(/\b(?:connect|reconnect|link|authorize|authorise)\b\s+(?:(?:my|our|the|to|with|of|an?|app|account|plugin)\s+){0,4}([a-z][a-z0-9_.+-]*(?:\s+[a-z][a-z0-9_.+-]*)?)/g)) {
    const parts = match[1]!.split(/\s+/).filter((word) => !stop.has(word));
    if (parts.length === 2) anchored.push(parts.join(' '));
    if (parts[0]) anchored.push(parts[0]);
  }
  const frequencies = new Map<string, number>();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  const ranked = [...frequencies.keys()].sort((left, right) =>
    (frequencies.get(right) ?? 0) - (frequencies.get(left) ?? 0));
  const combined = tokens.length >= 2 && tokens[0] !== tokens[1] ? [`${tokens[0]} ${tokens[1]}`] : [];
  return [...new Set([...anchored, ...combined, ...ranked])].slice(0, 5);
}
