'use client';
import { createContext, useContext, useState } from 'react';
import type { CitationSource } from '@/lib/xrogaCitations';
import { sourceKeyV2 } from './sourceRegistry';
import { Globe } from 'lucide-react';
import { siGithub, siNextdotjs, siSupabase, siStripe, siCloudflare, siReact, siTypescript, siMdnwebdocs, siPython, siPostgresql, siNodedotjs, siVercel, siDocker, siN8n, siTemporal, siSentry, siPosthog, siPaypal, siGooglecloud } from 'simple-icons';
import { safeLinkV2 } from './document';
import styles from './response-v2.module.css';

// Existing simple-icons dependency, CC0 artwork. Trademarks belong to their owners.
// Exact domain matches only, never infer an organization from model prose.
const marks = {
  'github.com': siGithub, 'docs.github.com': siGithub, 'nextjs.org': siNextdotjs,
  'supabase.com': siSupabase, 'stripe.com': siStripe, 'docs.stripe.com': siStripe,
  'cloudflare.com': siCloudflare, 'developers.cloudflare.com': siCloudflare,
  'react.dev': siReact, 'typescriptlang.org': siTypescript,
  'developer.mozilla.org': siMdnwebdocs, 'python.org': siPython, 'docs.python.org': siPython,
  'postgresql.org': siPostgresql, 'nodejs.org': siNodedotjs, 'vercel.com': siVercel,
  'docker.com': siDocker, 'docs.docker.com': siDocker, 'n8n.io': siN8n, 'docs.n8n.io': siN8n,
  'temporal.io': siTemporal, 'docs.temporal.io': siTemporal,
  'paypal.com': siPaypal, 'developer.paypal.com': siPaypal, 'cloud.google.com': siGooglecloud, 'docs.cloud.google.com': siGooglecloud,
  'sentry.io': siSentry, 'docs.sentry.io': siSentry, 'posthog.com': siPosthog,
};
export const SourceRegistryContextV2 = createContext<ReadonlyMap<string, CitationSource>>(new Map());
export function sourceDomainV2(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
/** The site's real logo, supplied by DeepSeek Search through the same-origin icon route. A site without one keeps the globe. */
export function SiteLogoV2({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false);
  if (!domain || failed) return <Globe className={styles.sourceMark} size={13} aria-hidden="true" />;
  return <img className={`${styles.sourceMark} ${styles.siteLogo}`} src={`/api/site-icon?d=${encodeURIComponent(domain)}`} width={14} height={14} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
export function SourceMarkV2({ url }: { url: string }) {
  const domain = sourceDomainV2(url);
  const mark = Object.hasOwn(marks, domain) ? marks[domain as keyof typeof marks] : null;
  if (mark) return <svg className={styles.sourceMark} width="14" height="14" viewBox="0 0 24 24" fill={/^(000000|FFFFFF)$/i.test(mark.hex) ? 'currentColor' : `#${mark.hex}`} aria-hidden="true"><path d={mark.path} /></svg>;
  return <SiteLogoV2 domain={domain} />;
}
export function SourceLinkV2({ url, title, number }: { url: string; title: string; number?: number }) {
  const registry = useContext(SourceRegistryContextV2);
  const entry = registry.get(sourceKeyV2(url) ?? '');
  title = entry?.title || title;
  const safe = safeLinkV2(url);
  if (!safe) return <span>{title}</span>;
  return <a className={styles.citation} href={safe} target="_blank" rel="noopener noreferrer" title={`${title}\n${safe}`} aria-label={`${number ? `Source ${number}: ` : ''}${title}. ${sourceDomainV2(safe)}`}><SourceMarkV2 url={safe} /><span>{sourceDomainV2(safe) || title}</span>{number && <span className={styles.visuallyHidden}> [{number}]</span>}</a>;
}
/** Uses the existing bounded, public-only, redirect/DNS-checked image proxy.
 * No browser credentials/referrer are sent to the external image host. */
export function InlineImageV2({ src, alt }: { src?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const safe = src && safeLinkV2(src);
  if (!safe || !safe.startsWith('https:')) return <span>{alt || 'Image unavailable'}</span>;
  return <span className={styles.inlineImage}>
    {!failed && <img src={`/api/image-fetch?url=${encodeURIComponent(safe)}`} alt={alt || ''} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    <span>{alt && <span>{alt} · </span>}<a href={safe} target="_blank" rel="noopener noreferrer">{failed ? 'Open image' : 'Image source'} · {sourceDomainV2(safe)}</a></span>
  </span>;
}
