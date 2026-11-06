/**
 * Syntax highlighting for code blocks in answers, using Shiki (MIT) with its JavaScript regex engine, so there is no WASM
 * and nothing is executed from the model's text. Shiki is loaded lazily the first time a highlightable block appears, and
 * each language is loaded only when it is first used. The result is plain data (colored tokens) that React renders as text
 * spans: no HTML string is ever injected, and the code itself is never interpreted.
 *
 * Only languages on this allowlist are highlighted. Anything else, any oversized block, and any failure fall back to the
 * unhighlighted code that is always shown today.
 */
export interface HighlightedToken { content: string; light?: string; dark?: string }

const ALIASES: Record<string, string> = {
  ts: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  py: 'python', yml: 'yaml', md: 'markdown', golang: 'go', rs: 'rust', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', kt: 'kotlin', rb: 'ruby', html: 'html',
  postgres: 'sql', postgresql: 'sql', mysql: 'sql', sqlite: 'sql',
};
const ALLOWED = new Set(['typescript', 'tsx', 'javascript', 'jsx', 'json', 'jsonc', 'bash', 'sql', 'python', 'css', 'html', 'yaml', 'go', 'rust', 'java',
  'diff', 'markdown', 'c', 'cpp', 'csharp', 'php', 'ruby', 'kotlin', 'swift', 'toml', 'dockerfile', 'graphql', 'xml', 'ini']);
export const MAX_HIGHLIGHT_CHARACTERS = 30_000;
export const MAX_HIGHLIGHT_LINES = 600;

/** A language name from the model, normalised to an allowlisted Shiki id, or null when it should not be highlighted. */
export function highlightLanguage(raw: string | undefined | null): string | null {
  const name = (raw ?? '').trim().toLowerCase().replace(/^language-/, '').split(/[\s{:,]/)[0] ?? '';
  const id = ALIASES[name] ?? name;
  return ALLOWED.has(id) ? id : null;
}

/** Whether this much code is worth highlighting. Large blocks stay plain so the page stays fast. */
export function shouldHighlight(text: string, language: string | null): boolean {
  return Boolean(language) && text.length > 0 && text.length <= MAX_HIGHLIGHT_CHARACTERS && text.split('\n').length <= MAX_HIGHLIGHT_LINES;
}

interface Engine {
  codeToTokens(code: string, options: { lang: string; themes: { light: string; dark: string }; defaultColor: false }): { tokens: Array<Array<{ content: string; htmlStyle?: Record<string, string> }>> };
  loadLanguage(...languages: unknown[]): Promise<void>;
}
let engine: Promise<Engine> | null = null;
const loadedLanguages = new Set<string>();

async function getEngine(): Promise<Engine> {
  engine ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, { bundledThemes }] = await Promise.all([
      import('shiki/core'), import('shiki/engine/javascript'), import('shiki/themes'),
    ]);
    return await createHighlighterCore({ themes: [bundledThemes['github-light'], bundledThemes['github-dark']], langs: [], engine: createJavaScriptRegexEngine() }) as unknown as Engine;
  })();
  return engine;
}

/** Colored tokens per line, or null when highlighting is unavailable for any reason. Never throws. */
export async function highlightCode(code: string, rawLanguage: string | undefined | null): Promise<HighlightedToken[][] | null> {
  const language = highlightLanguage(rawLanguage);
  if (!shouldHighlight(code, language) || !language) return null;
  try {
    const shiki = await getEngine();
    if (!loadedLanguages.has(language)) {
      const { bundledLanguages } = await import('shiki/langs');
      const loader = (bundledLanguages as Record<string, unknown>)[language];
      if (!loader) return null;
      await shiki.loadLanguage(loader);
      loadedLanguages.add(language);
    }
    const { tokens } = shiki.codeToTokens(code, { lang: language, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false });
    return tokens.map(line => line.map(token => ({ content: token.content, light: token.htmlStyle?.['--shiki-light'], dark: token.htmlStyle?.['--shiki-dark'] })));
  } catch {
    return null;
  }
}

/** True when the text color is light, meaning the theme is dark. Parses the computed rgb() or rgba() color. */
export function isLightColor(computedColor: string): boolean {
  const match = /rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/i.exec(computedColor);
  if (!match) return false;
  const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}
