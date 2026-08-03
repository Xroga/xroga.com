/**
 * Detecting an HTML document that stops mid-sentence.
 *
 * Production run `85681d10`, prompt "build a landing page of dental clinic". The
 * builder returned a 505-line `index.html` that ended part-way through the page. The
 * reviewer noticed — *"index.html appears truncated at line break, missing closing tags
 * and likely several sections (services, testimonials, team, contact, footer)"* — and
 * the run shipped it anyway, because structure validation reported `ok`.
 *
 * The old check was:
 *
 *     opens = matches of  <tag ...>
 *     closes = matches of </tag>
 *     if (opens > closes + 8) → "Possible unclosed tags"
 *
 * and it could never be trusted enough to block a ship, because `opens` counted things
 * that have no closing tag at all. A perfectly valid page with a handful of `<meta>`
 * tags, a `<link>`, some `<img>`s and a few `<input>`s clears +8 on its own. The
 * arbitrary slack existed to paper over that, and it is what let a genuinely broken
 * page through.
 *
 * Counting only elements that *must* close makes the number mean something, so a real
 * imbalance can block a ship without punishing valid markup.
 */

/** Elements with no closing tag in HTML. Nothing here is ever unbalanced. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/**
 * Elements whose closing tag is optional in HTML, so an absent one is not evidence of
 * truncation. `<li>`, `<p>` and the table row elements are routinely left open by hand
 * and by generators alike, and the parser closes them implicitly.
 */
const OPTIONAL_CLOSE = new Set([
  'body',
  'colgroup',
  'dd',
  'dt',
  'head',
  'html',
  'li',
  'optgroup',
  'option',
  'p',
  'rp',
  'rt',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
]);

export interface HtmlBalance {
  /** Opening tags that require a matching close. */
  opens: number;
  /** Closing tags seen. */
  closes: number;
  /** Elements left open, ignoring void and optional-close elements. */
  unclosed: number;
}

/**
 * Counts openings and closings, ignoring comments, `<script>`/`<style>` bodies, and
 * anything that cannot be unbalanced.
 *
 * Script and style contents are stripped first because a comparison operator in
 * JavaScript (`a < b`) and a CSS child selector both look like markup to a regex.
 */
export function htmlTagBalance(html: string): HtmlBalance {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '<script></script>')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style></style>');

  let opens = 0;
  let closes = 0;
  const pattern = /<(\/?)([A-Za-z][\w.-]*)([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripped)) !== null) {
    const isClosing = match[1] === '/';
    const name = match[2].toLowerCase();
    const selfClosing = match[3].trimEnd().endsWith('/');
    if (VOID_ELEMENTS.has(name) || OPTIONAL_CLOSE.has(name)) continue;
    if (isClosing) closes += 1;
    else if (!selfClosing) opens += 1;
  }

  return { opens, closes, unclosed: Math.max(0, opens - closes) };
}

/**
 * True when a document is missing its structural end.
 *
 * Two independent signals, because either alone produces false positives:
 *
 * - Elements that must close and never do. With void and optional-close elements
 *   excluded, even one is suspicious; two is used as the threshold so a single stray
 *   `</div>` typo in an otherwise complete page is reported by the reviewer rather than
 *   blocking the ship.
 * - A document that opened `<html>` or `<body>` and never closed it. A generator that
 *   ran out of output stops mid-element, so the closing tags simply are not there.
 */
export function htmlLooksTruncated(html: string): boolean {
  const body = html.trim();
  if (!body) return false;
  if (!/<html[\s>]/i.test(body) && !/<body[\s>]/i.test(body)) {
    // A fragment, not a document. Balance is still meaningful; document-end is not.
    return htmlTagBalance(body).unclosed >= 2;
  }
  const openedHtml = /<html[\s>]/i.test(body);
  const openedBody = /<body[\s>]/i.test(body);
  if (openedHtml && !/<\/html\s*>/i.test(body)) return true;
  if (openedBody && !/<\/body\s*>/i.test(body)) return true;
  return htmlTagBalance(body).unclosed >= 2;
}
