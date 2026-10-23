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

export function discoveryIntent(prompt: string): { domain: 'transport' | 'accommodation' | 'reservation' | 'travel' | 'vehicle' | 'shopping' | 'business' | 'other'; kind: string; title: string } | null {
  const text = prompt.toLowerCase();
  const route = prompt.match(/\b(?:from\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+to\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  const routeTitle = route ? `${route[1]} → ${route[2]}` : null;
  if (/\b(flights?|airlines?|airfares?|plane tickets?|train tickets?|bus tickets?|ferries?|transport)\b/.test(text) || routeTitle) return { domain: 'transport', kind: 'Travel option', title: routeTitle ? `${routeTitle} · source options` : 'Travel options from sources' };
  if (/\b(hotels?|stays?|resorts?|lodging|accommodation|rooms?)\b/.test(text)) return { domain: 'accommodation', kind: 'Stay', title: 'Places to stay' };
  if (/\b(restaurants?|dining|cafes?|food reservation|table booking)\b/.test(text)) return { domain: 'reservation', kind: 'Restaurant', title: 'Places to explore' };
  if (/\b(tours?|trips?|vacations?|holidays?|packages?|experiences?)\b/.test(text)) return { domain: 'travel', kind: 'Experience', title: 'Trips and experiences' };
  if (/\b(car rentals?|rent a car|vehicle rentals?)\b/.test(text)) return { domain: 'vehicle', kind: 'Vehicle', title: 'Vehicles to explore' };
  if (/\b(products?|buy|shop|shopping|deals?|devices?|laptops?|phones?|headphones?)\b/.test(text)) return { domain: 'shopping', kind: 'Product', title: 'Products from sources' };
  if (/\b(services?|providers?|agencies?|businesses?)\b/.test(text)) return { domain: 'business', kind: 'Service', title: 'Services from sources' };
  if (/\b(compare|comparison|best|cheap|recommend|options|find me)\b/.test(text)) return { domain: 'other', kind: 'Web result', title: 'Options from sources' };
  return null;
}

/** Search metadata becomes navigable discovery cards, never fabricated offers or availability. */
export function webSourcesToRichResults(sources: SourcedWebResult[] | undefined, messageId: string, prompt = ''): XrogaBlock | null {
  const intent = discoveryIntent(prompt);
  if (!sources?.length || !intent) return null;
  const relevant = sources.filter((source) => {
    const signal = `${source.title} ${source.url} ${source.snippet}`.toLowerCase();
    if (intent.domain === 'transport') return /flight|airline|airfare|ticket|train|bus|ferry|route/.test(signal);
    if (intent.domain === 'accommodation') return /hotel|stay|resort|lodg|accommodat|room|hostel|villa/.test(signal);
    if (intent.domain === 'reservation') return /restaurant|dining|cafe|bistro|table|reserv/.test(signal);
    if (intent.domain === 'travel') return /tour|trip|vacation|holiday|package|experience|itinerary/.test(signal);
    if (intent.domain === 'vehicle') return /car|vehicle|rental|rent/.test(signal);
    if (intent.domain === 'shopping') return /product|shop|buy|price|deal|store|laptop|phone|headphone/.test(signal);
    return true;
  });
  if (!relevant.length) return null;
  const items = relevant.slice(0, 8).flatMap((source, index) => {
    const url = safeRichSourceUrl(source.url);
    const title = source.title?.trim();
    if (!url || !title) return [];
    return [{
      id: `web-${index}`, domain: intent.domain, kind: intent.kind, title: title.slice(0, 500),
      summary: source.snippet?.slice(0, 1200) || undefined,
      provider: source.siteDomain || new URL(url).hostname.replace(/^www\./i, ''),
      status: 'search-result',
      source: { title: title.slice(0, 500), url, provider: source.siteDomain || new URL(url).hostname.replace(/^www\./i, '') },
    }];
  });
  if (!items.length) return null;
  return parseXrogaBlock({ schemaVersion: 1, id: `web-results-${messageId}`, type: 'rich-results', title: intent.title, description: 'Source-backed discovery. Open each provider for current prices, times, and availability.', presentation: 'visual', items });
}
