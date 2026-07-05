/** Unescape JSON-style literals and extract html/css/js when stored as raw JSON text. */
export function normalizeBuildSource(raw: string): string {
  if (!raw?.trim()) return '';

  let s = raw.trim();

  if (s.startsWith('{') && /"html"\s*:/.test(s)) {
    try {
      const parsed = JSON.parse(s) as { html?: string; css?: string; js?: string };
      if (typeof parsed.html === 'string' && parsed.html.trim()) {
        return normalizeBuildSource(parsed.html);
      }
    } catch {
      /* not JSON — continue */
    }
  }

  if (s.includes('\\n') || s.includes('\\"') || s.includes('\\t')) {
    s = s
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }

  return s;
}

export function normalizeBuildFiles(html: string, css: string, js: string): {
  html: string;
  css: string;
  js: string;
} {
  return {
    html: normalizeBuildSource(html),
    css: normalizeBuildSource(css),
    js: normalizeBuildSource(js),
  };
}
