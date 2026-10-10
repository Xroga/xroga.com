'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowRight, Bus, CarFront, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, MapPin, Plane, Search, Ship, SlidersHorizontal, Tag, TrainFront, type LucideIcon } from 'lucide-react';
import type { XrogaBlock } from '@/lib/xrogaBlocks';
import { formatRichPrice, safeRichImageUrl, safeRichSourceUrl, type XrogaRichResult } from '@/lib/xrogaRichResults';
import styles from './XrogaRichResultsView.module.css';

type ResultsBlock = Extract<XrogaBlock, { type: 'rich-results' }>;
type Layout = 'grid' | 'list';

const STATUS: Record<XrogaRichResult['status'], string> = {
  'search-result': 'Search result', offer: 'Offer · not reserved', 'availability-checked': 'Availability checked',
  confirmed: 'Confirmed', unavailable: 'Unavailable', expired: 'Expired', demo: 'Demo example',
};
const BASIS: Record<NonNullable<XrogaRichResult['price']>['basis'], string> = {
  'one-way': 'one way', 'round-trip': 'round trip', 'per-night': 'per night', 'total-stay': 'total stay',
  'per-item': 'per item', 'per-person': 'per person', 'per-day': 'per day', monthly: 'per month', total: 'total', from: 'from',
};
const ICONS: Record<XrogaRichResult['domain'], LucideIcon> = {
  transport: Plane, accommodation: MapPin, shopping: Tag, reservation: MapPin,
  vehicle: CarFront, travel: MapPin, business: SlidersHorizontal, other: Search,
};
const TRANSPORT_ICONS: Record<NonNullable<XrogaRichResult['transportMode']>, LucideIcon> = {
  flight: Plane, train: TrainFront, bus: Bus, ferry: Ship, transfer: CarFront,
};

function RichMedia({ item, hidden }: { item: XrogaRichResult; hidden?: boolean }) {
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState(false);
  const isDemo = item.demo === true || item.status === 'demo';
  const images = hidden ? [] : (item.images ?? []).filter((image) => safeRichImageUrl(image.url, image.rights, isDemo));
  const current = images[index] ?? images[0];
  const url = current && !broken ? safeRichImageUrl(current.url, current.rights, isDemo) : null;
  const Icon = item.transportMode ? TRANSPORT_ICONS[item.transportMode] : ICONS[item.domain];
  return <div className={styles.media}>
    {url ? <Image src={url} alt={current.alt} fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 360px" loading="lazy" onError={() => setBroken(true)} className={styles.photo} />
      : <div className={styles.fallback}><Icon size={34} strokeWidth={1.35} aria-hidden="true" /><span>{item.kind}</span></div>}
    {isDemo && url ? <span className={styles.imageLabel}>Illustrative demo image</span> : null}
    {url && images.length > 1 ? <div className={styles.imageControls}>
      <button type="button" aria-label={`Previous image for ${item.title}`} onClick={() => { setBroken(false); setIndex((index - 1 + images.length) % images.length); }}><ChevronLeft size={16} /></button>
      <span>{index + 1} / {images.length}</span>
      <button type="button" aria-label={`Next image for ${item.title}`} onClick={() => { setBroken(false); setIndex((index + 1) % images.length); }}><ChevronRight size={16} /></button>
    </div> : null}
  </div>;
}

function RouteLine({ item }: { item: XrogaRichResult }) {
  if (!item.route?.length) return null;
  const first = item.route[0];
  const last = item.route[item.route.length - 1];
  const Icon = item.transportMode ? TRANSPORT_ICONS[item.transportMode] : Plane;
  const shortZone = (value?: string) => value?.split('/').at(-1)?.replaceAll('_', ' ');
  return <div className={styles.route} aria-label={`Route from ${first.from} to ${last.to}`}>
    <div><strong>{first.from}</strong><small>{first.departureLocal ?? 'Time not supplied'}{first.departureTimeZone ? ` · ${shortZone(first.departureTimeZone)}` : ''}</small></div>
    <div className={styles.routeTrack}><span /><Icon size={16} aria-hidden="true" /><span /></div>
    <div><strong>{last.to}</strong><small>{last.arrivalLocal ?? 'Time not supplied'}{last.arrivalTimeZone ? ` · ${shortZone(last.arrivalTimeZone)}` : ''}</small></div>
  </div>;
}

