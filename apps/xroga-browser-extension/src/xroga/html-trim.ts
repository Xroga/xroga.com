// HTML reduced to what a model needs: the markup that is text and controls, without scripts, styles, comments, SVG drawings and data: URIs, which are most of a page's bytes and none
// of its meaning. Ported from PinchTab's internal/htmltrim/trim.go (github.com/pinchtab/pinchtab, MIT): the same removals in the same order, and the same nesting-aware SVG removal
// (a nested <svg> does not end the outer one, and a lookalike such as <svgIcon> is kept). PinchTab caps the result at 4,000 bytes for its own prompts; here the whole trimmed page
// is returned and the caller decides how much to show.
const reScript = /<script[^>]*>[\s\S]*?<\/script>/gi;
const reStyle = /<style[^>]*>[\s\S]*?<\/style>/gi;
const reComment = /<!--[\s\S]*?-->/g;
const reDataUri = /(^|["'(,=\s>;])data:(?:[a-z][a-z0-9.+-]*\/[a-z][a-z0-9.+-]*)?(?:;[a-z0-9.+-]+(?:=[a-z0-9.+-]*)?)*,[^"'()<>\s&]*/gi;
const reWhitespace = /[ \t]+/g;
const reNewlines = /\n{3,}/g;

const isSvgBoundary = (lower: string, at: number) => at < lower.length && ['>', '/', ' ', '\t', '\n', '\r'].includes(lower[at]!);

function indexSvgOpen(lower: string, from: number): number {
  for (let i = from; ; ) {
    const next = lower.indexOf('<svg', i);
    if (next < 0) return -1;
    if (isSvgBoundary(lower, next + 4)) return next;
    i = next + 4;
  }
}

/** The offset just past the </svg> that closes the element opening at `start`, or -1 when the document never closes it. */
function svgElementEnd(lower: string, start: number): number {
  let depth = 0;
  for (let i = start; i < lower.length; ) {
    if (lower.startsWith('<svg', i) && isSvgBoundary(lower, i + 4)) {
      const close = lower.indexOf('>', i);
      if (close < 0) return -1;
      const selfClosing = lower.slice(i, close).trim().endsWith('/');
      if (selfClosing) {
        if (depth === 0) return close + 1;
      } else depth++;
      i = close + 1;
    } else if (lower.startsWith('</svg', i)) {
      const close = lower.indexOf('>', i);
      if (close < 0) return -1;
      depth--;
      i = close + 1;
      if (depth <= 0) return i;
    } else i++;
  }
  return -1;
}

export function stripSvg(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  for (let i = 0; ; ) {
    const start = indexSvgOpen(lower, i);
    if (start < 0) return out + html.slice(i);
    out += html.slice(i, start);
    const end = svgElementEnd(lower, start);
    // Unterminated: left alone, not the rest of the page deleted.
    if (end < 0) return out + html.slice(start);
    i = end;
  }
}

export function trimHtml(html: string): string {
  let s = html.replace(reScript, '').replace(reStyle, '').replace(reComment, '');
  s = stripSvg(s);
  s = s.replace(reDataUri, '$1').replace(reWhitespace, ' ').replace(reNewlines, '\n\n');
  return s
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');
}

/** Whether a response is a web page worth trimming. */
export const looksLikeHtml = (contentType: string | undefined, body: string) => /html/i.test(contentType ?? '') || /^\s*<(?:!doctype html|html)\b/i.test(body);
