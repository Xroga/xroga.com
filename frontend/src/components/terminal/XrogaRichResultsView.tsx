'use client';

import Image from 'next/image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bus, CarFront, Check, ChevronLeft, ChevronRight, Copy, Heart, MapPin, Plane, Search, Ship, SlidersHorizontal, Tag, TrainFront, type LucideIcon } from 'lucide-react';
import type { XrogaBlock } from '@/lib/xrogaBlocks';
import { formatRichPrice, safeRichImageUrl, safeRichSourceUrl, type XrogaRichResult } from '@/lib/xrogaRichResults';
import type { CitationSource } from '@/lib/xrogaCitations';
import { SourceLogo } from './SourceLogo';
import { XrogaStatusBadge } from './XrogaStatusBadge';
import styles from './XrogaRichResultsView.module.css';

type ResultsBlock = Extract<XrogaBlock, { type: 'rich-results' }>;
type Layout = 'grid' | 'list';

const STATUS: Record<XrogaRichResult['status'], string> = { 'search-result': 'Source result', offer: 'Offer · not reserved', 'availability-checked': 'Availability checked', confirmed: 'Confirmed', unavailable: 'Unavailable', expired: 'Expired', demo: 'Example' };
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

function categoryIllustration(item: XrogaRichResult): { url: string; alt: string; label: string } | null {
  if (item.domain === 'transport' && (!item.transportMode || item.transportMode === 'flight')) return {
    url: '/os-preview/rich-results/airplane-window.webp',
    alt: 'Illustrative view from an airplane, not the listed flight',
    label: 'Flight illustration · not this service',
  };
  if (item.domain === 'accommodation') return {
    url: '/os-preview/rich-results/coastal-suite.webp',
    alt: 'Illustrative hotel room, not the listed property',
    label: 'Stay illustration · not this property',
  };
  if (item.domain === 'travel') return {
    url: '/os-preview/rich-results/alpine-lake.webp',
    alt: 'Illustrative landscape, not the listed tour or destination',
    label: 'Travel illustration · not this tour',
  };
  if (item.domain === 'reservation' || item.domain === 'shopping') return {
    url: '/os-preview/rich-results/restaurant-shopping-diptych.png',
    alt: item.domain === 'reservation' ? 'Illustrative restaurant setting, not this venue' : 'Illustrative shopping products, not this listing',
    label: item.domain === 'reservation' ? 'Restaurant illustration' : 'Product illustration',
  };
  return null;
}

const externalImageLoader = ({ src }: { src: string }) => src;

function sourcePreview(item: XrogaRichResult, previews?: CitationSource[]): string | null {
  const match = previews?.find((source) => safeRichSourceUrl(source.url) === safeRichSourceUrl(item.source?.url));
  const url = match?.thumbnailUrl ? safeRichSourceUrl(match.thumbnailUrl) : null;
  return url?.startsWith('https://') ? url : null;
}

