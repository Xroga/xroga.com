/**
 * Extract a browser-previewable site from model markdown/code fences.
 */

export interface SiteFiles {
  html: string;
  css: string;
  js: string;
}

const HTML_FENCE = /```(?:html|htm)\s*([\s\S]*?)```/i;
const CSS_FENCE = /```css\s*([\s\S]*?)```/i;
const JS_FENCE = /```(?:javascript|js)\s*([\s\S]*?)```/i;
const DOCTYPE_BLOCK = /<!DOCTYPE\s+html[\s\S]*<\/html>/i;

export function extractSiteFiles(modelText: string): SiteFiles | null {
  const text = modelText || '';
  let html = '';
  let css = '';
  let js = '';

  const htmlMatch = text.match(HTML_FENCE);
  if (htmlMatch) {
    html = htmlMatch[1].trim();
  } else {
    const raw = text.match(DOCTYPE_BLOCK);
    if (raw) html = raw[0].trim();
  }

  const cssMatch = text.match(CSS_FENCE);
  if (cssMatch) css = cssMatch[1].trim();

  const jsMatch = text.match(JS_FENCE);
  if (jsMatch) js = jsMatch[1].trim();

  if (!html) return null;

  // Merge external CSS/JS into a single HTML document when needed
  if (css && !/<style[\s>]/i.test(html)) {
    html = html.replace(
      /<\/head>/i,
      `<style>\n${css}\n</style>\n</head>`,
    );
    if (!/<\/head>/i.test(html)) {
      html = `<style>\n${css}\n</style>\n${html}`;
    }
  }

  if (js && !/<script[\s>]/i.test(html)) {
    html = html.replace(
      /<\/body>/i,
      `<script>\n${js}\n</script>\n</body>`,
    );
    if (!/<\/body>/i.test(html)) {
      html = `${html}\n<script>\n${js}\n</script>`;
    }
  }

  return { html, css, js };
}

export function siteLooksComplete(files: SiteFiles): boolean {
  return files.html.length > 200 && /<html[\s>]/i.test(files.html);
}
