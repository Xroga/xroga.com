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

/** The note that tells the model where to start. It never forbids the browser. */
export const APPS_FIRST_NOTE =
  "this request is about the user's connected apps. Start with plugin_search (to read) or plugin_action_search (to change something); " +
  'no page has been opened or read for it. Use the browser tools only if no connected-app tool fits, or the user asks for the browser.';
