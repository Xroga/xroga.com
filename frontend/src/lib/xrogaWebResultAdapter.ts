import { parseXrogaBlock, type XrogaBlock } from './xrogaBlocks';
import { safeRichSourceUrl } from './xrogaRichResults';

export interface SourcedWebResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  thumbnailUrl?: string;
  siteDomain?: string;
}

/** Web-search metadata supports sourced entity cards, never offers or verified availability. */
export function webSourcesToRichResults(sources: SourcedWebResult[] | undefined, messageId: string): XrogaBlock | null {
  if (!sources?.length) return null;
  const items = sources.slice(0, 8).flatMap((source, index) => {
    const url = safeRichSourceUrl(source.url);
    const title = source.title?.trim();
    if (!url || !title) return [];
    return [{
      id: `web-${index}`, domain: 'other', kind: 'Web result', title: title.slice(0, 500),
      summary: source.snippet?.slice(0, 1200) || undefined,
      provider: source.source?.slice(0, 160) || undefined,
      status: 'search-result',
      source: { title: title.slice(0, 500), url, provider: source.source?.slice(0, 160) || undefined },
    }];
  });
  if (!items.length) return null;
  return parseXrogaBlock({ schemaVersion: 1, id: `web-results-${messageId}`, type: 'rich-results', title: 'Results from web sources', description: 'Source excerpts only. Prices, availability and images were not verified.', presentation: 'compact', items });
}
