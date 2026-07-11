import { routingPrompt } from './promptRouting.js';

export type LiveResearchReason =
  | 'business_advice'
  | 'pricing'
  | 'net_worth'
  | 'knowledge_cutoff'
  | 'youtube_recommendation'
  | 'time_sensitive'
  | 'realtime';

export interface LiveResearchDecision {
  needsResearch: boolean;
  reasons: LiveResearchReason[];
  searchQuery: string;
  needsYoutube: boolean;
  youtubeQuery?: string;
}

const BUSINESS =
  /\b(business|startup|strategy|strategies|marketing|monetiz|revenue|growth|saas|dropship|e-?commerce|go-to-market|gtm|competitive|positioning|advice|consult|scale|funding|investor|pitch)\b/i;

const PRICING =
  /\b(price|pricing|cost|costs|fee|fees|how much|worth|valuation|subscription|plan tier|margin|profit|revenue model|pricing model)\b/i;

const NET_WORTH =
  /\b(net worth|networth|salary|earnings|income|wealth|billion|millionaire|valuation of|market cap|fortune)\b/i;

const KNOWLEDGE_CUTOFF =
  /\b(cut.?off|knowledge|training data|up to date|updated|current events|do you know|are you aware|as of today|latest news|what happened|who is the current|who won|when did)\b/i;

const YOUTUBE =
  /\b(youtube|yt video|video recommendation|channel to watch|best videos|watch on youtube|youtube channel|tutorial video|learn on youtube)\b/i;

const TIME_SENSITIVE =
  /\b(today|yesterday|this week|this month|right now|currently|latest|recent|breaking|2026|2025)\b/i;

const REALTIME =
  /\b(stock price|crypto price|bitcoin|exchange rate|weather|forecast|election|score|headlines|news about)\b/i;

function buildQuery(text: string): string {
  let q = text
    .replace(/\b(can you|could you|please|tell me|what is|what's|what are|i want to know)\b/gi, '')
    .replace(/\?+$/, '')
    .trim();
  if (q.length > 140) q = q.slice(0, 140);
  return q || text.trim();
}

export function shouldAutoLiveResearch(prompt: string, intent?: string): LiveResearchDecision {
  const text = routingPrompt(prompt).trim();
  if (!text || text.length < 8) {
    return { needsResearch: false, reasons: [], searchQuery: '', needsYoutube: false };
  }

  const reasons: LiveResearchReason[] = [];

  if (intent === 'business_advice' || BUSINESS.test(text)) reasons.push('business_advice');
  if (PRICING.test(text)) reasons.push('pricing');
  if (NET_WORTH.test(text)) reasons.push('net_worth');
  if (KNOWLEDGE_CUTOFF.test(text)) reasons.push('knowledge_cutoff');
  if (YOUTUBE.test(text)) reasons.push('youtube_recommendation');
  if (TIME_SENSITIVE.test(text)) reasons.push('time_sensitive');
  if (REALTIME.test(text)) reasons.push('realtime');

  const needsYoutube =
    reasons.includes('youtube_recommendation') ||
    YOUTUBE.test(text) ||
    reasons.includes('business_advice') ||
    intent === 'business_advice';
  const needsResearch = reasons.length > 0;

  return {
    needsResearch,
    reasons,
    searchQuery: buildQuery(text),
    needsYoutube,
    youtubeQuery: needsYoutube ? buildQuery(text.replace(/\byoutube\b/gi, '').trim() || text) : undefined,
  };
}