function ResultCard({ item, presentation, hideImages, selected, onCompare }: {
  item: XrogaRichResult; presentation: ResultsBlock['presentation']; hideImages?: boolean; selected: boolean; onCompare: () => void;
}) {
  const sourceUrl = safeRichSourceUrl(item.source?.url);
  const price = formatRichPrice(item.price);
  const showMedia = !['compact', 'ticket'].includes(presentation ?? '');
  return <article className={`${styles.card} ${presentation === 'ticket' ? styles.ticket : ''}`} data-testid="rich-result-card">
    {showMedia ? <RichMedia item={item} hidden={hideImages} /> : null}
    <div className={styles.cardBody}>
      <div className={styles.cardTop}><span className={styles.kind}>{item.kind}</span><span className={`${styles.status} ${styles[`status_${item.status.replace('-', '_')}`]}`}>{item.demo ? 'Demo · ' : ''}{STATUS[item.status]}</span></div>
      <h3>{item.title}</h3>
      {item.provider ? <p className={styles.provider}>By {item.provider}</p> : null}
      {item.summary ? <p className={styles.summary}>{item.summary}</p> : null}
      <RouteLine item={item} />
      {item.facts?.length ? <dl className={styles.facts}>{item.facts.slice(0, 4).map((fact, i) => <div key={`${fact.label}-${i}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}
      {price ? <div className={styles.price}><strong>{price}</strong><span>{BASIS[item.price!.basis]}</span>{item.price?.taxesIncluded === false ? <small>Taxes extra or unknown</small> : null}</div> : null}
      <div className={styles.actions}>
        {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open source for ${item.title} in a new tab`}>View source <ExternalLink size={14} /></a> : null}
        {(item.facts?.length || item.route?.length || item.coupon || item.limitations || item.source) ? <details className={styles.details}><summary>Details <ArrowRight size={13} /></summary>
          {item.route?.length ? <ol className={styles.legs}>{item.route.map((leg, i) => <li key={`${leg.from}-${i}`}><strong>{leg.from} → {leg.to}</strong>{leg.service ? ` · ${leg.service}` : ''}{leg.duration ? ` · ${leg.duration}` : ''}<br /><small>{leg.departureLocal ?? 'Departure unknown'}{leg.departureTimeZone ? ` (${leg.departureTimeZone})` : ''} → {leg.arrivalLocal ?? 'Arrival unknown'}{leg.arrivalTimeZone ? ` (${leg.arrivalTimeZone})` : ''}</small></li>)}</ol> : null}
          {item.facts?.slice(4).map((fact, i) => <p key={`${fact.label}-${i}`}><strong>{fact.label}:</strong> {fact.value}</p>)}
          {item.coupon ? <Coupon item={item} /> : null}
          {item.availabilityEvidence ? <p><strong>Evidence:</strong> {item.availabilityEvidence}</p> : null}
          {item.confirmationReference ? <p><strong>Receipt reference:</strong> {item.confirmationReference}</p> : null}
          {item.limitations ? <p><strong>Limitations:</strong> {item.limitations}</p> : null}
          {item.price?.note ? <p><strong>Price basis:</strong> {item.price.note}</p> : null}
          {item.source ? <p><strong>Source:</strong> {item.source.title}{item.source.observedAt ? ` · observed ${new Date(item.source.observedAt).toLocaleString()}` : ''}</p> : null}
          {item.images?.some((image) => image.attribution) ? <p><strong>Image credit:</strong> {item.images.map((image) => image.attribution).filter(Boolean).join(', ')}</p> : null}
        </details> : null}
        <label className={styles.compare}><input type="checkbox" checked={selected} onChange={onCompare} /> Compare</label>
      </div>
    </div>
  </article>;
}

function Coupon({ item }: { item: XrogaRichResult }) {
  const [copied, setCopied] = useState(false);
  if (!item.coupon) return null;
  return <p className={styles.coupon}><strong>Coupon:</strong> <code>{item.coupon.code}</code> <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(item.coupon!.code); setCopied(true); } catch { setCopied(false); } }} aria-label={`Copy coupon ${item.coupon.code}`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button><br />{item.coupon.eligibility ? <small>Eligibility: {item.coupon.eligibility}</small> : null}{item.coupon.expiresAt ? <small>Expires: {new Date(item.coupon.expiresAt).toLocaleDateString()}</small> : null}</p>;
}

