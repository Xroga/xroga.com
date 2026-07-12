import type { LiveSource } from './liveResearch.js';

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function titleMatches(text: string, title: string): boolean {
  const words = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4 && !/^(the|and|for|with|from|that|this|your|about)$/i.test(w));
  if (words.length < 2) return false;
  const hits = words.filter((w) => text.includes(w));
  return hits.length >= Math.min(2, words.length);
}

/** Return only sources the AI response actually references — max 4 cards shown to users */
export function filterCitedSources(
  response: string,
  sources: LiveSource[],
  max = 4
): LiveSource[] {
  if (!sources.length) return [];
  const text = response.toLowerCase();

  const cited = sources.filter((s) => {
    const url = s.url.toLowerCase();
    if (text.includes(url)) return true;

    const domain = domainFromUrl(s.url);
    if (domain && text.includes(domain)) return true;

    // YouTube: channel or video title often cited without URL
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
      const channelHint = s.snippet.split('—')[0]?.trim().toLowerCase();
      if (channelHint && channelHint.length > 3 && text.includes(channelHint.slice(0, 24))) return true;
    }

    if (titleMatches(text, s.title)) return true;
    return false;
  });

  if (cited.length) return cited.slice(0, max);

  // AI used research but didn't cite URLs — show at most 2 top results
  return sources.slice(0, Math.min(2, max));
}

export function enrichSourceMeta(source: LiveSource): LiveSource & { siteDomain: string } {
  const siteDomain = domainFromUrl(source.url) || 'source';
  return { ...source, siteDomain };
}
