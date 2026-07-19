/**
 * Extract a browser-previewable site from model markdown/code fences.
 */

import type { ProjectFile } from './patches.js';

export interface SiteFiles {
  html: string;
  css: string;
  js: string;
}

export type { ProjectFile };

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

const PATH_FENCE_RE = /```(\w+)\s+path=([^\s`]+)\s*\n([\s\S]*?)```/gi;
const FILE_COLON_FENCE_RE = /```file:([^\s`]+)\s*\n([\s\S]*?)```/gi;

const CLASSIC_LANG_DEFAULTS: Record<string, string> = {
  html: 'index.html',
  htm: 'index.html',
  css: 'styles.css',
  javascript: 'script.js',
  js: 'script.js',
  tsx: 'src/App.tsx',
  ts: 'src/index.ts',
  jsx: 'src/App.jsx',
};

/**
 * Extract multi-file project output from model markdown/code fences.
 */
export function extractProjectFiles(modelText: string): ProjectFile[] {
  const text = modelText || '';
  const byPath = new Map<string, string>();

  const put = (path: string, content: string) => {
    const normalized = path.replace(/^\.\//, '').trim();
    if (!normalized) return;
    byPath.set(normalized, content.trim());
  };

  for (const match of text.matchAll(PATH_FENCE_RE)) {
    put(match[2], match[3]);
  }

  for (const match of text.matchAll(FILE_COLON_FENCE_RE)) {
    put(match[1], match[2]);
  }

  const classicFenceRe = /```(\w+)\s*\n([\s\S]*?)```/gi;
  for (const match of text.matchAll(classicFenceRe)) {
    const lang = match[1].toLowerCase();
    if (lang === 'json' || lang === 'file') continue;
    if (match[0].includes('path=')) continue;
    const defaultPath = CLASSIC_LANG_DEFAULTS[lang];
    if (!defaultPath || byPath.has(defaultPath)) continue;
    put(defaultPath, match[2]);
  }

  return [...byPath.entries()]
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
