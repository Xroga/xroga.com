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
  channelTitle?: string;
}

export interface LiveResearchBundle {
  context: string;
  sources: LiveSource[];
  searchedAt: string;
  reasons: string[];
  youtubeCount: number;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function buildLiveResearchSystem(youtubeCount: number): string {
  return `
## Live web research (just fetched — prefer over training-data guesses)
${getCurrentDateDirective()}

Use these sources to answer accurately and COMPLETELY — address every part of the user's question.
When you use a fact from a source, mention the site name or include its URL inline.
If pricing, net worth, crypto, or current events are asked, ground your answer in these results — do not guess or use outdated 2025 data as current.

${
  youtubeCount > 0
    ? `YouTube API returned ${youtubeCount} video(s). You MUST include a "## Recommended videos" section recommending exactly 1–2 of them with title, channel, why it helps, and the URL.`
    : 'If no YouTube videos are listed, skip the Recommended videos section.'
}

Never mention search providers, APIs, SearXNG, Tavily, or internal tooling — only cite actual websites and channel names.
Never claim omniscient knowledge — you searched because this question needs fresh, personalized guidance.
`;
}

export async function runLiveResearch(
  prompt: string,
  opts?: { intent?: string; force?: boolean }
): Promise<LiveResearchBundle | null> {
  const decision = shouldAutoLiveResearch(prompt, opts?.intent);
  if (!decision.needsResearch && !opts?.force) return null;

  const fetchYoutube = decision.needsYoutube && Boolean(decision.youtubeQuery);

  // NEVER call Grok agent web_search / x_search here — those burn $5/1k + Grok tokens.
  // Chat/build live research uses free/cheap SearXNG (+ optional Tavily / YouTube only).
  const [webResults, youtubeResults] = await Promise.all([
    webSearch(decision.searchQuery, { maxResults: 4 }),
    fetchYoutube ? searchYoutubeVideos(decision.youtubeQuery!, 2) : Promise.resolve([]),
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
      channelTitle: v.channelTitle,
    })),
  ];

  if (!sources.length) return null;

  const webLines = webResults.slice(0, 4).map((r) => `- **${r.title}** (${r.url}): ${r.content.slice(0, 160)}`);
  const ytLines = youtubeResults.slice(0, 2).map(
    (v) =>
      `- **${v.title}** by ${v.channelTitle} (${v.url})${v.description ? `\n  Description: ${v.description.slice(0, 120)}` : ''}`
  );

  const context = [
    buildLiveResearchSystem(youtubeResults.length),
    webLines.length ? `\nWeb results:\n${webLines.join('\n')}` : '',
    ytLines.length ? `\nYouTube videos (recommend 1–2 in your answer):\n${ytLines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    context,
    sources,
    searchedAt: new Date().toISOString(),
    reasons: decision.reasons,
    youtubeCount: youtubeResults.length,
  };
}

export function formatLiveResearchForPrompt(bundle: LiveResearchBundle): string {
  return bundle.context;
}
