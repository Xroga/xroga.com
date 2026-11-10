// The navigation policy: Nanobrowser's isUrlAllowed (src/background/browser/util.ts at ad47282),
// unchanged in its rules: schemes that are always blocked, then a deny list and an allow list of domains or exact URLs.
// Product sessions add a list of blocked sites, matched with siteOf.
import { siteOf } from './site';

export interface PublicOnlyRule {
  /** The domain, for example "xroga.com". */
  domain: string;
  /** Lower-case public paths, for example "/pricing"; "/" is the home page only. */
  paths: string[];
}

export interface UrlPolicy {
  /** The domain's own app stays blocked; only these public pages open (see publicOnlyAllows). */
  publicOnly?: PublicOnlyRule;
  allow: string[];
  deny: string[];
  /** Xroga task sessions are restricted to HTTPS web pages and temporary blank tabs. */
  publicHttps?: boolean;
  /**
   * Blocked sites, matched with `siteOf`: the exact host, so a row covers the same addresses as an Allow or Ask row.
   * The deny and allow lists keep their own rules for the test panel.
   */
  blocked?: string[];
}

export const EMPTY_POLICY: UrlPolicy = { allow: [], deny: [], blocked: [] };

/** A site as a user may type it ("Example.com", "https://www.example.com/x", "localhost:3000"), as `siteOf` keys it. */
export function siteKey(entry: string): string {
  const e = entry.trim();
  if (!e) return '';
  return siteOf(/^[a-z][a-z0-9+.-]*:\/\//i.test(e) ? e : `http://${e}`);
}

/** Whether an address loads a blocked site: its own site, or for a blob: URL the site that made it. */
export function isBlockedSite(url: string, blocked: readonly string[] | undefined): boolean {
  if (!blocked?.length) return false;
  const trimmed = url.trim();
  const site = siteOf(trimmed.toLowerCase().startsWith('blob:') ? trimmed.slice(5) : trimmed);
  return !!site && blocked.includes(site);
}

/** Blocked whatever the lists say. */
const DANGEROUS_PREFIXES = [
  'https://chromewebstore.google.com', // scripts are not allowed to be injected into the Chrome Web Store
  'chrome-extension://',
  'chrome://',
  'javascript:',
  'data:',
  'file:',
  'vbscript:',
  'ws:',
  'wss:',
];

export function isUrlAllowed(url: string, allowList: string[], denyList: string[]): boolean {
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) return false;
  const lowerCaseUrl = trimmedUrl.toLowerCase();
  if (DANGEROUS_PREFIXES.some(prefix => lowerCaseUrl.startsWith(prefix))) return false;
  if (allowList.length === 0 && denyList.length === 0) return true;
  // A blob: URL belongs to the origin that created it; judge it by that origin (its hostname would be empty).
  if (lowerCaseUrl.startsWith('blob:')) return isUrlAllowed(trimmedUrl.slice(5), allowList, denyList);
  if (trimmedUrl === 'about:blank') return true;
  try {
    const parsedUrl = new URL(trimmedUrl);
    const urlWithoutProtocol = lowerCaseUrl.replace(/^https?:\/\//, '');
    for (const deniedEntry of denyList) if (urlWithoutProtocol === deniedEntry) return false;
    for (const allowedEntry of allowList) if (urlWithoutProtocol === allowedEntry) return true;
    // A fully qualified name ("example.com.") is the same host as the name without its last dot.
    let domain = parsedUrl.hostname.toLowerCase().replace(/\.$/, '');
    const portIndex = domain.indexOf(':');
    if (portIndex > -1 && !domain.startsWith('[')) domain = domain.substring(0, portIndex);
    for (const deniedEntry of denyList) {
      if (domain === deniedEntry || domain.endsWith(`.${deniedEntry}`)) return false;
    }
    for (const allowedEntry of allowList) {
      if (domain === allowedEntry || domain.endsWith(`.${allowedEntry}`)) return true;
    }
    return allowList.length === 0;
  } catch {
    return false;
  }
}

/** Normalises list entries as the user types them: lower case, no scheme, no trailing slash. */
export function normalizePolicy(policy: UrlPolicy): UrlPolicy {
  const clean = (list: string[]) => [
    ...new Set(
      list
        .map(e =>
          e
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            // A bare host written with its last dot ("example.com.") is the host without it, as in isUrlAllowed.
            .replace(/^([^/]+)\.$/, '$1'),
        )
        .filter(Boolean),
    ),
  ];
  return {
    allow: clean(policy.allow),
    deny: clean(policy.deny),
    ...(policy.publicHttps ? { publicHttps: true } : {}),
    ...(policy.publicOnly ? { publicOnly: policy.publicOnly } : {}),
    blocked: [...new Set((policy.blocked ?? []).map(siteKey).filter(Boolean))],
  };
}

/**
 * A domain whose app is off limits but whose public pages may be opened. The bare host and its `www.` form pass only for the
 * listed public paths (the path itself or anything below it, the home page by "/" exactly); every other subdomain is blocked.
 * Judged on every address the tab loads, so a public page that redirects into the app is stopped by the same rule.
 */
export function publicOnlyAllows(rule: PublicOnlyRule, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const domain = rule.domain.toLowerCase();
  if (host !== domain && !host.endsWith(`.${domain}`)) return true; // not this domain: the other rules decide
  if (host !== domain && host !== `www.${domain}`) return false; // any other subdomain
  const path = parsed.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return rule.paths.some(p => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)));
}

export function allows(policy: UrlPolicy, url: string): boolean {
  if (policy.publicOnly && url !== 'about:blank' && !publicOnlyAllows(policy.publicOnly, url)) return false;
  if (policy.publicHttps && url !== 'about:blank') {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/\.$/, '');
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        parsed.port ||
        !host.includes('.') ||
        /^[\d.]+$/.test(host) ||
        host.includes(':') ||
        /\.(?:local|localhost|internal|home\.arpa)$/.test(host)
      )
        return false;
    } catch {
      return false;
    }
  }
  return !isBlockedSite(url, policy.blocked) && isUrlAllowed(url, policy.allow, policy.deny);
}

/** Layer 3 runs only when a list is configured; the always-blocked schemes are covered by layers 1, 2 and 4. */
export function hasLists(policy: UrlPolicy): boolean {
  return !!policy.publicHttps || policy.allow.length > 0 || policy.deny.length > 0 || (policy.blocked?.length ?? 0) > 0;
}

/** The most restrictive combination: a URL passes only if every policy allows it. */
export function combinePolicies(policies: UrlPolicy[]): (url: string) => boolean {
  return url => policies.every(p => allows(p, url)) && isUrlAllowed(url, [], []);
}
