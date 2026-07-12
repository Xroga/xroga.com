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
    .filter((w) => w.length > 4 && !/^(the|and|for|with|from|that|this|your|about|video)$/i.test(w));
  if (words.length < 2) return false;
  const hits = words.filter((w) => text.includes(w));
  return hits.length >= Math.min(2, words.length);
}

function isYoutubeCited(text: string, source: LiveSource): boolean {
  const url = source.url.toLowerCase();
  if (text.includes(url)) return true;
  if (text.includes('youtube.com') || text.includes('recommended video')) return true;
  const channelHint = source.snippet.split('—')[0]?.trim().toLowerCase();
  if (channelHint && channelHint.length > 3 && text.includes(channelHint.slice(0, 24))) return true;
  if (titleMatches(text, source.title)) return true;
  return false;
}

function filterCitedWeb(response: string, sources: LiveSource[], max: number): LiveSource[] {
  const text = response.toLowerCase();
  const cited = sources.filter((s) => {
    if (text.includes(s.url.toLowerCase())) return true;
    const domain = domainFromUrl(s.url);
    if (domain && text.includes(domain)) return true;
    if (titleMatches(text, s.title)) return true;
    return false;
  });
  if (cited.length) return cited.slice(0, max);
  return sources.slice(0, Math.min(2, max));
}

/** User-facing sources: always include up to 2 YouTube picks + cited web pages */
export function filterSourcesForUser(
  response: string,
  sources: LiveSource[],
  max = 5
): LiveSource[] {
  if (!sources.length) return [];

  const youtubeAll = sources.filter((s) => s.source === 'youtube');
  const webAll = sources.filter((s) => s.source !== 'youtube');

  // Always show 1–2 YouTube recommendations when API returned them
  const youtubeCited = youtubeAll.filter((s) => isYoutubeCited(response.toLowerCase(), s));
  const youtube =
    youtubeCited.length > 0
      ? youtubeCited.slice(0, 2)
      : youtubeAll.slice(0, 2);

  const webBudget = Math.max(0, max - youtube.length);
  const web = filterCitedWeb(response, webAll, webBudget);

  return [...youtube, ...web].slice(0, max);
}

/** @deprecated use filterSourcesForUser */
export function filterCitedSources(
  response: string,
  sources: LiveSource[],
  max = 4
): LiveSource[] {
  return filterSourcesForUser(response, sources, max);
}

export function enrichSourceMeta(source: LiveSource): LiveSource & { siteDomain: string } {
  const siteDomain = domainFromUrl(source.url) || 'source';
  return { ...source, siteDomain };
}
