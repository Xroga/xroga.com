// Which already-open tab a request names. The user says "use my TraceDraw tab", "I have opened X" or "on this open Variant contact form tab"; the run
// should start on that tab instead of on its own blank one. This only produces candidate words, taken from the user's own sentence: the layer's
// `tabs adopt` then matches them against the titles and addresses of tabs in the session's window and refuses ambiguity, so a word can never
// reach a tab the user did not name.

const SIGNALS = /\b(?:already open(?:ed)?|have (?:it )?open(?:ed)?|i(?:'| ha)ve opened|(?:my|the|this) (?:open )?tab|open tab|opened tab|currently open|in (?:my|the) browser|(?:this|my|the|that|current) (?:open(?:ed)?|current) [a-z0-9][\w .&'-]{0,60}?(?:tab|page|window)|(?:on|in|at) (?:this|my|the) open)\b/i;

const STOP = new Set([
  'already', 'opened', 'open', 'tab', 'tabs', 'this', 'that', 'with', 'from', 'into', 'then', 'draw', 'make', 'create', 'export', 'save', 'file', 'using',
  'browser', 'window', 'page', 'site', 'website', 'document', 'new', 'use', 'please', 'there', 'here', 'have', 'which', 'each', 'also', 'next', 'under',
  'side', 'text', 'blue', 'red', 'green', 'yellow', 'black', 'white', 'color', 'colour', 'logo', 'image', 'edit', 'editor', 'application', 'app', 'current',
]);

/** Candidate names from a request that says a tab is already open, most specific first. Empty when the request does not say so. */
export function namedTabCandidates(request: string): string[] {
  if (!SIGNALS.test(request)) return [];
  const out: string[] = [];
  const add = (word: string) => {
    const w = word.toLowerCase();
    if (w.length >= 4 && !STOP.has(w) && !out.includes(w)) out.push(w);
  };
  // "this open Variant contact form tab": every meaningful word between open and tab/page/window names the tab. Most specific, so first.
  for (const m of request.matchAll(/\b(?:open(?:ed)?|current)\s+((?:[A-Za-z0-9-]+\s+){0,4}?[A-Za-z0-9-]+)\s+(?:tab|page|window)\b/gi)) for (const w of m[1].split(/\s+/)) add(w);
  // A product or site name: a capitalised word that is not the first of the sentence, or a CamelCase word, or something that looks like a host.
  for (const m of request.matchAll(/\b((?:[a-z0-9-]+\.)+(?:com|org|net|io|app|dev|ai|co))\b/gi)) add(m[1]);
  for (const m of request.matchAll(/(?<![.!?]\s)(?<!^)\b([A-Z][A-Za-z0-9]{3,})\b/g)) add(m[1]);
  // "my X tab" / "the X tab"
  for (const m of request.matchAll(/\b(?:my|the|this)\s+([A-Za-z0-9-]{4,})\s+(?:tab|editor|app|page|site)\b/gi)) add(m[1]);
  return out.slice(0, 4);
}
