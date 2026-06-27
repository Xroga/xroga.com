/** Client-side URL safety checks for Xroga Browser */

const BLOCKED_PATTERNS = [
  /porn/i,
  /xxx/i,
  /adult/i,
  /nsfw/i,
  /hentai/i,
  /xnxx/i,
  /xvideos/i,
  /redtube/i,
  /youporn/i,
  /pornhub/i,
  /onlyfans/i,
  /chaturbate/i,
  /camgirl/i,
  /escort/i,
  /sex-chat/i,
];

const BLOCKED_TLDS = ['.xxx', '.adult', '.porn', '.sex'];

export function isUrlBlocked(url: string): boolean {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = u.hostname.toLowerCase();
    const full = u.href.toLowerCase();

    if (BLOCKED_TLDS.some((t) => host.endsWith(t))) return true;
    if (BLOCKED_PATTERNS.some((p) => p.test(host) || p.test(full))) return true;
    return false;
  } catch {
    return false;
  }
}

export function buildSafeSearchUrl(query: string): string {
  const q = encodeURIComponent(query.trim());
  return `https://duckduckgo.com/?q=${q}&safe=1&kp=1`;
}

export function normalizeBrowserInput(input: string): { type: 'url' | 'search'; target: string } {
  const trimmed = input.trim();
  if (!trimmed) return { type: 'search', target: '' };

  const looksLikeUrl =
    /^https?:\/\//i.test(trimmed) ||
    (/^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed) && !trimmed.includes(' '));

  if (looksLikeUrl) {
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    return { type: 'url', target: url };
  }
  return { type: 'search', target: buildSafeSearchUrl(trimmed) };
}

export function enforceSafeSearchOnUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('google.')) {
      u.searchParams.set('safe', 'active');
      return u.toString();
    }
    if (u.hostname.includes('bing.')) {
      u.searchParams.set('adlt', 'strict');
      return u.toString();
    }
    if (u.hostname.includes('duckduckgo.')) {
      u.searchParams.set('safe', '1');
      u.searchParams.set('kp', '1');
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}
