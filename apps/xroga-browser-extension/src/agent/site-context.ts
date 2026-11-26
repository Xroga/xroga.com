// Website Context Resolver: who is this page, exactly, and which site-scoped knowledge may be activated for it.
// Identity is the parsed origin (scheme + host + port), never a substring of the address. A rule matches a host only on a DNS label boundary, so
// `fake-example.com` and `example.com.evil.test` never match `example.com`. Subdomains, paths, schemes and locales are explicit in the rule.
// Pure: no network, no page access. A matched skill is a pointer plus a why-selected receipt, never loaded text and never a permission.
export interface SiteIdentity {
  origin: string;
  scheme: 'https' | 'http';
  host: string;
  port: string;
  path: string;
  /** Leading locale segment of the path (en, en-US, de), when there is one. */
  locale?: string;
}

export interface SiteRule {
  /** The registered host the rule is for, for example "ads.google.com". Must contain a dot. */
  host: string;
  /** exact: only this host. any: this host and every subdomain of it. listed: this host and the named subdomain labels. Default: any. */
  subdomains?: 'exact' | 'any' | 'listed';
  allowedSubdomains?: string[];
  /** The path must start with this (on a segment boundary). */
  pathPrefix?: string;
  /** Default ['https']. A plain-http site never activates a site skill unless the rule says so. */
  schemes?: Array<'https' | 'http'>;
  /** If given, the page locale must be one of these (empty locale never matches a locale rule). */
  locales?: string[];
}

export interface RuleMatch { matched: boolean; reason: string }

const LOCALE = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;

/** The identity of a page address, or null for anything that is not an ordinary web page. Credentials in the address make it unusable. */
export function identify(url: string): SiteIdentity | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return null;
  const first = u.pathname.split('/').filter(Boolean)[0] ?? '';
  return {
    origin: `${u.protocol}//${u.host}`.toLowerCase(),
    scheme: u.protocol === 'https:' ? 'https' : 'http',
    host,
    port: u.port,
    path: u.pathname,
    ...(LOCALE.test(first) ? { locale: first } : {}),
  };
}

export function validateRule(rule: SiteRule): string | null {
  if (!rule || typeof rule.host !== 'string' || !rule.host.includes('.') || /[/:@\s*]/.test(rule.host)) return 'host must be a plain registered host with a dot, for example ads.google.com';
  if (rule.host !== rule.host.toLowerCase()) return 'host must be lower case';
  if (rule.subdomains === 'listed' && !rule.allowedSubdomains?.length) return 'listed subdomains need allowedSubdomains';
  if (rule.pathPrefix !== undefined && !rule.pathPrefix.startsWith('/')) return 'pathPrefix starts with /';
  return null;
}

export function matchSite(rule: SiteRule, id: SiteIdentity): RuleMatch {
  const bad = validateRule(rule);
  if (bad) return { matched: false, reason: `invalid rule: ${bad}` };
  const schemes = rule.schemes ?? ['https'];
  if (!schemes.includes(id.scheme)) return { matched: false, reason: `scheme ${id.scheme} is not allowed for this rule` };
  const mode = rule.subdomains ?? 'any';
  const host = id.host;
  let hostOk = host === rule.host;
  if (!hostOk && host.endsWith(`.${rule.host}`)) {
    const sub = host.slice(0, host.length - rule.host.length - 1);
    if (mode === 'any') hostOk = true;
    else if (mode === 'listed') hostOk = (rule.allowedSubdomains ?? []).includes(sub);
  }
  if (!hostOk) return { matched: false, reason: `host ${host} is not ${rule.host}${mode === 'exact' ? '' : ' or a subdomain of it'}` };
  if (rule.pathPrefix) {
    const p = rule.pathPrefix.replace(/\/+$/, '');
    if (!(id.path === p || id.path.startsWith(`${p}/`))) return { matched: false, reason: `path ${id.path} is outside ${rule.pathPrefix}` };
  }
  if (rule.locales && !(id.locale && rule.locales.includes(id.locale))) return { matched: false, reason: `locale ${id.locale ?? '(none)'} is not one of ${rule.locales.join(', ')}` };
  return { matched: true, reason: host === rule.host ? `host equals ${rule.host}` : `subdomain of ${rule.host}` };
}

/** The small receipt that says why a capability was chosen. Written to the run so a person can see it; it does not contain page content. */
export interface WhySelected {
  user_goal: string;
  site: string;
  evidence: string;
  capability: string;
  permissions: string;
  expected_result: string;
  verification: string;
}

export function renderWhy(w: WhySelected): string {
  return `Why selected: goal "${w.user_goal.slice(0, 120)}" on ${w.site}; evidence: ${w.evidence}; capability: ${w.capability}; permissions: ${w.permissions}; expected: ${w.expected_result}; verified by: ${w.verification}.`;
}
