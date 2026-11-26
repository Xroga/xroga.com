// A request that names a site to open ("Go to xroga.com and tell me the heading", "Open https://example.com in a new tab") does not
// need a model turn to decide where to go: the address is in the words. The run opens it first and the model starts from the page.

export interface DirectNavigation {
  url: string;
  /** The request asks for a new tab. */
  newTab: boolean;
}

const OPENING = /^\s*(?:please\s+)?(?:(?:can|could) you\s+)?(?:go to|goto|open|visit|navigate to|browse to|head to|load|take me to)\b/i;
const HOST = /\b((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?::\d+)?(\/[^\s"'<>)]*)?/i;
const SCHEME = /\bhttps?:\/\/[^\s"'<>)]+/i;
// Words that look like a domain but are file names or abbreviations.
const NOT_A_SITE = /\.(?:png|jpe?g|gif|webp|svg|pdf|docx?|xlsx?|csv|txt|md|json|zip|js|ts|css|html?)$/i;

/** The one site a request names, when it starts by asking to go there. Anything less clear is left to the model. */
export function directNavigation(request: string): DirectNavigation | null {
  const text = request.trim();
  if (!OPENING.test(text)) return null;
  const explicit = SCHEME.exec(text)?.[0];
  let url: string | undefined;
  if (explicit) {
    url = explicit.replace(/[.,;:!?]+$/, '');
  } else {
    const found = HOST.exec(text);
    if (!found || NOT_A_SITE.test(found[1])) return null;
    url = `https://${found[1]}${(found[2] ?? '').replace(/[.,;:!?]+$/, '')}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    // Two different sites in one request is a comparison or a multi-step task: the model plans it.
    const others = text.match(new RegExp(HOST.source, 'gi'))?.map(m => m.toLowerCase().replace(/^https?:\/\//, '')) ?? [];
    const hosts = new Set(others.map(m => m.split('/')[0].replace(/^www\./, '')));
    if (hosts.size > 1) return null;
    return { url: parsed.href, newTab: /\bnew tab\b/i.test(text) };
  } catch {
    return null;
  }
}
