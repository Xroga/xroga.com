// What the server checks before it accepts a result that no model turn produced (a "direct" read, see agent/direct-read.ts in the
// extension). The device cannot make a run eligible by sending a flag: the run's own recorded goal has to be a plain "open this site and
// read its heading or title" request, the answer has to name the site the run was started on, and the run has to be young.
// This mirrors the extension's matcher on purpose and is stricter where it can be; a request that is not clearly this goes to the model.

const OPENING = /^\s*(?:please\s+)?(?:(?:can|could) you\s+)?(?:go to|goto|open|visit|navigate to|browse to|head to|load|take me to)\s+/i;
const SITE = /^(?:in a new tab\s+)?(?:https?:\/\/[^\s"'<>)]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s"'<>)]*)?)/i;
const READ_VERB = /\b(?:and|then|,)?\s*(?:please\s+)?(?:read|tell me|what(?:'s| is)|get|show me|give me|extract|find|return)\b/i;
const TARGET = /\b(?:the\s+)?(?:first\s+|main\s+|top\s+)?(?:visible\s+|page\s+)*(heading|headline|title|h1)\b/i;
const MORE_THAN_A_READ =
  /\b(?:click|press|type|fill|search|log ?in|sign ?in|sign ?up|submit|download|upload|buy|order|compare|summari[sz]e|explain|translate|why|how|analy[sz]e|each|every|all|list|then\s+(?:open|go|click)|and\s+(?:click|open|go|search|then)|if|whether|after)\b/i;
const FILLER = /^(?:(?:of|on|in|at|from)\s+(?:the\s+)?(?:page|site|website|it|there|home ?page)|there|please)$/i;
const ANY_HOST = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}\b/gi;

/** Whether a goal is nothing but "open one site and read its heading or title". */
export function isPlainOpenAndRead(goal: string): boolean {
  const text = goal.trim();
  if (text.length === 0 || text.length > 160 || text.includes('\n')) return false;
  if (!OPENING.test(text)) return false;
  const afterOpening = text.replace(OPENING, '');
  const site = SITE.exec(afterOpening);
  if (!site) return false;
  const rest = afterOpening.slice(site[0].length).trim();
  if (!READ_VERB.test(rest) || MORE_THAN_A_READ.test(rest)) return false;
  // One site only: a second address anywhere in the request makes it a comparison or a multi-step task.
  const hosts = new Set((text.match(ANY_HOST) ?? []).map(h => h.toLowerCase().replace(/^www\./, '')));
  if (hosts.size > 1) return false;
  const target = TARGET.exec(rest);
  if (!target) return false;
  const tail = rest.slice(rest.search(TARGET) + target[0].length).replace(/[\s.?!]+$/g, '').trim();
  return !tail || FILLER.test(tail);
}

const hostKey = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The answer has to name the site the run was started on, as the extension's answer always does. */
export function namesSite(result: string, startUrl: string): boolean {
  const host = hostKey(startUrl);
  return !!host && result.toLowerCase().includes(host);
}

/** How old a run may be when it is completed without a model turn: a plain read takes seconds. */
export const DIRECT_READ_MAX_AGE_MS = 5 * 60_000;
