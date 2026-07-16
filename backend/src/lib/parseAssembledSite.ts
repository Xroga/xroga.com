/** Parse LLM assembly into html/css/js — resilient to unclosed fences & alt language tags. */

export interface ParsedSiteCode {
  html: string;
  css: string;
  js: string;
}

function pickFenced(code: string, langs: string[]): string {
  let best = '';
  for (const lang of langs) {
    // Closed fence
    const closed = new RegExp('```' + lang + '\\s*([\\s\\S]*?)```', 'i');
    const m = code.match(closed);
    if (m?.[1] && m[1].trim().length > best.length) best = m[1].trim();
    // Unclosed fence to EOF (truncated model output)
    const open = new RegExp('```' + lang + '\\s*([\\s\\S]*)$', 'i');
    const m2 = code.match(open);
    if (m2?.[1] && !m2[1].includes('```') && m2[1].trim().length > best.length) {
      best = m2[1].trim();
    }
  }
  return best;
}

export function extractFencedBlocks(code: string): ParsedSiteCode {
  let html =
    pickFenced(code, ['html', 'htm', 'index\\.html', 'xhtml']) ||
    pickFenced(code, ['xml']);
  let css = pickFenced(code, ['css', 'styles\\.css', 'style']);
  let js = pickFenced(code, ['javascript', 'js', 'script\\.js', 'typescript', 'ts']);

  if (!html && /<!DOCTYPE|<html[\s>]/i.test(code)) {
    const m = code.match(/<!DOCTYPE[\s\S]*?<\/html>/i) || code.match(/<html[\s\S]*?<\/html>/i);
    html = m?.[0]?.trim() ?? '';
  }

  // Longest HTML-looking island if still empty
  if (!html) {
    const islands = code.match(/<(?:!DOCTYPE html|html)[\s\S]{400,}/gi);
    if (islands?.length) {
      html = islands.sort((a, b) => b.length - a.length)[0]!.slice(0, 120_000);
      if (!/<\/html>/i.test(html)) html = `${html}\n</html>`;
    }
  }

  if (!css) {
    const styleTag = code.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleTag?.[1]) css = styleTag[1].trim();
  }
  if (!js) {
    const scriptTag = code.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptTag?.[1] && scriptTag[1].trim().length > 40) js = scriptTag[1].trim();
  }

  return { html, css, js };
}

function parseJsonSite(raw: string): ParsedSiteCode | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as ParsedSiteCode;
    if (parsed.html?.trim()) return { html: parsed.html, css: parsed.css || '', js: parsed.js || '' };
  } catch {
    /* ignore */
  }
  return null;
}

export function parseAssembledProject(assembledCode: string): ParsedSiteCode | null {
  const fromJson = parseJsonSite(assembledCode);
  if (fromJson) return fromJson;

  const blocks = extractFencedBlocks(assembledCode);
  if (blocks.html.trim()) return blocks;
  return null;
}
