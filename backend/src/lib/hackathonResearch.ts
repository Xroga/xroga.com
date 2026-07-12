import { routingPrompt } from './promptRouting.js';
import { webSearch } from './webSearch.js';
import { matchHackathonProfile } from './hackathon/profiles.js';
import { extractUrlsFromPrompt, fetchHackathonPages } from './hackathon/pageFetcher.js';
import { generateHackathonIdeas, pickRecommendedIdea } from './hackathon/ideaGenerator.js';
import {
  buildHackathonContextForEngine,
  briefToCardPayload,
  formatHackathonBriefMarkdown,
} from './hackathon/briefFormatter.js';
import type { HackathonBrief, HackathonResearchBundle } from './hackathon/types.js';

export type { HackathonBrief, HackathonResearchBundle } from './hackathon/types.js';
export { briefToCardPayload } from './hackathon/briefFormatter.js';

const HACKATHON =
  /\b(hackathon|hack\s*athon|solana\s+hack|ethglobal|devpost|buidl|buildathon|demo\s*day|submission\s+deadline|build\s*x\s*series|okx\.?ai|asp\b|agent\s*service\s*provider)\b/i;

const SOLANA =
  /\b(solana|spl\s+token|anchor|metaplex|phantom\s+wallet|raydium|jupiter\s+swap|solana\s+program)\b/i;

const X_LAYER = /\b(x\s*layer|okx|build\s*x)\b/i;

export function detectHackathonIntent(prompt: string): {
  isHackathon: boolean;
  chain?: 'solana' | 'ethereum' | 'xlayer' | 'generic';
  buildMode?: 'asp' | 'dapp' | 'generic';
} {
  const text = routingPrompt(prompt);
  if (!HACKATHON.test(text) && !SOLANA.test(text) && !X_LAYER.test(text)) {
    return { isHackathon: false };
  }

  const isAsp =
    /\b(okx\.?ai|asp\b|agent\s*service\s*provider|build\s*x\s*series|genesis\s*hackathon)\b/i.test(text);
  const chain = SOLANA.test(text)
    ? 'solana'
    : X_LAYER.test(text)
      ? 'xlayer'
      : /\b(ethereum|evm|solidity)\b/i.test(text)
        ? 'ethereum'
        : 'generic';

  return {
    isHackathon: true,
    chain,
    buildMode: isAsp ? 'asp' : /\b(dapp|defi|nft|web3)\b/i.test(text) ? 'dapp' : 'generic',
  };
}

function buildSearchQueries(profileId: string, text: string): string[] {
  const slice = text.slice(0, 120);
  if (profileId === 'okx-build-x-series') {
    return [
      'OKX.AI Genesis Hackathon Build X Series ASP requirements July 2026',
      'OKX.AI Agent Service Provider marketplace listing criteria',
      `"Build X Series" hackathon judging criteria prize tracks`,
    ];
  }
  return [
    `hackathon 2026 requirements judging criteria ${slice}`,
    `hackathon sponsor ecosystem gaps what judges want ${slice}`,
  ];
}

async function gatherSources(
  profileId: string,
  text: string,
  urls: string[]
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const sources: Array<{ title: string; url: string; snippet: string }> = [];

  const pages = await fetchHackathonPages(urls);
  for (const p of pages) {
    sources.push({
      title: 'Official hackathon page',
      url: p.url,
      snippet: p.text.slice(0, 280),
    });
  }

  for (const q of buildSearchQueries(profileId, text).slice(0, 3)) {
    try {
      const results = await webSearch(q, { maxResults: 3, forceTavily: profileId === 'okx-build-x-series' });
      for (const r of results) {
        if (!sources.some((s) => s.url === r.url)) {
          sources.push({
            title: r.title,
            url: r.url,
            snippet: r.content.slice(0, 220),
          });
        }
      }
    } catch {
      /* continue */
    }
  }

  return sources.slice(0, 8);
}

/**
 * Deep hackathon intelligence: profile match → web/page research → novel idea generation.
 */
export async function runHackathonIntelligence(
  prompt: string,
  opts?: { skipIdeas?: boolean }
): Promise<HackathonResearchBundle | null> {
  const { isHackathon, chain, buildMode } = detectHackathonIntent(prompt);
  if (!isHackathon) return null;

  const text = routingPrompt(prompt);
  const urls = extractUrlsFromPrompt(prompt);
  const profile = matchHackathonProfile(text, urls);

  const seed = profile?.brief ?? {
    id: 'unknown-hackathon',
    name: 'Hackathon (detected)',
    sponsor: 'Event sponsor',
    ecosystem: 'Infer from research',
    productType: 'Demo-ready product',
    cryptoRequired: false,
    summary: 'Research official requirements and build a sponsor-aligned product.',
    judgingCriteria: ['Working demo', 'Innovation', 'Sponsor fit', 'UX polish'],
    prizeTracks: [],
    submissionSteps: [],
    sponsorGaps: ['Identify sponsor product gaps from official page'],
    rejectReasons: ['Generic clone', 'Wrong sponsor fit', 'Incomplete submission'],
    innovationSweetSpot: 'Novel workflow that completes sponsor ecosystem — not a recycled template.',
  };

  const sources = await gatherSources(profile?.id ?? 'generic', text, urls);

  const brief: HackathonBrief = {
    ...seed,
    sources,
    recommendedIdeas: [],
    researchedAt: new Date().toISOString(),
  };

  if (!opts?.skipIdeas) {
    brief.recommendedIdeas = await generateHackathonIdeas(brief, prompt);
    brief.recommendedIdea = pickRecommendedIdea(brief.recommendedIdeas, prompt);
  }

  const bundle: HackathonResearchBundle = {
    brief,
    context: buildHackathonContextForEngine({
      brief,
      context: '',
      isHackathon: true,
      chain,
      buildMode: buildMode ?? 'generic',
    }),
    isHackathon: true,
    chain,
    buildMode: buildMode ?? 'generic',
  };

  return bundle;
}

/** Legacy API used by build engine */
export interface HackathonResearchLegacyBundle {
  context: string;
  isHackathon: boolean;
  chain?: 'solana' | 'ethereum' | 'xlayer' | 'generic';
  brief?: HackathonBrief;
  card?: ReturnType<typeof briefToCardPayload>;
}

export async function fetchHackathonResearch(prompt: string): Promise<HackathonResearchLegacyBundle | null> {
  const bundle = await runHackathonIntelligence(prompt);
  if (!bundle) return null;

  return {
    isHackathon: true,
    chain: bundle.chain,
    context: bundle.context,
    brief: bundle.brief,
    card: briefToCardPayload(bundle.brief),
  };
}

/** Advisor/chat mode — markdown brief without full build context noise */
export async function fetchHackathonAdvisorBrief(prompt: string): Promise<{
  markdown: string;
  card: ReturnType<typeof briefToCardPayload>;
  sources: HackathonBrief['sources'];
} | null> {
  const bundle = await runHackathonIntelligence(prompt);
  if (!bundle) return null;

  return {
    markdown: formatHackathonBriefMarkdown(bundle.brief),
    card: briefToCardPayload(bundle.brief),
    sources: bundle.brief.sources,
  };
}

export function isHackathonQuery(prompt: string): boolean {
  return detectHackathonIntent(prompt).isHackathon;
}
