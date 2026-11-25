// The markup of a page, made safe to show a model: `read` with format "html" returns what the accessibility outline leaves out (attributes, ids, classes, data-*,
// hidden inputs' names, link targets, structured data) for a page whose controls are found by their markup. Scripts, styles, drawings and comments are removed, no field
// value is ever shown (typed text, passwords, tokens kept in hidden inputs), and credential-looking strings are hidden. Idea: the page-source extraction of Ui.Vision RPA
// (AGPL, idea only) and the HTML trim of PinchTab (MIT); written fresh. Pure.

const OPAQUE = /\b(?:eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{40,})\b/g;
const SECRET_NAME = /(?:csrf|xsrf|token|nonce|secret|session|auth|password|passwd|api[-_]?key)/i;

/** The markup with scripts, styles, drawings, comments and every field value removed, and credential-looking strings hidden. */
export function cleanSource(html: string): string {
  let out = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, '<$1>…</$1>')
    // A field never shows what is typed in it, and a textarea keeps its text between its tags.
    .replace(/(<textarea\b[^>]*>)[\s\S]*?(<\/textarea\s*>)/gi, '$1…$2')
    .replace(/(<input\b[^>]*?)\s+value\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '$1')
    // Tokens carried in attributes and in meta tags.
    .replace(/(\s(?:nonce|integrity)\s*=\s*)(?:"[^"]*"|'[^']*')/gi, '$1"…"')
    .replace(/<meta\b[^>]*>/gi, tag => (SECRET_NAME.test(tag) ? tag.replace(/(content\s*=\s*)(?:"[^"]*"|'[^']*')/i, '$1"[hidden]"') : tag))
    .replace(/(\s(?:data-[\w-]*(?:token|csrf|secret|key)[\w-]*)\s*=\s*)(?:"[^"]*"|'[^']*')/gi, '$1"[hidden]"');
  out = out.replace(OPAQUE, m => (/^[a-z-]+$/i.test(m) && m.includes('-') ? m : '…'));
  return out.replace(/>\s+</g, '><').replace(/[ \t]+/g, ' ').trim();
}
