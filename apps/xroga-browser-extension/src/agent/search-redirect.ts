// A model that wants to search often navigates straight to a search engine's results page and then spends many turns on its layout, cookie banners and checks.
// A navigation to such an address is answered with the results read for it (web_search: title, address and snippet, in a background tab that is closed again), once
// per address; navigating to the same address again opens the page itself. Pure: it only reads the address.
export type SearchEngine = 'duckduckgo' | 'bing' | 'google';

export function searchUrlToQuery(raw: string): { engine: SearchEngine; query: string } | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  const q = u.searchParams.get('q')?.trim();
  if (!q || q.length < 2 || q.length > 300) return null;
  if (/^google\.[a-z.]{2,6}$/.test(host) && u.pathname === '/search') return { engine: 'google', query: q };
  if (host === 'bing.com' && u.pathname === '/search') return { engine: 'bing', query: q };
  if ((host === 'duckduckgo.com' && (u.pathname === '/' || u.pathname === '/html' || u.pathname === '/html/')) || (host === 'html.duckduckgo.com' && u.pathname.startsWith('/html'))) {
    return { engine: 'duckduckgo', query: q };
  }
  return null;
}