function RichMedia({ item, hidden, previews }: { item: XrogaRichResult; hidden?: boolean; previews?: CitationSource[] }) {
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState(false);
  const isDemo = item.demo === true || item.status === 'demo';
  const images = hidden ? [] : (item.images ?? []).filter((image) => safeRichImageUrl(image.url, image.rights, isDemo));
  const current = images[index] ?? images[0];
  const verifiedUrl = current && !broken ? safeRichImageUrl(current.url, current.rights, isDemo) : null;
  const previewUrl = !hidden && !broken && !verifiedUrl ? sourcePreview(item, previews) : null;
  const illustration = hidden ? null : categoryIllustration(item);
  const url = verifiedUrl ?? previewUrl ?? illustration?.url;
  const Icon = item.transportMode ? TRANSPORT_ICONS[item.transportMode] : ICONS[item.domain];
  return <div className={styles.media}>
    {url && illustration?.url === url && url.endsWith('diptych.png') ? <div className={`${styles.diptych} ${item.domain === 'shopping' ? styles.diptychRight : ''}`} role="img" aria-label={illustration.alt} /> : url ? <Image src={url} alt={verifiedUrl ? current.alt : previewUrl ? `Preview image from ${item.provider ?? 'source'}; verify on provider` : illustration?.alt ?? ''} fill sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 360px" loading="lazy" loader={previewUrl ? externalImageLoader : undefined} unoptimized={Boolean(previewUrl)} onError={() => setBroken(true)} className={styles.photo} />
      : <div className={styles.fallback}><Icon size={34} strokeWidth={1.35} aria-hidden="true" /><span>{item.kind}</span></div>}
    {url && !verifiedUrl ? <span className={styles.imageLabel}>{previewUrl ? 'Source preview · verify on site' : illustration?.label}</span> : isDemo && verifiedUrl ? <span className={styles.imageLabel}>Illustrative demo image</span> : null}
    {verifiedUrl && images.length > 1 ? <div className={styles.imageControls}>
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
  return <div className={styles.route} data-rr-route aria-label={`Route from ${first.from} to ${last.to}`}>
    <div><strong>{first.from}</strong><small>{first.departureLocal ?? 'Time not supplied'}{first.departureTimeZone ? ` · ${shortZone(first.departureTimeZone)}` : ''}</small></div>
    <div className={styles.routeTrack} data-rr-route-track><span /><Icon size={16} aria-hidden="true" /><span /></div>
    <div><strong>{last.to}</strong><small>{last.arrivalLocal ?? 'Time not supplied'}{last.arrivalTimeZone ? ` · ${shortZone(last.arrivalTimeZone)}` : ''}</small></div>
  </div>;
}

function actionLabel(item: XrogaRichResult): string {
  if (item.status === 'search-result' || item.status === 'demo') return item.domain === 'transport' ? 'Explore travel' : item.domain === 'accommodation' ? 'Explore stays' : item.domain === 'reservation' ? 'Explore dining' : item.domain === 'shopping' ? 'Explore product' : item.domain === 'travel' ? 'Explore trip' : 'Visit source';
  if (item.domain === 'shopping') return 'Buy on provider';
  if (item.domain === 'reservation') return 'Reserve on provider';
  if (item.domain === 'transport' || item.domain === 'accommodation' || item.domain === 'travel' || item.domain === 'vehicle') return 'Book on provider';
  return 'Visit provider';
}

function ResultCard({ item, presentation, hideImages, selected, onCompare, saved, onSave, previews }: {
  item: XrogaRichResult; presentation: ResultsBlock['presentation']; hideImages?: boolean; selected: boolean; onCompare: () => void; saved: boolean; onSave: () => void; previews?: CitationSource[];
}) {
  const sourceUrl = safeRichSourceUrl(item.source?.url);
  const price = formatRichPrice(item.price);
  const isDemo = item.demo === true || item.status === 'demo';
  const showMedia = !hideImages && presentation !== 'compact' && Boolean(item.images?.some((image) => safeRichImageUrl(image.url, image.rights, isDemo)) || sourcePreview(item, previews) || categoryIllustration(item));
  return <article className={`${styles.card} ${presentation === 'ticket' || item.transportMode ? styles.ticket : ''} ${item.route?.length ? styles.routeCard : ''}`} data-testid="rich-result-card" data-rr-domain={item.domain}>
    {showMedia ? <div className={styles.mediaWrap}><RichMedia item={item} hidden={hideImages} previews={previews} /><button type="button" className={`${styles.favorite} ${saved ? styles.favoriteActive : ''}`} aria-label={saved ? `Remove ${item.title} from favorites` : `Save ${item.title} to favorites`} aria-pressed={saved} onClick={onSave}><Heart size={18} fill={saved ? 'currentColor' : 'none'} /></button></div> : null}
    <div className={styles.cardBody} data-rr-body>
      <div className={styles.cardTop}><span className={styles.kind}>{item.kind}</span><XrogaStatusBadge status={item.status} label={item.demo ? 'Example' : STATUS[item.status]} /></div>
      <h3>{item.title}</h3>
      {item.provider ? <p className={styles.provider}>{sourceUrl ? <SourceLogo domain={new URL(sourceUrl).hostname} size={18} /> : null}{item.provider}</p> : null}
      {item.summary ? <p className={styles.summary}>{item.summary}</p> : null}
      <RouteLine item={item} />
      {item.facts?.length ? <dl className={styles.facts}>{item.facts.slice(0, 4).map((fact, i) => <div key={`${fact.label}-${i}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}
      {price ? <div className={styles.price} data-rr-price><span>{isDemo ? 'Illustrative price' : 'Source-listed price'}</span><strong>{price}</strong><small>{BASIS[item.price!.basis]}{item.price?.taxesIncluded === false ? ' · taxes extra or unknown' : ''}</small></div> : <p className={styles.priceMissing}>Price and availability: check provider</p>}
      <div className={styles.actions} data-rr-actions>
        {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${actionLabel(item)}: ${item.title} in a new tab`}>{actionLabel(item)} <ArrowRight size={16} /></a> : null}
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
        <button type="button" className={styles.compare} aria-pressed={selected} onClick={onCompare}>{selected ? <Check size={14} /> : <SlidersHorizontal size={14} />}Compare</button>
      </div>
    </div>
  </article>;
}

function Coupon({ item }: { item: XrogaRichResult }) {
  const [copied, setCopied] = useState(false);
  if (!item.coupon) return null;
  return <p className={styles.coupon}><strong>Coupon:</strong> <code>{item.coupon.code}</code> <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(item.coupon!.code); setCopied(true); } catch { setCopied(false); } }} aria-label={`Copy coupon ${item.coupon.code}`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button><br />{item.coupon.eligibility ? <small>Eligibility: {item.coupon.eligibility}</small> : null}{item.coupon.expiresAt ? <small>Expires: {new Date(item.coupon.expiresAt).toLocaleDateString()}</small> : null}</p>;
}

function Comparison({ items, previews }: { items: XrogaRichResult[]; previews?: CitationSource[] }) {
  if (items.length < 2) return null;
  const factLabels = [...new Set(items.flatMap((item) => item.facts?.map((fact) => fact.label) ?? []))].slice(0, 4);
  return <div className={styles.comparison} role="region" aria-label="Selected result comparison" data-rr-comparison><div className={styles.compareHeading}><span className={styles.eyebrow}>Side by side</span><h3>Compare your picks</h3><p>Only details supplied by the sources are compared.</p></div><div className={styles.compareGrid} data-rr-compare-grid>{items.slice(0, 2).map((item) => <article key={item.id} className={styles.compareCard} data-rr-compare-card><div className={styles.compareMedia}><RichMedia item={item} previews={previews} /></div><div className={styles.compareBody}><div className={styles.cardTop}><span className={styles.kind}>{item.kind}</span><XrogaStatusBadge status={item.status} /></div><h4>{item.title}</h4>{item.provider ? <p className={styles.compareProvider}>{safeRichSourceUrl(item.source?.url) ? <SourceLogo domain={new URL(item.source!.url).hostname} size={16} /> : null}{item.provider}</p> : null}<strong className={styles.comparePrice}>{formatRichPrice(item.price) ?? 'Price not supplied'}</strong><span className={styles.compareBasis}>{item.price ? BASIS[item.price.basis] : 'Check provider for current details'}</span>{item.summary ? <p className={styles.compareSummary}>{item.summary}</p> : null}{factLabels.length ? <dl>{factLabels.map((label) => <div key={label}><dt>{label}</dt><dd>{item.facts?.find((fact) => fact.label === label)?.value ?? 'Not supplied'}</dd></div>)}</dl> : null}{safeRichSourceUrl(item.source?.url) ? <a href={item.source!.url} target="_blank" rel="noopener noreferrer">{actionLabel(item)} <ArrowRight size={15} /></a> : null}</div></article>)}</div></div>;
}

const FAVORITES_KEY = 'xroga:saved-rich-results:v1';

function RichResultsContent({ block, hideImages, sourcePreviews }: { block: ResultsBlock; hideImages?: boolean; sourcePreviews?: CitationSource[] }) {
  const [layout, setLayout] = useState<Layout>(['list', 'compact', 'ticket'].includes(block.presentation ?? '') ? 'list' : 'grid');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const carouselRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'); if (Array.isArray(value)) setSaved(value.filter((entry): entry is string => typeof entry === 'string')); } catch { /* storage unavailable */ } }, []);
  useEffect(() => { const update = () => setTabVisible(!document.hidden); update(); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  const domains = [...new Set(block.items.map((item) => item.domain))];
  const currencies = new Set(block.items.filter((item) => item.price).map((item) => item.price!.currency));
  const canSortPrice = currencies.size <= 1 && block.items.filter((item) => item.price).length > 1;
  const visible = block.items.filter((item) => filter === 'all' || item.domain === filter);
  if (sort === 'title') visible.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'price' && canSortPrice) visible.sort((a, b) => (a.price?.amount ?? Infinity) - (b.price?.amount ?? Infinity));
  const compareDomain = domains.find((domain) => visible.filter((item) => item.domain === domain).length >= 2);
  const compared = selected.length ? block.items.filter((item) => selected.includes(item.id)) : compareDomain ? visible.filter((item) => item.domain === compareDomain).slice(0, 2) : [];
  const carousel = layout === 'grid' && visible.length > 1;
  const scrollTo = useCallback((index: number) => {
    const target = (index + visible.length) % visible.length;
    const node = carouselRef.current?.children[target] as HTMLElement | undefined;
    if (node && carouselRef.current) carouselRef.current.scrollTo({ left: node.offsetLeft - (carouselRef.current.children[0] as HTMLElement).offsetLeft, behavior: 'smooth' });
    setActive(target);
  }, [visible.length]);
  const toggleSaved = (item: XrogaRichResult) => {
    const key = safeRichSourceUrl(item.source?.url) ?? `demo:${item.id}`;
    const next = saved.includes(key) ? saved.filter((value) => value !== key) : [...saved, key];
    setSaved(next);
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  useEffect(() => {
    if (!carousel || visible.length < 3 || paused || !tabVisible || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => scrollTo(active + 1), 2000);
    return () => window.clearInterval(timer);
  }, [active, carousel, paused, scrollTo, tabVisible, visible.length]);
  return <section className={styles.root} aria-label={block.title ?? 'Rich results'} data-testid="rich-results">
    <div className={styles.heading}><div><span className={styles.eyebrow}>Explore · {block.items.length} {block.items.length === 1 ? 'option' : 'options'}</span><h2>{block.title ?? 'Results to explore'}</h2>{block.description ? <p>{block.description}</p> : null}</div>{carousel ? <div className={styles.carouselControls}><button type="button" aria-label="Previous result" onClick={() => scrollTo(active - 1)}><ChevronLeft size={18} /></button><button type="button" aria-label="Next result" onClick={() => scrollTo(active + 1)}><ChevronRight size={18} /></button></div> : null}</div>
    {block.items.some((item) => item.status === 'demo' || item.demo) ? <p className={styles.demoNotice}>Demo experience — no real work or external changes are performed. Images and examples are illustrative.</p> : null}
    {block.state === 'loading' ? <div className={styles.loading} role="status">Loading result details…</div> : null}
    {block.state === 'partial' ? <p className={styles.partial}>Partial output — some details may still be missing.</p> : null}
    <div className={styles.toolbar}>
      {domains.length > 1 ? <label>Category <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All categories</option>{domains.map((domain) => <option key={domain} value={domain}>{domain[0].toUpperCase() + domain.slice(1)}</option>)}</select></label> : null}
      {block.items.length > 1 ? <label>Sort <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="default">Original order</option><option value="title">Name</option>{canSortPrice ? <option value="price">Lowest price</option> : null}</select></label> : null}
      <div className={styles.viewSwitch} role="group" aria-label="Result layout"><button type="button" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Grid</button><button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>List</button></div>
    </div>
    <div ref={carouselRef} className={`${styles.cards} ${layout === 'list' ? styles.list : ''} ${carousel ? styles.horizontal : ''}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }} onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)} onScroll={(event) => { if (!carousel) return; const children = Array.from(event.currentTarget.children) as HTMLElement[]; const left = event.currentTarget.scrollLeft; const nearest = children.reduce((best, child, index) => Math.abs(child.offsetLeft - left) < Math.abs(children[best].offsetLeft - left) ? index : best, 0); setActive(nearest); }}>{visible.map((item) => <ResultCard key={item.id} item={item} presentation={block.presentation} hideImages={hideImages} previews={sourcePreviews} saved={saved.includes(safeRichSourceUrl(item.source?.url) ?? `demo:${item.id}`)} onSave={() => toggleSaved(item)} selected={selected.includes(item.id)} onCompare={() => setSelected((prior) => prior.includes(item.id) ? prior.filter((id) => id !== item.id) : [...prior.slice(-1), item.id])} />)}</div>
    {carousel ? <div className={styles.carouselFooter}><span>{active + 1} of {visible.length}</span><div>{visible.map((item, index) => <button key={item.id} type="button" aria-label={`Show result ${index + 1}`} aria-current={index === active ? 'true' : undefined} onClick={() => scrollTo(index)} />)}</div><span>Swipe to explore</span></div> : null}
    {!visible.length ? <p className={styles.empty}>No results in this category.</p> : null}
    <Comparison items={compared} previews={sourcePreviews} />
    <p className={styles.disclaimer}>Prices, availability and details are only as current as their cited source. No booking or purchase is made here.</p>
  </section>;
}

export function XrogaRichResultsView({ block, hideImages, sourcePreviews }: { block: XrogaBlock; hideImages?: boolean; sourcePreviews?: CitationSource[] }) {
  return block.type === 'rich-results' ? <RichResultsContent block={block} hideImages={hideImages} sourcePreviews={sourcePreviews} /> : null;
}
