import { webSearch } from './webSearch.js';
import { searchYoutubeVideos } from './youtubeSearch.js';
import { shouldAutoLiveResearch } from './liveResearchIntent.js';

export interface LiveSource {
  title: string;
  url: string;
  snippet: string;
  source: 'searxng' | 'tavily' | 'youtube';
  thumbnailUrl?: string;
}

export interface LiveResearchBundle {
  context: string;
  sources: LiveSource[];
  searchedAt: string;
  reasons: string[];
}

const LIVE_RESEARCH_SYSTEM = `
## Live web research (just fetched — prefer over training-data guesses)
Use these sources to answer accurately. Cite specific facts from them when relevant.
If pricing, net worth, or current events are asked, ground your answer in these results — do not guess.
When YouTube videos are listed, recommend 1–3 as helpful follow-ups with brief reasons.
Never claim omniscient or unlimited knowledge — you searched the web because this question needs fresh data.
`;

export async function runLiveResearch(
  prompt: string,
  opts?: { intent?: string; force?: boolean }
): Promise<LiveResearchBundle | null> {
  const decision = shouldAutoLiveResearch(prompt, opts?.intent);
  if (!decision.needsResearch && !opts?.force) return null;

  const [webResults, youtubeResults] = await Promise.all([
    webSearch(decision.searchQuery, { maxResults: 6 }),
    decision.needsYoutube && decision.youtubeQuery
      ? searchYoutubeVideos(decision.youtubeQuery, 5)
      : Promise.resolve([]),
  ]);

  const sources: LiveSource[] = [
    ...webResults.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 220),
      source: r.source,
    })),
    ...youtubeResults.map((v) => ({
      title: v.title,
      url: v.url,
      snippet: `${v.channelTitle}${v.description ? ` — ${v.description}` : ''}`.slice(0, 220),
      source: 'youtube' as const,
      thumbnailUrl: v.thumbnailUrl,
    })),
  ];

  if (!sources.length) return null;

  const webLines = webResults.slice(0, 5).map((r) => `- **${r.title}** (${r.url}): ${r.content.slice(0, 160)}`);
  const ytLines = youtubeResults.slice(0, 4).map((v) => `- **${v.title}** by ${v.channelTitle} (${v.url})`);

  const context = [
    LIVE_RESEARCH_SYSTEM,
    webLines.length ? `\nWeb results:\n${webLines.join('\n')}` : '',
    ytLines.length ? `\nYouTube recommendations:\n${ytLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    context,
    sources,
    searchedAt: new Date().toISOString(),
    reasons: decision.reasons,
  };
}

export function formatLiveResearchForPrompt(bundle: LiveResearchBundle): string {
  return bundle.context;
}
