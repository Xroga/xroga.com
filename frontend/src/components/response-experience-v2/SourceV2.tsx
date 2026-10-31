'use client';
import { useState } from 'react';
import { Globe } from 'lucide-react';
import { siGithub, siNextdotjs, siSupabase, siStripe, siCloudflare, siReact, siTypescript } from 'simple-icons';
import { safeLinkV2 } from './document';
import styles from './response-v2.module.css';

// Existing simple-icons dependency, CC0 artwork. Trademarks belong to their owners.
// Exact domain matches only, never infer an organization from model prose.
const marks = { 'github.com': siGithub, 'nextjs.org': siNextdotjs, 'supabase.com': siSupabase, 'stripe.com': siStripe, 'cloudflare.com': siCloudflare, 'react.dev': siReact, 'typescriptlang.org': siTypescript };
export function sourceDomainV2(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}
export function SourceMarkV2({ url }: { url: string }) {
  const domain = sourceDomainV2(url);
  const mark = Object.hasOwn(marks, domain) ? marks[domain as keyof typeof marks] : null;
  return mark ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={mark.path} /></svg> : <Globe size={13} aria-hidden="true" />;
}
export function SourceLinkV2({ url, title, number }: { url: string; title: string; number?: number }) {
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
