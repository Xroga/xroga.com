// Where a request should start. Some requests are about data in an app the user connected (a spreadsheet, mail, a CRM): the
// connected-app tools answer them with an API call, in a second or two, without opening a tab, attaching the debugger or reading a
// page. Everything stays available: the browser tools are still in the list, and the model uses them when no app tool fits or the
// user asks for the browser. This only decides what happens BEFORE the first model turn, so nothing is spent on a page that is not needed.

const URL_OR_SITE = /(?:https?:\/\/\S+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|dev|app|co|edu|gov|pk|uk|in)\b\S*)/i;
/** The user names the connected apps, an API, or says the browser is not wanted. */
const EXPLICIT_APPS =
  /\b(?:connected apps?|my connected|composio|plugins?|app tools?|api calls?|via (?:the )?api|through (?:the )?api|using (?:the )?api)\b|\b(?:not|without|instead of|don'?t use|do not use|no need (?:for|to use)|skip)\s+(?:using\s+)?(?:the\s+)?browser\b/i;
/** "my Google Sheet", "our Slack", "in my Gmail": an app the user owns, named as theirs. */
const OWNED_APP =
  /\b(?:my|our|in my|from my|to my)\s+(?:google\s+)?(?:sheets?|spreadsheets?|gmail|inbox|calendar|drive|docs?|slack|notion|github|hubspot|trello|asana|jira|airtable|stripe|shopify|linear|salesforce|crm)\b/i;
/** The request is about what a page looks like or does, so the page is the point. */
const PAGE_BOUND =
  /\b(?:click|scroll|screenshot|fill (?:in|out) (?:the )?form|log ?in to|sign ?in to|this page|current page|this tab|the page|on the (?:site|website|page)|open (?:the )?(?:site|website|page|tab)|navigate)\b/i;

/**
 * Whether the request is about the user's connected apps and not about a web page. A request with an address, or one about a
 * page's contents or controls, is not: it starts in the browser as before.
 */
export function isAppsFirstRequest(request: string): boolean {
  if (URL_OR_SITE.test(request)) return false;
  const explicit = EXPLICIT_APPS.test(request);
  if (PAGE_BOUND.test(request) && !explicit) return false;
  return explicit || OWNED_APP.test(request);
}

const USE_PREFIX = /\buse (?:my |the |our )?(?:connected )?/gi;
const NO_BROWSER = /[,;]?\s*\b(?:not|without|instead of|don'?t use|do not use|no need (?:for|to use)|skip)\s+(?:using\s+)?(?:the\s+)?browser\b[,.:;]?/gi;

/**
 * The search sentence for a request about connected apps: the user's own words with the instructions about the browser taken out
 * ("Use my connected Google Sheets app, not the browser. Find the sheet ..." becomes "Google Sheets app. Find the sheet ..."),
 * at most 120 characters, which is what the search accepts. The app stays named, because the provider matches on it.
 */
export function appSearchQuery(request: string): string {
  const clean = request.replace(/\s+/g, ' ').trim();
  const text = clean.replace(USE_PREFIX, '').replace(NO_BROWSER, '. ').replace(/\s*[,;]\s*\./g, '.').replace(/\s+/g, ' ').trim();
  return (text.length >= 2 ? text : clean).slice(0, 120).trim();
}

/** The note that tells the model where to start. It never forbids the browser. */
export const APPS_FIRST_NOTE =
  "this request is about the user's connected apps. Start with plugin_search (to read) or plugin_action_search (to change something); " +
  'no page has been opened or read for it. Use the browser tools only if no connected-app tool fits, or the user asks for the browser.';

/** The note when the search has already been run for the request, so the model does not spend a turn on it. */
export const APPS_FIRST_SEARCHED_NOTE =
  "this request is about the user's connected apps. The search for it was already run (below); do not search again for the same task. " +
  'The tools it found can be called directly by their names. No page has been opened or read. Use the browser tools only if no found tool fits, or the user asks for the browser.';

// ---- Research requests: the web is the source, not the page the user is on ------------------------------------------------
// "Compare the top 3 laptop reviews", "open ten sites and tell me their headlines", "what is the latest on X": the answer is on
// pages nobody has open. The search and the reading of its top pages are deterministic, so they are done BEFORE the first model
// turn, in parallel and without a model call; the model's first turn then already holds the material and answers from it. This is
// the difference between one turn of model time and four or five. The browser stays available when the material is not enough.

const RESEARCH =
  /\b(?:compare|comparison|research|top\s+\d+|best\b|reviews?\b|web search|search (?:the )?(?:web|online|internet)|look ?up|find out|latest|most recent|who won|who is the current|what is the current|news about|open\s+(?:\w+\s+)?(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:different\s+)?(?:sites|websites|pages|sources|tabs|links))\b/i;
const NOT_RESEARCH =
  /\b(?:buy|order|book|log ?in|sign ?in|sign ?up|fill|submit|post|send|create|delete|upload|download|pay|checkout|check out|click|scroll|screenshot|this page|current page|this tab|the page)\b/i;
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

export function isResearchRequest(request: string): boolean {
  if (URL_OR_SITE.test(request)) return false;
  if (EXPLICIT_APPS.test(request) || OWNED_APP.test(request)) return false;
  if (NOT_RESEARCH.test(request)) return false;
  return RESEARCH.test(request);
}

/** The search sentence and how many result pages to read, from the user's words. */
export function researchPlan(request: string): { query: string; follow: number } {
  const clean = request.replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  // The topic is in the first sentence; later ones are usually instructions about how to report.
  let query = (sentences[0] ?? clean)
    .replace(/^(?:please\s+)?(?:can you\s+)?(?:compare|research|find|search(?: for)?|look up|check|tell me about|give me)\s+/i, '')
    .replace(/\b(?:at the same time|simultaneously|in parallel)\b/gi, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (query.length < 4) query = clean;
  query = query.slice(0, 120).trim();
  const counted = /\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:different\s+)?(?:review\s+)?(?:sites|websites|pages|sources|tabs|links|reviews)\b/i.exec(clean)
    ?? /\btop\s+(\d+)\b/i.exec(clean);
  const raw = counted ? (/^\d+$/.test(counted[1]) ? Number(counted[1]) : NUMBER_WORDS[counted[1].toLowerCase()]) : 4;
  return { query, follow: Math.max(2, Math.min(10, raw || 4)) };
}

export const RESEARCH_FIRST_NOTE =
  'this request is about information on the web, so the web search was already run and the top result pages were read, in parallel (below). ' +
  'Answer from them now, with the exact links. Search or open a page yourself only if a fact you need is missing.';