function Comparison({ items }: { items: XrogaRichResult[] }) {
  if (items.length < 2) return null;
  const factLabels = [...new Set(items.flatMap((item) => item.facts?.map((fact) => fact.label) ?? []))].slice(0, 8);
  return <div className={styles.comparison} role="region" aria-label="Selected result comparison"><h3>Side-by-side comparison</h3><div className={styles.tableScroll}><table><thead><tr><th scope="col">Detail</th>{items.map((item) => <th scope="col" key={item.id}>{item.title}</th>)}</tr></thead><tbody><tr><th scope="row">Status</th>{items.map((item) => <td key={item.id}>{STATUS[item.status]}</td>)}</tr><tr><th scope="row">Price</th>{items.map((item) => <td key={item.id}>{formatRichPrice(item.price) ?? 'Not supplied'}{item.price ? ` · ${BASIS[item.price.basis]}` : ''}</td>)}</tr>{factLabels.map((label) => <tr key={label}><th scope="row">{label}</th>{items.map((item) => <td key={item.id}>{item.facts?.find((fact) => fact.label === label)?.value ?? 'Not supplied'}</td>)}</tr>)}</tbody></table></div></div>;
}

export function XrogaRichResultsView({ block, hideImages }: { block: XrogaBlock; hideImages?: boolean }) {
  const [layout, setLayout] = useState<Layout>(block.type === 'rich-results' && ['list', 'compact', 'horizontal', 'ticket'].includes(block.presentation ?? '') ? 'list' : 'grid');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const [selected, setSelected] = useState<string[]>([]);
  if (block.type !== 'rich-results') return null;
  const domains = [...new Set(block.items.map((item) => item.domain))];
  const currencies = new Set(block.items.filter((item) => item.price).map((item) => item.price!.currency));
  const canSortPrice = currencies.size <= 1 && block.items.filter((item) => item.price).length > 1;
  const visible = block.items.filter((item) => filter === 'all' || item.domain === filter);
  if (sort === 'title') visible.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'price' && canSortPrice) visible.sort((a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity));
  const compared = block.items.filter((item) => selected.includes(item.id) || (block.presentation === 'comparison' && selected.length === 0 && block.items.indexOf(item) < 2));
  return <section className={styles.root} aria-label={block.title ?? 'Rich results'} data-testid="rich-results">
    <div className={styles.heading}><div><span className={styles.eyebrow}>{block.items.length} structured {block.items.length === 1 ? 'result' : 'results'}</span><h2>{block.title ?? 'Results to explore'}</h2>{block.description ? <p>{block.description}</p> : null}</div></div>
    {block.items.some((item) => item.status === 'demo' || item.demo) ? <p className={styles.demoNotice}>Demo experience — no real work or external changes are performed. Images and examples are illustrative.</p> : null}
    {block.state === 'loading' ? <div className={styles.loading} role="status">Loading result details…</div> : null}
    {block.state === 'partial' ? <p className={styles.partial}>Partial output — some details may still be missing.</p> : null}
    <div className={styles.toolbar}>
      {domains.length > 1 ? <label>Category <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All categories</option>{domains.map((domain) => <option key={domain} value={domain}>{domain[0].toUpperCase() + domain.slice(1)}</option>)}</select></label> : null}
      {block.items.length > 1 ? <label>Sort <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="default">Original order</option><option value="title">Name</option>{canSortPrice ? <option value="price">Lowest price</option> : null}</select></label> : null}
      <div className={styles.viewSwitch} role="group" aria-label="Result layout"><button type="button" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Grid</button><button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>List</button></div>
    </div>
    <div className={`${styles.cards} ${layout === 'list' ? styles.list : ''} ${block.presentation === 'horizontal' ? styles.horizontal : ''}`}>{visible.map((item) => <ResultCard key={item.id} item={item} presentation={block.presentation} hideImages={hideImages} selected={selected.includes(item.id)} onCompare={() => setSelected((prior) => prior.includes(item.id) ? prior.filter((id) => id !== item.id) : [...prior, item.id])} />)}</div>
    {!visible.length ? <p className={styles.empty}>No results in this category.</p> : null}
    <Comparison items={compared} />
    <p className={styles.disclaimer}>Prices, availability and details are only as current as their cited source. No booking or purchase is made here.</p>
  </section>;
}
