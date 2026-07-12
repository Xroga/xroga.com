import { webSearch } from './webSearch.js';
import { grokAgentSearch, formatGrokSearchContext } from './grokSearch.js';

export interface UiTrendBundle {
  context: string;
  query: string;
}

/** Fetch trendy UI/UX inspiration via web search (Pinterest, Dribbble, 2026 trends) — no Pinterest API key required */
export async function fetchUiTrendResearch(
  projectLabel: string,
  buildType: string
): Promise<UiTrendBundle | null> {
  const label = projectLabel.slice(0, 80) || 'modern web app';
  const query = `${label} ${buildType} UI UX design trends 2026 site:pinterest.com OR dribbble OR awwwards`;

  try {
    const [results, grokUi] = await Promise.all([
      webSearch(query, { maxResults: 4 }),
      grokAgentSearch(`${label} ${buildType} UI UX design trends 2026`, { xSearch: true, webSearch: true }),
    ]);
    const grokNote = grokUi ? `\n${formatGrokSearchContext(grokUi)}` : '';

    if (!results.length) {
      const fallback = await webSearch(`${label} modern UI UX design trends 2026 animations`, {
        maxResults: 3,
      });
      if (!fallback.length) return null;
      const lines = fallback.map((r) => `- ${r.title}: ${r.content.slice(0, 140)}`);
      return {
        query,
        context: `\n## UI/UX trend research (apply to design)\nUse modern 2026 aesthetics: glassmorphism accents, bold typography, micro-interactions, dark/light themes, generous whitespace.\n${lines.join('\n')}${grokNote}`,
      };
    }

    const lines = results.map((r) => `- **${r.title}**: ${r.content.slice(0, 160)}`);
    return {
      query,
      context: `\n## UI/UX trend research (Pinterest / design web — apply visually)\nPrioritize: trendy layouts, animated hero sections, card grids, gradient accents, accessible contrast, mobile-first.\n${lines.join('\n')}${grokNote}`,
    };
  } catch (err) {
    console.warn('[uiTrendResearch]', (err as Error).message);
    return null;
  }
}
