import { webSearch } from './webSearch.js';

export interface UiTrendBundle {
  context: string;
  query: string;
}

/**
 * Free/cheap UI inspiration via SearXNG/Tavily only.
 * NEVER calls Grok agent tools (web_search/x_search cost $5/1k + expensive tokens).
 */
export async function fetchUiTrendResearch(
  projectLabel: string,
  buildType: string
): Promise<UiTrendBundle | null> {
  const label = projectLabel.slice(0, 80) || 'modern web app';
  const query = `${label} ${buildType} modern UI UX design trends 2026`;

  try {
    const results = await webSearch(query, { maxResults: 3 });
    if (!results.length) {
      return {
        query,
        context: `\n## UI/UX guidance (no live search)\nUse modern aesthetics: clear typography, generous whitespace, responsive cards, accessible contrast, mobile-first.\n`,
      };
    }

    const lines = results.map((r) => `- **${r.title}**: ${r.content.slice(0, 140)}`);
    return {
      query,
      context: `\n## UI/UX trend notes (free web search)\nPrioritize: clean layouts, card grids, gradient accents, accessible contrast, mobile-first.\n${lines.join('\n')}`,
    };
  } catch (err) {
    console.warn('[uiTrendResearch]', (err as Error).message);
    return null;
  }
}
