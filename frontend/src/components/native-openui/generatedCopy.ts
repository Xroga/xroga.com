/** Saved text ends with a plain-text copy of every visual, for Copy, Share and recovery.
 * When the program already shows the whole bound answer, that copy is not drawn a second time. */
export function withoutGeneratedVisualCopy(text: string, program: string): string {
  const literal = /(?:^|\n)_xroga_answer = (".*")[ \t]*(?:\r?\n|$)/.exec(program)?.[1];
  if (!literal) return text;
  let bound: unknown;
  try { bound = JSON.parse(literal); } catch { return text; }
  if (typeof bound !== 'string' || !bound.trim()) return text;
  const at = text.indexOf(bound);
  return at < 0 ? text : text.slice(0, at + bound.length);
}
