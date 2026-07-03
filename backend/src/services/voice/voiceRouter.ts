const TIME_TRIGGERS =
  /\b(today|yesterday|this week|this month|right now|currently|current|latest|recent|breaking|just happened|this morning|tonight|now)\b/i;

const REALTIME_TRIGGERS =
  /\b(weather|forecast|temperature|stock price|stock market|exchange rate|crypto price|bitcoin price|gold price|score|game score|traffic|flight delay|flight status|news about|headlines|election results|who won)\b/i;

const SEARCH_ACTION_TRIGGERS =
  /\b(search for|look up|find out|google|check the web|search the web|what(?:'s| is) happening)\b/i;

export interface RouteDecision {
  needsSearch: boolean;
  reason: string | null;
  searchQuery: string | null;
}

/** Extract a concise Tavily query from the user's spoken transcript */
function buildSearchQuery(transcript: string): string {
  let q = transcript
    .replace(/\b(can you|could you|please|tell me|what is|what's|what are)\b/gi, '')
    .replace(/\?+$/, '')
    .trim();
  if (q.length > 120) q = q.slice(0, 120);
  return q || transcript.trim();
}

/**
 * Decision router — triggers Tavily only for time-sensitive or real-time questions.
 * Trivial knowledge questions bypass search to save monthly credits.
 */
export function routeVoiceQuery(transcript: string): RouteDecision {
  const text = transcript.trim();
  if (!text) {
    return { needsSearch: false, reason: null, searchQuery: null };
  }

  if (SEARCH_ACTION_TRIGGERS.test(text)) {
    return {
      needsSearch: true,
      reason: 'search_action',
      searchQuery: buildSearchQuery(text),
    };
  }

  const timeHit = TIME_TRIGGERS.test(text);
  const realtimeHit = REALTIME_TRIGGERS.test(text);

  if (timeHit && realtimeHit) {
    return {
      needsSearch: true,
      reason: 'time_and_realtime',
      searchQuery: buildSearchQuery(text),
    };
  }

  if (realtimeHit) {
    return {
      needsSearch: true,
      reason: 'realtime_data',
      searchQuery: buildSearchQuery(text),
    };
  }

  if (timeHit && /\b(news|update|happening|price|rate|score|weather)\b/i.test(text)) {
    return {
      needsSearch: true,
      reason: 'time_sensitive',
      searchQuery: buildSearchQuery(text),
    };
  }

  return { needsSearch: false, reason: null, searchQuery: null };
}
