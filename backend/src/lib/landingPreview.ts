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
  const indexHtml =
    byPath('index.html') ||
    files.find((f) => /(?:^|\/)index\.html$/i.test(f.path))?.content ||
    '';
  const css =
    byPath('styles.css') ||
    files.find((f) => /(?:^|\/)(styles?|globals?)\.css$/i.test(f.path))?.content ||
    '';
  const js =
    byPath('script.js') ||
    files.find((f) => /(?:^|\/)(script|main|app)\.js$/i.test(f.path) && !/node_modules/.test(f.path))
      ?.content ||
    '';
  const normalized = normalizeBuildFiles(indexHtml, css, js);
  return { html: normalized.html, css: normalized.css, js: normalized.js };
}

export const LANDING_UPDATE_FOLLOW_UPS = [
  'Change brand name and hero headline',
  'Switch to dark mode with a light/dark toggle',
  'Add animations and modern hover effects',
  'Add a testimonials or logos section',
  'Update pricing plans and features',
  'Fix buttons and JavaScript that are not working',
] as const;
