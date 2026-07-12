import { webSearch } from './webSearch.js';
import { searchYoutubeVideos } from './youtubeSearch.js';
import { shouldAutoLiveResearch } from './liveResearchIntent.js';
import { getCurrentDateDirective } from './currentDateContext.js';

export interface LiveSource {
  title: string;
  url: string;
  snippet: string;
  source: 'searxng' | 'tavily' | 'youtube';
  thumbnailUrl?: string;
  siteDomain?: string;
}

export interface LiveResearchBundle {
  context: string;
  sources: LiveSource[];
  searchedAt: string;
  reasons: string[];
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

const LIVE_RESEARCH_SYSTEM = `
## Live web research (just fetched — prefer over training-data guesses)
${getCurrentDateDirective()}

Use these sources to answer accurately. When you use a fact from a source, mention the site name or include its URL inline so users can verify.
If pricing, net worth, crypto, or current events are asked, ground your answer in these results — do not guess or use outdated 2025 data as current.
When YouTube videos are listed, recommend 1–2 as helpful follow-ups with brief reasons.
Never mention search providers, APIs, SearXNG, Tavily, or internal tooling — only cite the actual website or channel name.
Never claim omniscient knowledge — you searched because this question needs fresh data.
`;

export async function runLiveResearch(
  prompt: string,
  opts?: { intent?: string; force?: boolean }
): Promise<LiveResearchBundle | null> {
  const decision = shouldAutoLiveResearch(prompt, opts?.intent);
  if (!decision.needsResearch && !opts?.force) return null;

  const [webResults, youtubeResults] = await Promise.all([
    webSearch(decision.searchQuery, { maxResults: 4 }),
    decision.needsYoutube && decision.youtubeQuery
      ? searchYoutubeVideos(decision.youtubeQuery, 2)
      : Promise.resolve([]),
  ]);

  const sources: LiveSource[] = [
    ...webResults.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content.slice(0, 220),
      source: r.source,
      siteDomain: domainFromUrl(r.url),
    })),
    ...youtubeResults.map((v) => ({
      title: v.title,
      url: v.url,
      snippet: `${v.channelTitle}${v.description ? ` — ${v.description}` : ''}`.slice(0, 220),
      source: 'youtube' as const,
      thumbnailUrl: v.thumbnailUrl,
      siteDomain: 'youtube.com',
    })),
  ];

  if (!sources.length) return null;

  const webLines = webResults.slice(0, 4).map((r) => `- **${r.title}** (${r.url}): ${r.content.slice(0, 160)}`);
  const ytLines = youtubeResults.slice(0, 2).map((v) => `- **${v.title}** by ${v.channelTitle} (${v.url})`);

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
