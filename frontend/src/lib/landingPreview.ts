import { normalizeBuildFiles } from './normalizeBuildSource';

/** Build a self-contained HTML document for inline iframe preview (never 404). */
export function buildInlinePreviewDocument(html: string, css: string, js: string): string {
  const normalized = normalizeBuildFiles(html, css, js);
  const inlineCss = normalized.css.trim();
  const inlineJs = normalized.js.trim();
  let bodyHtml = normalized.html.trim();

  // Strip outer document shell when we will rebuild a merged document
  if (bodyHtml.includes('<!DOCTYPE') || bodyHtml.includes('<html')) {
    const bodyMatch = bodyHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch?.[1]) {
      bodyHtml = bodyMatch[1].trim();
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>XROGA Preview</title>
<style>${inlineCss}</style>
</head>
<body>
${bodyHtml}
${inlineJs ? `<script>${inlineJs}</script>` : ''}
</body>
</html>`;
}
