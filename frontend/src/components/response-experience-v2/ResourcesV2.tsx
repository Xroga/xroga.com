'use client';
import { formatRichPrice, safeRichImageUrl } from '@/lib/xrogaRichResults';
import type { ResponseNodeV2 } from './document';
import { safeLinkV2 } from './document';
import { SourceLinkV2, SourceMarkV2 } from './SourceV2';
import styles from './response-v2.module.css';

/** Read-only source records. Never turn a search result into a verified offer. */
export function ResourcesV2({ node }: { node: Extract<ResponseNodeV2, { kind: 'resources' }> }) {
  return <section className={styles.resources}>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}{node.items.map(item => <section key={item.id} className={styles.resource}>
    <h4>{item.source && <SourceMarkV2 url={item.source.url} />}{item.title}</h4>
    {item.provider && <p className={styles.resourceMeta}>{item.provider}</p>}
    {item.summary && <p>{item.summary}</p>}
    <p className={styles.resourceMeta}>{item.demo ? 'Demo' : item.status.replaceAll('-', ' ')}{item.source?.observedAt ? ` · Observed ${item.source.observedAt}` : ''}</p>
    {item.images?.map((image, index) => {
      const permitted = safeRichImageUrl(image.url, image.rights, item.demo || item.status === 'demo');
      return <figure key={`${image.url}:${index}`}>{permitted ? <img src={permitted} alt={image.alt} loading="lazy" /> : safeLinkV2(image.url) ? <a href={safeLinkV2(image.url)} target="_blank" rel="noopener noreferrer">{image.alt}</a> : <span>{image.alt}</span>}{image.attribution && <figcaption>{image.attribution}</figcaption>}</figure>;
    })}
    {item.price && <div className={styles.resourcePrice}><strong>{formatRichPrice(item.price)}</strong><span>{item.price.basis.replaceAll('-', ' ')}</span><p>{item.price.taxesIncluded !== undefined && `Taxes ${item.price.taxesIncluded ? 'included' : 'excluded'}. `}{item.price.feesIncluded !== undefined && `Fees ${item.price.feesIncluded ? 'included' : 'excluded'}. `}{item.price.note}</p></div>}
    {item.facts && <dl>{item.facts.map((fact, i) => <div key={i}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
    {item.route && <ol className={styles.timeline}>{item.route.map((leg, i) => <li key={i}><strong>{leg.from} → {leg.to}</strong><p>{[leg.provider, leg.service, leg.duration].filter(Boolean).join(' · ')}</p>{leg.departureLocal && <p>Departure: {leg.departureLocal} {leg.departureTimeZone}</p>}{leg.arrivalLocal && <p>Arrival: {leg.arrivalLocal} {leg.arrivalTimeZone}</p>}</li>)}</ol>}
    {item.coupon && <p>Coupon: {item.coupon.code}. {item.coupon.eligibility}{item.coupon.expiresAt ? ` Expires ${item.coupon.expiresAt}` : ''}</p>}
    {item.availabilityEvidence && <p>{item.availabilityEvidence}</p>}
    {item.confirmationReference && <p>Reference: {item.confirmationReference}</p>}
    {item.limitations && <p>{item.limitations}</p>}
    {item.source && <SourceLinkV2 url={item.source.url} title={item.source.title} />}
  </section>)}</section>;
}
