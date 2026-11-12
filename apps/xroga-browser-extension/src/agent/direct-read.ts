// Route A: a request that is only "open this site and read its heading (or title)" is answered from the page itself, with no model
// call. The match is deliberately narrow: anything with another verb, a second site, a condition or a question about meaning goes to
// the model. The answer is only given when the page really shows what was asked for; otherwise the normal path takes over.
import { directNavigation, type DirectNavigation } from './direct-url';

export interface DirectRead extends DirectNavigation {
  /** What to read: the first heading of the page (level 1 first), or the tab title. */
  what: 'heading' | 'title';
}

const READ_VERB = /\b(?:and|then|,)?\s*(?:please\s+)?(?:read|tell me|what(?:'s| is)|get|show me|give me|extract|find|return)\b/i;
const TARGET = /\b(?:the\s+)?(?:first\s+|main\s+|top\s+)?(?:visible\s+|page\s+)*(heading|headline|title|h1)\b/i;
// Any of these means more than a plain read: another action, a comparison, a condition or a question about meaning.
const MORE_THAN_A_READ =
  /\b(?:click|press|type|fill|search|log ?in|sign ?in|sign ?up|submit|download|upload|buy|order|compare|summari[sz]e|explain|translate|why|how|analy[sz]e|each|every|all|list|then\s+(?:open|go|click)|and\s+(?:click|open|go|search|then)|if|whether|after)\b/i;

/** The site and the one thing to read, or null when the request is anything other than that. */
export function directRead(request: string): DirectRead | null {
  const text = request.trim();
  if (text.length > 160 || /[\n]/.test(text)) return null;
  const nav = directNavigation(text);
  if (!nav) return null;
  // What follows the site: only a read verb and the target. Everything else is the model's.
  const afterOpening = text.replace(/^\s*(?:please\s+)?(?:(?:can|could) you\s+)?(?:go to|goto|open|visit|navigate to|browse to|head to|load|take me to)\s+/i, '');
  const rest = afterOpening.replace(/^(?:in a new tab\s+)?(?:https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/\S*)?)/i, '').trim();
  if (!READ_VERB.test(rest) || MORE_THAN_A_READ.test(rest)) return null;
  const target = TARGET.exec(rest);
  if (!target) return null;
  const word = target[1].toLowerCase();
  // Whatever stays after the target must be filler ("of the page", "there", "on it"), not a new request.
  const tail = rest.slice(rest.search(TARGET) + target[0].length).replace(/[\s.?!]+$/g, '').trim();
  if (tail && !/^(?:(?:of|on|in|at|from)\s+(?:the\s+)?(?:page|site|website|it|there|home ?page)|there|please)$/i.test(tail)) return null;
  return { ...nav, what: word === 'title' ? 'title' : 'heading' };
}

const HEADING_LINE = /^\s*(?:\[\w+\]\s+)?heading\s+"((?:[^"\\]|\\.)*)"(?:\s+\(level\s+(\d)\))?/;
const MARKDOWN_HEADING = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * The first level-1 heading of an outline (`heading "Text" (level 1)`) or of a markdown read (`# Text`), else the first heading.
 * Null when the page shows none.
 */
export function pickHeading(content: string): string | null {
  let first: string | null = null;
  for (const line of content.split(String.fromCharCode(10))) {
    const outline = HEADING_LINE.exec(line);
    const markdown = outline ? null : MARKDOWN_HEADING.exec(line);
    if (!outline && !markdown) continue;
    const raw = outline ? outline[1].replace(/\\(["\\])/g, '$1') : markdown![2].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    const level = outline ? outline[2] : String(markdown![1].length);
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (level === '1') return text;
    first ??= text;
  }
  return first;
}

// Pages that are in the way, not the page that was asked for: the model decides what to do about them.
const IN_THE_WAY =
  /\b(?:just a moment|verify you are (?:a )?human|are you a robot|captcha|access denied|enable javascript|checking your browser|sign in to continue|log in to continue|please log ?in|403 forbidden|too many requests|attention required)\b/i;

export function inTheWay(title: string, outline: string): boolean {
  return IN_THE_WAY.test(title) || IN_THE_WAY.test(outline.slice(0, 4_000));
}

const hostKey = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The page that loaded is on the site that was asked for (a redirect to another site is the model's to judge). */
export function sameSite(asked: string, loaded: string): boolean {
  const a = hostKey(asked);
  return !!a && a === hostKey(loaded);
}

export interface DirectAnswer {
  text: string;
}

/** The answer, or null when the page does not clearly show what was asked for. */
export function answerDirect(ask: DirectRead, page: { url: string; title: string; outline: string }): DirectAnswer | null {
  if (!sameSite(ask.url, page.url) || inTheWay(page.title, page.outline)) return null;
  if (ask.what === 'title') {
    const title = page.title.replace(/\s+/g, ' ').trim();
    return title ? { text: `The title of ${hostKey(page.url)} is “${title}”.` } : null;
  }
  const heading = pickHeading(page.outline);
  if (!heading) return null;
  // Where the page title says something else, both are shown: a person calling "the heading" the banner or title can see the difference.
  const title = page.title.replace(/\s+/g, ' ').trim();
  const differs = title && title.toLowerCase() !== heading.toLowerCase();
  return { text: `The first heading on ${hostKey(page.url)} is “${heading}”${differs ? ` (the page title is “${title}”)` : ''}.` };
}
