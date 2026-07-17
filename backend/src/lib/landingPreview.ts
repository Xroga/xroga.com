import { normalizeBuildFiles } from './normalizeBuildSource.js';

export function buildInlinePreviewDocument(html: string, css: string, js: string): string {
  const normalized = normalizeBuildFiles(html, css, js);
  const inlineCss = normalized.css.trim();
  const inlineJs = normalized.js.trim();
  let bodyHtml = normalized.html.trim();

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
<title>XROGA Build</title>
<style>${inlineCss}</style>
</head>
<body>
${bodyHtml}
${inlineJs ? `<script>${inlineJs}</script>` : ''}
</body>
</html>`;
}

/** Extract editable html/css/js from GitHub project files. */
export function siteCodeFromProjectFiles(files: Array<{ path: string; content: string }>): {
  html: string;
  css: string;
  js: string;
} {
  const byPath = (name: string) =>
    files.find((f) => f.path === name)?.content ??
    files.find((f) => f.path.endsWith(`/${name}`))?.content ??
    '';

  return {
    html: byPath('index.html'),
    css: byPath('styles.css') || byPath('style.css'),
    js: byPath('script.js') || byPath('main.js'),
  };
}
