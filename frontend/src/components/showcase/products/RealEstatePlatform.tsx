'use client';

import Image from 'next/image';
import { FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { ArrowDown, ArrowUpRight, Heart, Home, MapPin, Menu, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { productReset, readLocal, writeLocal } from './shared';

const ASSETS = {
  villa: '/showcase/real-estate-2026/harbourline-villa.jpg',
  interior: '/showcase/real-estate-2026/harbourline-interior.webp',
  exterior: '/showcase/real-estate-2026/harbourline-exterior.jpg',
} as const;

type Deal = 'Buy' | 'Rent' | 'Off-plan';
type PropertyType = 'Villa' | 'Apartment' | 'Penthouse' | 'Townhouse';
type SortId = 'featured' | 'price-asc' | 'price-desc' | 'sqft-desc';

interface Listing {
  id: number;
  name: string;
  area: string;
  type: PropertyType;
  deal: Deal;
  price: number;
  beds: number;
  baths: number;
  size: number;
  image: string;
  tag: string;
  year: string;
  description: string;
  amenities: readonly string[];
}

const LISTINGS: readonly Listing[] = [
  { id: 1, name: 'Frond M Signature Villa', area: 'Palm Jumeirah', type: 'Villa', deal: 'Buy', price: 18900000, beds: 5, baths: 6, size: 6420, image: ASSETS.exterior, tag: 'Exclusive', year: '2026', description: 'A calm waterfront villa with generous glazing, a private pool, landscaped terraces and direct beach access.', amenities: ['Private beach', 'Infinity pool', 'Smart home', 'Maid’s suite', 'Show kitchen', '4-car parking'] },
  { id: 2, name: 'Marina Gate Skyhome', area: 'Dubai Marina', type: 'Apartment', deal: 'Buy', price: 4850000, beds: 3, baths: 4, size: 2270, image: ASSETS.interior, tag: 'High floor', year: '2025', description: 'A polished high-floor residence with marina views, floor-to-ceiling glass and hotel-style amenities.', amenities: ['Marina view', 'Residents lounge', 'Gym + pool', 'Concierge', '2 parking bays', 'Walk to tram'] },
  { id: 3, name: 'Burj Vista Residence', area: 'Downtown Dubai', type: 'Apartment', deal: 'Buy', price: 6350000, beds: 3, baths: 4, size: 2148, image: ASSETS.interior, tag: 'Burj view', year: '2026', description: 'A refined downtown home with cinematic skyline views and direct access to a walkable luxury district.', amenities: ['Burj Khalifa view', 'Pool deck', 'Fitness studio', 'Concierge', 'Valet', 'Retail podium'] },
  { id: 4, name: 'Emirates Hills Garden House', area: 'Emirates Hills', type: 'Villa', deal: 'Buy', price: 24500000, beds: 6, baths: 7, size: 8910, image: ASSETS.villa, tag: 'New', year: '2026', description: 'A private family compound with a pavilion-style plan, mature garden and a dedicated entertainment wing.', amenities: ['Golf course view', 'Cinema', 'Private gym', 'Driver room', 'Garden pavilion', '6-car parking'] },
  { id: 5, name: 'One Canal Penthouse', area: 'Business Bay', type: 'Penthouse', deal: 'Buy', price: 12900000, beds: 4, baths: 5, size: 4280, image: ASSETS.interior, tag: 'Rare', year: '2026', description: 'A full-floor inspired penthouse with sculpted interiors, oversized entertaining spaces and wide city views.', amenities: ['Private lift lobby', 'Sky terrace', 'Chef kitchen', 'Spa bathroom', 'Concierge', '3 parking bays'] },
  { id: 6, name: 'Jumeirah Park Courtyard', area: 'Jumeirah Park', type: 'Villa', deal: 'Buy', price: 7100000, beds: 4, baths: 5, size: 4038, image: ASSETS.villa, tag: 'Family', year: '2025', description: 'A bright courtyard villa with open-plan family spaces, landscaped garden and a quiet residential setting.', amenities: ['Private pool', 'Landscaped garden', 'Maid’s room', 'Family lounge', 'Solar-ready roof', '2-car garage'] },
  { id: 7, name: 'Creek Harbour Loft', area: 'Dubai Creek Harbour', type: 'Apartment', deal: 'Rent', price: 260000, beds: 2, baths: 3, size: 1510, image: ASSETS.interior, tag: 'Furnished', year: '2026', description: 'A furnished waterfront loft with a calm material palette and direct promenade access.', amenities: ['Furnished', 'Creek view', 'Pool', 'Gym', 'Concierge', 'Promenade access'] },
  { id: 8, name: 'The Valley Estate', area: 'The Valley', type: 'Townhouse', deal: 'Off-plan', price: 3250000, beds: 4, baths: 4, size: 3060, image: ASSETS.exterior, tag: 'Q4 2028', year: '2028', description: 'A future-ready family townhouse with green space, flexible planning and a park-led community.', amenities: ['Payment plan', 'Community park', 'Clubhouse', 'Cycling routes', 'School nearby', '2-car parking'] },
  { id: 9, name: 'Bluewaters Duplex', area: 'Bluewaters Island', type: 'Penthouse', deal: 'Rent', price: 720000, beds: 3, baths: 4, size: 3180, image: ASSETS.interior, tag: 'Sea view', year: '2026', description: 'A duplex residence with resort proportions, sea-facing terraces and island amenities.', amenities: ['Sea view', 'Private terrace', 'Beach club', 'Pool', 'Concierge', '2 parking bays'] },
];

const FAVOURITES_KEY = 'xroga_showcase_realestate_favourites_v2';
const TYPES: readonly ('All' | PropertyType)[] = ['All', 'Villa', 'Apartment', 'Penthouse', 'Townhouse'];
const TIMES = ['10:00', '11:30', '14:00', '16:30', '18:00'] as const;

function money(value: number): string {
  return `AED ${Math.round(value).toLocaleString('en-US')}`;
}

function nextDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function RealEstatePlatform() {
  const [deal, setDeal] = useState<Deal>('Buy');
  const [type, setType] = useState<'All' | PropertyType>('All');
  const [minBeds, setMinBeds] = useState(0);
  const [budget, setBudget] = useState(Number.POSITIVE_INFINITY);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('featured');
  const [favourites, setFavourites] = useState<number[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [compare, setCompare] = useState<number[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [bookingFor, setBookingFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setFavourites(readLocal<number[]>(FAVOURITES_KEY, [])), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selected && !bookingFor) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        setBookingFor(null);
      }
    };
    document.addEventListener('keydown', close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', close);
      document.body.style.overflow = previous;
    };
  }, [selected, bookingFor]);

  const activeFilters = (type !== 'All' ? 1 : 0) + (minBeds > 0 ? 1 : 0) + (Number.isFinite(budget) ? 1 : 0) + (query.trim() ? 1 : 0) + (showSaved ? 1 : 0);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = LISTINGS.filter((listing) => {
      if (listing.deal !== deal) return false;
      if (type !== 'All' && listing.type !== type) return false;
      if (listing.beds < minBeds || listing.price > budget) return false;
      if (showSaved && !favourites.includes(listing.id)) return false;
      return !needle || `${listing.name} ${listing.area} ${listing.type}`.toLowerCase().includes(needle);
    });
    if (sort === 'price-asc') return [...filtered].sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') return [...filtered].sort((a, b) => b.price - a.price);
    if (sort === 'sqft-desc') return [...filtered].sort((a, b) => b.size - a.size);
    return filtered;
  }, [budget, deal, favourites, minBeds, query, showSaved, sort, type]);

  function toggleFavourite(id: number) {
    setFavourites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      writeLocal(FAVOURITES_KEY, next);
      return next;
    });
  }

  function clearFilters() {
    setType('All');
    setMinBeds(0);
    setBudget(Number.POSITIVE_INFINITY);
    setQuery('');
    setShowSaved(false);
  }

  function filterArea(area: string) {
    setDeal('Buy');
    setType('All');
    setQuery(area);
    document.getElementById('hl-properties')?.scrollIntoView({ behavior: 'smooth' });
  }

  function toggleCompare(id: number) {
    setCompare((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) {
        setToast('Compare up to 3 homes');
        return current;
      }
      return [...current, id];
    });
  }

  return (
    <div className="hl-root">
      <style>{CSS}</style>
      <a className="hl-skip" href="#hl-properties">Skip to properties</a>

      <header className="hl-hero" id="hl-top">
        <Image src={ASSETS.villa} alt="" fill priority sizes="100vw" className="hl-hero-image" />
        <div className="hl-hero-shade" />
        <div className="hl-shell hl-hero-shell">
          <nav className="hl-nav" aria-label="Harbourline navigation">
            <a className="hl-brand" href="#hl-top"><span className="hl-brandmark"><Home aria-hidden="true" /></span>Harbourline</a>
            <div className="hl-navlinks"><a href="#hl-properties">Properties</a><a href="#hl-collections">Collections</a><a href="#hl-areas">Areas</a><a href="#hl-mortgage">Mortgage</a></div>
            <div className="hl-navactions">
              <button type="button" className="hl-ghost" onClick={() => { setShowSaved((value) => !value); document.getElementById('hl-properties')?.scrollIntoView({ behavior: 'smooth' }); }}>
                <Heart aria-hidden="true" /> Saved <span className="hl-fav-badge">{favourites.length}</span>
              </button>
              <button type="button" className="hl-primary" onClick={() => setBookingFor('Book a viewing')}>Book a viewing</button>
              <button type="button" className="hl-mobile-menu" aria-label="Open menu"><Menu aria-hidden="true" /></button>
            </div>
          </nav>

          <div className="hl-hero-content">
            <p className="hl-kicker">Curated homes across Dubai’s most coveted addresses</p>
            <h1>Find a home<br />worth arriving for.</h1>
            <p className="hl-hero-sub">A quieter, smarter way to discover exceptional apartments, villas and investment opportunities—with verified details and private viewing requests in minutes.</p>
            <div className="hl-searchbar" role="search">
              <label className="hl-searchfield"><span>Where</span><input type="search" aria-label="Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="City, community or tower" /></label>
              <label className="hl-searchfield"><span>Property type</span><select value={type} onChange={(event) => setType(event.target.value as 'All' | PropertyType)}>{TYPES.map((item) => <option key={item} value={item}>{item === 'All' ? 'Any property' : item}</option>)}</select></label>
              <label className="hl-searchfield"><span>Budget</span><select value={Number.isFinite(budget) ? budget : 'any'} onChange={(event) => setBudget(event.target.value === 'any' ? Number.POSITIVE_INFINITY : Number(event.target.value))}><option value="any">Any budget</option><option value="3000000">Up to AED 3M</option><option value="5000000">Up to AED 5M</option><option value="10000000">Up to AED 10M</option><option value="20000000">Up to AED 20M</option></select></label>
              <button type="button" className="hl-searchbtn" onClick={() => document.getElementById('hl-properties')?.scrollIntoView({ behavior: 'smooth' })}><Search aria-hidden="true" />Search homes</button>
            </div>
          </div>

          <div className="hl-hero-meta"><div><strong>184</strong><span>Curated homes</span></div><div><strong>27</strong><span>Prime communities</span></div><div><strong>4.9/5</strong><span>Sample experience</span></div><a href="#hl-properties"><ArrowDown aria-hidden="true" /> Explore</a></div>
        </div>
      </header>

      <main>
        <section className="hl-section" id="hl-properties">
          <div className="hl-shell">
            <SectionHeading eyebrow="Featured residences" title="Homes selected for how you actually want to live." lead="Explore design-led demo residences with clear pricing, real dimensions, and fast access to private viewing requests." />
            <div className="hl-toolbar">
              <div className="hl-segmented" aria-label="Listing type">{(['Buy', 'Rent', 'Off-plan'] as Deal[]).map((item) => <button key={item} type="button" className={deal === item ? 'active' : ''} onClick={() => { setDeal(item); setShowSaved(false); }}>{item}</button>)}</div>
              {TYPES.slice(0, 4).map((item) => <button key={item} type="button" className={cn('hl-filterchip', type === item && 'active')} onClick={() => setType(item)}>{item === 'All' ? 'All homes' : `${item}s`}</button>)}
              <button type="button" className={cn('hl-filterchip', minBeds === 4 && 'active')} onClick={() => setMinBeds(4)}>4+</button>
              <button type="button" className={cn('hl-filterchip', minBeds === 0 && 'active')} onClick={() => setMinBeds(0)}>Any</button>
              <label className="hl-sort">Sort <select aria-label="Sort" value={sort} onChange={(event) => setSort(event.target.value as SortId)}><option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="sqft-desc">Largest first</option></select></label>
            </div>
            <div className="hl-results-bar"><p className="hl-count"><strong>{results.length}</strong> sample homes</p>{activeFilters > 0 ? <button type="button" className="hl-clear" onClick={clearFilters}>Clear {activeFilters}</button> : null}</div>
            <div className="hl-grid">
              {results.map((listing) => <PropertyCard key={listing.id} listing={listing} favourite={favourites.includes(listing.id)} compared={compare.includes(listing.id)} onFavourite={() => toggleFavourite(listing.id)} onCompare={() => toggleCompare(listing.id)} onOpen={() => setSelected(listing)} />)}
              {results.length === 0 ? <div className="hl-empty"><strong>No matching homes yet.</strong><p>Try widening your filters or exploring another collection.</p><button type="button" className="hl-darkbtn" onClick={clearFilters}>Reset filters</button></div> : null}
            </div>
          </div>
        </section>

        <section className="hl-section hl-collections" id="hl-collections">
          <div className="hl-shell">
            <SectionHeading eyebrow="Curated collections" title="Choose a lifestyle before you choose a postcode." lead="Waterfront mornings, skyline evenings, or quiet family streets—start with the feeling you want." />
            <div className="hl-collection-grid">
              <Collection image={ASSETS.exterior} index="01 · Waterfront" title="Palm living" copy="Private beaches, resort access, sunset terraces" className="hl-collection-big" onClick={() => filterArea('Palm Jumeirah')} />
              <div className="hl-collection-stack"><Collection image={ASSETS.interior} index="02 · City" title="Above it all" copy="Downtown & Business Bay" onClick={() => filterArea('Downtown Dubai')} /><Collection image={ASSETS.villa} index="03 · Private" title="Room to breathe" copy="Family villas with serious outdoor space" onClick={() => filterArea('Emirates Hills')} /></div>
            </div>
          </div>
        </section>

        <section className="hl-section" id="hl-areas">
          <div className="hl-shell">
            <SectionHeading eyebrow="Market intelligence" title="Know the neighborhood. Know the numbers." lead="A simple decision layer combining local context with affordability—without turning your search into a spreadsheet." />
            <div className="hl-split">
              <AreaPanel />
              <MortgageCalculator />
            </div>
          </div>
        </section>

        <section className="hl-section hl-advisor-section"><div className="hl-shell"><div className="hl-advisor"><div><span className="hl-eyebrow">Private client service</span><h2>Tell us what “the right home” means to you.</h2><p>Share your budget, preferred areas and non-negotiables. A property advisor can turn that into a focused shortlist instead of another endless feed.</p></div><div className="hl-advisor-actions"><button type="button" className="hl-darkbtn" onClick={() => setBookingFor('Private consultation')}>Book consultation</button><button type="button" className="hl-outlinebtn" onClick={() => setToast('Property valuation demo started')}>List a property</button></div></div></div></section>
      </main>

      <footer className="hl-footer"><div className="hl-shell"><div className="hl-footer-grid"><div><a className="hl-brand" href="#hl-top"><span className="hl-brandmark"><Home aria-hidden="true" /></span>Harbourline</a><p>A modern property discovery experience for buyers, renters and investors who value clarity, design and time.</p></div><FooterColumn title="Discover" links={['Properties', 'Collections', 'Areas', 'Mortgage']} /><FooterColumn title="Company" links={['About', 'Advisors', 'Market reports', 'Careers']} /><div><h3>Contact</h3><p>+971 4 555 0184<br />hello@harbourline.example<br />Dubai, UAE</p></div></div><div className="hl-footer-bottom"><span>© 2026 Harbourline. Concept experience by Xroga.</span><span>All properties, figures and photography are sample showcase content.</span></div></div></footer>

      {selected ? <PropertyDialog listing={selected} favourite={favourites.includes(selected.id)} onClose={() => setSelected(null)} onFavourite={() => toggleFavourite(selected.id)} onBook={() => { setSelected(null); setBookingFor(`View ${selected.name}`); }} /> : null}
      {bookingFor ? <BookingDialog subject={bookingFor} onClose={() => setBookingFor(null)} /> : null}
      {compare.length > 0 ? <div className="hl-comparebar"><div><strong>Compare homes</strong><div>{compare.map((id) => <span key={id}>{LISTINGS.find((item) => item.id === id)?.name}</span>)}</div></div><button type="button" onClick={() => setToast(compare.length < 2 ? 'Choose at least 2 homes to compare' : 'Comparison is ready in this demo')}>Compare <ArrowUpRight aria-hidden="true" /></button></div> : null}
      {toast ? <div className="hl-toast" role="status">{toast}</div> : null}
    </div>
  );
}

function SectionHeading({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) {
  return <div className="hl-section-head"><div><span className="hl-eyebrow">{eyebrow}</span><h2>{title}</h2></div><p>{lead}</p></div>;
}

function PropertyCard({ listing, favourite, compared, onFavourite, onCompare, onOpen }: { listing: Listing; favourite: boolean; compared: boolean; onFavourite: () => void; onCompare: () => void; onOpen: () => void }) {
  return <article className="hl-card"><div className="hl-card-media"><Image src={listing.image} alt={`${listing.name} sample property`} fill sizes="(max-width: 680px) 100vw, (max-width: 980px) 50vw, 33vw" /><div className="hl-card-badges"><span>{listing.type}</span><span className="dark">{listing.tag}</span></div><button type="button" className={cn('hl-heart', favourite && 'saved')} onClick={onFavourite} aria-label={`${favourite ? 'Remove' : 'Save'} ${listing.name}`}><Heart aria-hidden="true" fill={favourite ? 'currentColor' : 'none'} /></button></div><div className="hl-card-body"><p className="hl-price">{money(listing.price)}{listing.deal === 'Rent' ? <small> / year</small> : null}</p><h3>{listing.name}</h3><p className="hl-location"><MapPin aria-hidden="true" />{listing.area}, Dubai</p><dl className="hl-features"><div><dt>Beds</dt><dd>{listing.beds}</dd></div><div><dt>Baths</dt><dd>{listing.baths}</dd></div><div><dt>Sq ft</dt><dd>{listing.size.toLocaleString()}</dd></div></dl><div className="hl-card-footer"><button type="button" className="hl-linkbtn" onClick={onOpen}>View details <ArrowUpRight aria-hidden="true" /></button><label><input type="checkbox" checked={compared} onChange={onCompare} /> Compare</label></div></div></article>;
}

function Collection({ image, index, title, copy, className, onClick }: { image: string; index: string; title: string; copy: string; className?: string; onClick: () => void }) {
  return <button type="button" className={cn('hl-collection', className)} onClick={onClick}><Image src={image} alt="" fill sizes="(max-width: 980px) 100vw, 60vw" /><span className="hl-collection-shade" /><span className="hl-collection-copy"><span><small>{index}</small><strong>{title}</strong><em>{copy}</em></span><i><ArrowUpRight aria-hidden="true" /></i></span></button>;
}

function AreaPanel() {
  return <article className="hl-map-panel"><div className="hl-map-grid" /><span className="hl-road one" /><span className="hl-road two" /><span className="hl-pin p1" /><span className="hl-pin p2" /><span className="hl-pin p3" /><div className="hl-map-copy"><span className="hl-eyebrow">Area spotlight</span><h3>Dubai Marina in a 15-minute radius.</h3><p>Beach access, restaurants, schools, transport and everyday essentials—all close enough to matter.</p></div><div className="hl-map-card"><Image src={ASSETS.interior} alt="Marina Gate sample apartment" width={72} height={60} /><div><strong>Marina Gate Skyhome</strong><span>8 min to beach · 4 min to tram</span><b>AED 4.85M</b></div></div></article>;
}

function MortgageCalculator() {
  const uid = useId();
  const [price, setPrice] = useState(4850000);
  const [deposit, setDeposit] = useState(20);
  const [rate, setRate] = useState(4.25);
  const [years, setYears] = useState(25);
  const calculation = useMemo(() => {
    const down = price * deposit / 100;
    const loan = Math.max(0, price - down);
    const months = Math.max(12, years * 12);
    const monthlyRate = rate / 100 / 12;
    const monthly = monthlyRate === 0 ? loan / months : loan * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
    return { down, loan, monthly, interest: Math.max(0, monthly * months - loan) };
  }, [deposit, price, rate, years]);
  return <article className="hl-finance" id="hl-mortgage"><span className="hl-eyebrow">Affordability</span><h3>Mortgage, without the mystery.</h3><p>Illustrative calculator. Adjust the values to see a monthly estimate instantly.</p><div className="hl-finance-grid"><label htmlFor={`${uid}-price`}>Property price (AED)<input id={`${uid}-price`} type="range" min={500000} max={25000000} step={50000} value={price} onInput={(event) => setPrice(Number(event.currentTarget.value))} /><strong>{money(price)}</strong></label><label htmlFor={`${uid}-deposit`}>Deposit · {deposit}%<input id={`${uid}-deposit`} type="range" min={0} max={90} value={deposit} onInput={(event) => setDeposit(Number(event.currentTarget.value))} /></label><label htmlFor={`${uid}-rate`}>Interest · {rate.toFixed(2)}%<input id={`${uid}-rate`} type="range" min={0} max={12} step={0.05} value={rate} onInput={(event) => setRate(Number(event.currentTarget.value))} /></label><label htmlFor={`${uid}-years`}>Term · {years} years<input id={`${uid}-years`} type="range" min={1} max={35} value={years} onInput={(event) => setYears(Number(event.currentTarget.value))} /></label></div><div className="hl-monthly"><span>Estimated monthly payment</span><strong className="hl-calc-big">{money(calculation.monthly)}</strong><small>Principal + interest estimate</small></div><dl className="hl-breakdown"><div><dt>Loan amount</dt><dd>{money(calculation.loan)}</dd></div><div><dt>Deposit</dt><dd>{money(calculation.down)}</dd></div><div><dt>Total interest</dt><dd>{money(calculation.interest)}</dd></div></dl></article>;
}

function PropertyDialog({ listing, favourite, onClose, onFavourite, onBook }: { listing: Listing; favourite: boolean; onClose: () => void; onFavourite: () => void; onBook: () => void }) {
  const [gallery, setGallery] = useState(0);
  const images = [listing.image, ASSETS.interior, ASSETS.exterior, ASSETS.villa];
  const tabs = ['Exterior', 'Living space', 'Architecture', 'Garden'];
  return <div className="hl-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="hl-dialog" role="dialog" aria-modal="true" aria-label={listing.name}><button type="button" className="hl-close" onClick={onClose} aria-label="Close property details"><X aria-hidden="true" /></button><div className="hl-detail-gallery"><Image src={images[gallery]} alt={`${listing.name} ${tabs[gallery]}`} fill sizes="(max-width: 700px) 100vw, 70vw" /><span>{gallery + 1} / 4</span></div><div className="hl-thumbs" role="tablist" aria-label="Property gallery">{tabs.map((tab, index) => <button key={tab} type="button" role="tab" aria-selected={gallery === index} onClick={() => setGallery(index)} className={gallery === index ? 'active' : ''}>{tab}</button>)}</div><div className="hl-detail-copy"><div className="hl-detail-top"><div><span className="hl-pill">{listing.tag} · {listing.year}</span><h2>{listing.name}</h2><p className="hl-location"><MapPin aria-hidden="true" />{listing.area}, Dubai, UAE</p></div><p className="hl-detail-price">{money(listing.price)}</p></div><dl className="hl-detail-specs"><div><dt>Bedrooms</dt><dd>{listing.beds}</dd></div><div><dt>Bathrooms</dt><dd>{listing.baths}</dd></div><div><dt>Sq ft</dt><dd>{listing.size.toLocaleString()}</dd></div><div><dt>Price per sq ft</dt><dd>{money(listing.price / listing.size)}</dd></div></dl><div className="hl-detail-columns"><div><h3>About this residence</h3><p>{listing.description}</p><h3>Amenities</h3><ul className="hl-amenities">{listing.amenities.map((item) => <li key={item}>✓ {item}</li>)}</ul><h3>Location</h3><div className="hl-detail-map" role="img" aria-label={`Schematic location map for ${listing.name}`}><span /><i /><b>Dubai</b></div></div><aside className="hl-booking-card"><h3>See it in person</h3><p>Request a private viewing in under a minute.</p><button type="button" onClick={onBook}>Book private viewing</button><button type="button" className="outline" onClick={onFavourite}>{favourite ? '♥ Saved' : '♡ Save property'}</button><InquiryForm /></aside></div></div></div></div>;
}

function InquiryForm() {
  const uid = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({ name: false, email: false });
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = { name: !name.trim(), email: !/^\S+@\S+\.\S+$/.test(email) };
    setErrors(next);
    if (!next.name && !next.email) setSubmitted(true);
  }
  if (submitted) return <p className="hl-inquiry-done" role="status">Thanks—this demo enquiry is validated but not sent or stored.</p>;
  return <form className="hl-inquiry-form" onSubmit={submit} noValidate><label htmlFor={`${uid}-name`}>Your name<input id={`${uid}-name`} value={name} aria-invalid={errors.name} onChange={(event) => setName(event.target.value)} /></label><label htmlFor={`${uid}-email`}>Email<input id={`${uid}-email`} type="email" value={email} aria-invalid={errors.email} onChange={(event) => setEmail(event.target.value)} /></label><label htmlFor={`${uid}-message`}>Message (optional)<textarea id={`${uid}-message`} rows={2} value={message} onChange={(event) => setMessage(event.target.value)} /></label><button type="submit">Send enquiry</button></form>;
}

function BookingDialog({ subject, onClose }: { subject: string; onClose: () => void }) {
  const [time, setTime] = useState('14:00');
  const [done, setDone] = useState(false);
  const [date, setDate] = useState(nextDate);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() && phone.trim() && /^\S+@\S+\.\S+$/.test(email)) setDone(true);
  }
  return <div className="hl-modal" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="hl-book-dialog" role="dialog" aria-modal="true" aria-label={subject}><button type="button" className="hl-close" onClick={onClose} aria-label="Close booking"><X aria-hidden="true" /></button>{done ? <div className="hl-success"><i>✓</i><span className="hl-eyebrow">Request prepared</span><h2>You’re in the diary demo.</h2><p>{date} at {time}. Nothing was transmitted; connect your own form backend in a production build.</p><button type="button" className="hl-darkbtn" onClick={onClose}>Done</button></div> : <><span className="hl-eyebrow">Private viewing request</span><h2>{subject}</h2><p>This is sample showcase behavior. The form validates locally and does not contact a real agent.</p><form onSubmit={submit}><div className="hl-book-grid"><label>Preferred date<input type="date" min={nextDate()} value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>Contact preference<select><option>WhatsApp</option><option>Phone</option><option>Email</option></select></label></div><fieldset><legend>Preferred time</legend><div className="hl-times">{TIMES.map((item) => <button key={item} type="button" className={time === item ? 'active' : ''} onClick={() => setTime(item)}>{item}</button>)}</div></fieldset><div className="hl-book-grid"><label>Full name<input value={name} onChange={(event) => setName(event.target.value)} required /></label><label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} required /></label></div><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Message (optional)<textarea rows={3} /></label><button className="hl-submit" type="submit">Confirm viewing request <ArrowUpRight aria-hidden="true" /></button></form></>}</div></div>;
}

function FooterColumn({ title, links }: { title: string; links: readonly string[] }) {
  return <div><h3>{title}</h3>{links.map((link) => <a key={link} href="#hl-top">{link}</a>)}</div>;
}

const CSS = `
${productReset('.hl-root')}
.hl-root{--ink:#0b0e0f;--ink2:#111516;--paper:#f4f2ec;--muted:#6d7472;--line:rgba(11,14,15,.12);--accent:#d7f26a;--deep:#18211d;--shadow:0 22px 60px rgba(14,22,18,.12);background:var(--paper);color:var(--ink);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
.hl-root *{box-sizing:border-box}.hl-root button,.hl-root input,.hl-root select,.hl-root textarea{font:inherit}.hl-root button{cursor:pointer}.hl-root a{color:inherit;text-decoration:none}.hl-root :focus-visible{outline:3px solid #72a7ff;outline-offset:3px}.hl-skip{position:absolute;left:-9999px;z-index:100;padding:10px 16px;background:#fff;color:#111}.hl-skip:focus{left:16px;top:16px}.hl-shell{width:min(1240px,calc(100% - 40px));margin:auto}
.hl-hero{position:relative;min-height:92vh;overflow:hidden;color:#fff;background:#111}.hl-hero-image{object-fit:cover}.hl-hero-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,8,.2),rgba(5,8,8,.76))}.hl-hero-shell{position:relative;z-index:1;min-height:92vh}.hl-nav{height:84px;display:flex;align-items:center;gap:24px}.hl-brand{display:inline-flex;align-items:center;gap:11px;font-size:20px;font-weight:850;letter-spacing:-.03em}.hl-brandmark{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:var(--accent);color:var(--ink)}.hl-brandmark svg{width:18px}.hl-navlinks{display:flex;gap:30px;margin:auto;font-size:14px;color:rgba(255,255,255,.84)}.hl-navlinks a:hover{color:var(--accent)}.hl-navactions{display:flex;align-items:center;gap:10px}.hl-ghost,.hl-primary,.hl-darkbtn,.hl-outlinebtn{border:0;border-radius:999px;padding:12px 17px;font-weight:750}.hl-ghost{display:flex;align-items:center;gap:7px;color:#fff;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);backdrop-filter:blur(12px)}.hl-ghost svg{width:15px}.hl-fav-badge{min-width:18px;padding:1px 5px;border-radius:99px;background:rgba(255,255,255,.18);font-size:10px}.hl-primary{background:var(--accent);color:var(--ink)}.hl-mobile-menu{display:none;border:0;border-radius:50%;width:40px;height:40px;background:rgba(255,255,255,.12);color:#fff}.hl-mobile-menu svg{width:18px;margin:auto}.hl-hero-content{padding:9vh 0 150px;max-width:900px}.hl-kicker{display:flex;align-items:center;gap:10px;margin:0 0 18px;color:rgba(255,255,255,.78);font-size:13px}.hl-kicker:before{content:"";width:34px;height:1px;background:var(--accent)}.hl-hero h1{margin:0 0 24px;font-size:clamp(50px,7.2vw,104px);line-height:.91;letter-spacing:-.065em}.hl-hero-sub{max-width:680px;margin:0 0 34px;color:rgba(255,255,255,.8);font-size:18px}.hl-searchbar{max-width:1040px;display:grid;grid-template-columns:1.4fr .85fr .85fr auto;gap:8px;padding:8px;border-radius:22px;background:rgba(255,255,255,.96);color:var(--ink);box-shadow:0 28px 80px rgba(0,0,0,.25)}.hl-searchfield{padding:9px 14px;border-right:1px solid var(--line)}.hl-searchfield>span{display:block;margin-bottom:3px;color:#858b88;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hl-searchfield input,.hl-searchfield select{width:100%;border:0;outline:0;background:transparent;color:var(--ink);font-size:14px}.hl-searchbtn{display:flex;align-items:center;gap:8px;padding:0 22px;border:0;border-radius:15px;background:var(--ink);color:#fff;font-weight:800}.hl-searchbtn svg{width:16px}.hl-hero-meta{position:absolute;inset:auto 0 22px;display:flex;align-items:end;gap:34px;color:rgba(255,255,255,.78)}.hl-hero-meta div{display:grid}.hl-hero-meta strong{color:#fff;font-size:24px}.hl-hero-meta span{font-size:10px;font-weight:750;letter-spacing:.11em;text-transform:uppercase}.hl-hero-meta a{display:flex;align-items:center;gap:8px;margin-left:auto;font-size:11px;font-weight:750;letter-spacing:.1em;text-transform:uppercase}.hl-hero-meta svg{width:36px;height:36px;padding:9px;border:1px solid rgba(255,255,255,.3);border-radius:50%}
.hl-section{padding:96px 0}.hl-section-head{display:flex;align-items:end;justify-content:space-between;gap:30px;margin-bottom:34px}.hl-eyebrow{display:block;color:inherit;font-size:11px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}.hl-section-head h2,.hl-advisor h2{max-width:750px;margin:7px 0 0;font-size:clamp(38px,4.5vw,64px);line-height:.98;letter-spacing:-.055em}.hl-section-head>p{max-width:470px;margin:0;color:var(--muted);font-size:15px}.hl-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:18px}.hl-segmented{display:flex;padding:5px;border-radius:999px;background:#e8e6df}.hl-segmented button,.hl-filterchip{border:0;border-radius:999px;padding:9px 14px;background:transparent;color:#686f6c;font-size:13px;font-weight:750}.hl-segmented button.active{background:#fff;color:var(--ink);box-shadow:0 4px 16px rgba(0,0,0,.08)}.hl-filterchip{border:1px solid var(--line);background:rgba(255,255,255,.55)}.hl-filterchip.active{background:var(--ink);color:#fff}.hl-sort{display:flex;align-items:center;gap:7px;margin-left:auto;color:var(--muted);font-size:12px}.hl-sort select{padding:9px 13px;border:1px solid var(--line);border-radius:999px;background:#fff}.hl-results-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.hl-count{margin:0;color:var(--muted);font-size:13px}.hl-count strong{color:var(--ink)}.hl-clear{border:0;background:transparent;font-weight:750;text-decoration:underline}.hl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.hl-card{overflow:hidden;border-radius:26px;background:#fff;transition:transform .3s ease,box-shadow .3s ease}.hl-card:hover{transform:translateY(-7px);box-shadow:var(--shadow)}.hl-card-media{position:relative;aspect-ratio:1.28;overflow:hidden;background:#ddd}.hl-card-media img{object-fit:cover;transition:transform .6s ease}.hl-card:hover img{transform:scale(1.045)}.hl-card-badges{position:absolute;top:14px;left:14px;display:flex;gap:7px}.hl-card-badges span{padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.92);font-size:9px;font-weight:850;letter-spacing:.09em;text-transform:uppercase}.hl-card-badges .dark{background:rgba(11,14,15,.84);color:#fff}.hl-heart{position:absolute;right:14px;top:14px;width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(255,255,255,.92);color:#555}.hl-heart svg{width:17px}.hl-heart.saved{background:var(--accent);color:#111}.hl-card-body{padding:20px}.hl-price{margin:0;font-size:23px;font-weight:830;letter-spacing:-.04em}.hl-price small{color:var(--muted);font-size:11px}.hl-card h3{margin:6px 0 4px;font-size:18px}.hl-location{display:flex;align-items:center;gap:5px;margin:0;color:var(--muted);font-size:13px}.hl-location svg{width:14px}.hl-features{display:flex;gap:18px;margin:16px 0 0;padding-top:14px;border-top:1px solid var(--line)}.hl-features div{display:flex;gap:4px}.hl-features dt{color:var(--muted);font-size:11px}.hl-features dd{margin:0;font-size:12px;font-weight:800}.hl-card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:16px}.hl-linkbtn{display:flex;align-items:center;gap:4px;padding:0;border:0;background:transparent;font-size:13px;font-weight:850}.hl-linkbtn svg{width:13px}.hl-card-footer label{display:flex;gap:6px;color:var(--muted);font-size:11px}.hl-card-footer input{accent-color:var(--ink)}.hl-empty{grid-column:1/-1;padding:60px;border-radius:24px;background:#fff;text-align:center;color:var(--muted)}
.hl-collections{overflow:hidden;background:var(--ink);color:#fff}.hl-collections .hl-section-head>p{color:#aeb7b2}.hl-collection-grid{display:grid;grid-template-columns:1.4fr .8fr;gap:18px}.hl-collection-stack{display:grid;gap:18px}.hl-collection{position:relative;min-height:251px;overflow:hidden;padding:0;border:0;border-radius:28px;background:#222;color:#fff;text-align:left}.hl-collection-big{min-height:520px}.hl-collection img{object-fit:cover;transition:transform .5s ease}.hl-collection:hover img{transform:scale(1.04)}.hl-collection-shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 28%,rgba(0,0,0,.78))}.hl-collection-copy{position:absolute;inset:auto 26px 24px;display:flex;align-items:end;justify-content:space-between;gap:20px}.hl-collection-copy>span{display:grid}.hl-collection-copy small{font-size:10px;font-style:normal;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.hl-collection-copy strong{font-size:30px;letter-spacing:-.04em}.hl-collection-copy em{color:rgba(255,255,255,.72);font-size:12px;font-style:normal}.hl-collection-copy i{width:48px;height:48px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.34);border-radius:50%}.hl-collection-copy svg{width:18px}
.hl-split{display:grid;grid-template-columns:1fr 1fr;gap:24px}.hl-map-panel{position:relative;min-height:570px;overflow:hidden;padding:32px;border-radius:30px;background:var(--deep);color:#fff}.hl-map-grid{position:absolute;inset:0;opacity:.25;background-image:linear-gradient(rgba(255,255,255,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.09) 1px,transparent 1px);background-size:34px 34px;transform:rotate(-8deg) scale(1.3)}.hl-road{position:absolute;top:-60%;left:48%;width:36px;height:230%;border-radius:99px;background:#9eab9f;opacity:.17;transform:rotate(37deg)}.hl-road.two{left:22%;transform:rotate(-28deg)}.hl-pin{position:absolute;width:38px;height:38px;border-radius:50% 50% 50% 0;background:var(--accent);box-shadow:0 0 0 10px rgba(215,242,106,.12);transform:rotate(-45deg)}.hl-pin:after{content:"";position:absolute;inset:14px;width:10px;height:10px;border-radius:50%;background:var(--ink)}.hl-pin.p1{left:58%;top:30%}.hl-pin.p2{left:31%;top:58%;transform:rotate(-45deg) scale(.8)}.hl-pin.p3{left:74%;top:68%;transform:rotate(-45deg) scale(.7)}.hl-map-copy{position:relative;z-index:2}.hl-map-copy h3,.hl-finance h3{max-width:390px;margin:8px 0 12px;font-size:38px;line-height:1.02;letter-spacing:-.05em}.hl-map-copy p{max-width:370px;color:#b6beb9}.hl-map-card{position:absolute;right:22px;bottom:22px;z-index:3;width:260px;display:flex;gap:12px;padding:14px;border-radius:18px;background:rgba(255,255,255,.96);color:#111;box-shadow:var(--shadow)}.hl-map-card img{width:72px;height:60px;object-fit:cover;border-radius:11px}.hl-map-card div{display:grid}.hl-map-card strong{font-size:12px}.hl-map-card span{color:var(--muted);font-size:10px}.hl-map-card b{font-size:12px}.hl-finance{padding:34px;border-radius:30px;background:#fff}.hl-finance>p{margin:0 0 22px;color:var(--muted);font-size:13px}.hl-finance-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.hl-finance-grid label{display:grid;gap:4px;padding:13px;border:1px solid var(--line);border-radius:15px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}.hl-finance-grid input{width:100%;accent-color:var(--ink)}.hl-finance-grid strong{color:var(--ink);font-size:13px}.hl-monthly{margin-top:18px;padding:22px;border-radius:20px;background:var(--accent)}.hl-monthly>span{font-size:10px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}.hl-calc-big{display:block;margin:2px 0;font-size:clamp(32px,4vw,42px);letter-spacing:-.055em}.hl-breakdown{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.hl-breakdown div{padding:12px;border-radius:13px;background:#f3f2ed}.hl-breakdown dt{color:var(--muted);font-size:10px}.hl-breakdown dd{margin:3px 0 0;font-size:11px;font-weight:800}
.hl-advisor{display:grid;grid-template-columns:1.2fr .8fr;align-items:center;gap:28px;overflow:hidden;padding:48px;border-radius:34px;background:#e8eadf}.hl-advisor p{max-width:600px;color:#606864}.hl-advisor-actions{display:flex;justify-content:flex-end;gap:10px}.hl-darkbtn{background:var(--ink);color:#fff}.hl-outlinebtn{border:1px solid var(--line);background:rgba(255,255,255,.55);color:var(--ink)}.hl-footer{padding:64px 0 28px;background:var(--ink);color:#fff}.hl-footer-grid{display:grid;grid-template-columns:1.2fr repeat(3,.7fr);gap:40px}.hl-footer-grid>div{display:flex;flex-direction:column;align-items:flex-start;gap:8px}.hl-footer-grid p,.hl-footer-grid a{margin:0;color:#a9b0ad;font-size:12px}.hl-footer-grid h3{margin:0 0 8px;font-size:11px;letter-spacing:.13em;text-transform:uppercase}.hl-footer-bottom{display:flex;justify-content:space-between;gap:20px;margin-top:50px;padding-top:18px;border-top:1px solid rgba(255,255,255,.12);color:#7f8783;font-size:10px}
.hl-modal{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(3,5,5,.66);backdrop-filter:blur(12px)}.hl-dialog{position:relative;width:min(1040px,100%);max-height:92vh;overflow:auto;border-radius:30px;background:var(--paper);box-shadow:0 40px 120px rgba(0,0,0,.4)}.hl-close{position:sticky;top:16px;float:right;z-index:6;width:42px;height:42px;display:grid;place-items:center;margin:16px 16px -58px;border:0;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 8px 24px rgba(0,0,0,.13)}.hl-close svg{width:18px}.hl-detail-gallery{position:relative;height:430px}.hl-detail-gallery img{object-fit:cover}.hl-detail-gallery>span{position:absolute;right:18px;bottom:14px;padding:5px 10px;border-radius:999px;background:rgba(0,0,0,.64);color:#fff;font-size:11px}.hl-thumbs{display:flex;gap:7px;padding:10px 18px;border-bottom:1px solid var(--line)}.hl-thumbs button{padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:10px}.hl-thumbs button.active{background:var(--ink);color:#fff}.hl-detail-copy{padding:30px 34px 36px}.hl-detail-top{display:flex;justify-content:space-between;gap:28px}.hl-pill{display:inline-flex;padding:7px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:10px;font-weight:800}.hl-detail-top h2{margin:8px 0;font-size:42px;letter-spacing:-.05em}.hl-detail-price{font-size:27px;font-weight:850;white-space:nowrap}.hl-detail-specs{display:flex;gap:22px;margin:20px 0;padding:17px 0;border-block:1px solid var(--line)}.hl-detail-specs dt{color:var(--muted);font-size:10px}.hl-detail-specs dd{margin:2px 0 0;font-weight:800}.hl-detail-columns{display:grid;grid-template-columns:1.2fr .8fr;gap:28px}.hl-detail-columns h3{margin:18px 0 7px}.hl-detail-columns p{color:#606765;font-size:13px}.hl-amenities{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0;padding:0;list-style:none}.hl-amenities li{padding:8px 10px;border-radius:10px;background:#fff;font-size:11px}.hl-detail-map{position:relative;height:130px;overflow:hidden;border-radius:14px;background-color:#dfe7df;background-image:linear-gradient(rgba(255,255,255,.55) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.55) 1px,transparent 1px);background-size:24px 24px}.hl-detail-map span{position:absolute;left:50%;top:-20%;width:20px;height:150%;background:#bac8bc;transform:rotate(35deg)}.hl-detail-map i{position:absolute;left:60%;top:42%;width:24px;height:24px;border-radius:50% 50% 50% 0;background:var(--accent);transform:rotate(-45deg)}.hl-detail-map b{position:absolute;left:calc(60% + 28px);top:44%;font-size:11px}.hl-booking-card{height:max-content;padding:20px;border-radius:20px;background:#fff}.hl-booking-card>button,.hl-inquiry-form>button{width:100%;margin-top:8px;padding:12px;border:0;border-radius:13px;background:var(--ink);color:#fff;font-weight:800}.hl-booking-card>button.outline{border:1px solid var(--line);background:transparent;color:var(--ink)}.hl-inquiry-form{display:grid;gap:8px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}.hl-inquiry-form label{display:grid;gap:3px;color:var(--muted);font-size:10px}.hl-inquiry-form input,.hl-inquiry-form textarea{width:100%;padding:9px;border:1px solid var(--line);border-radius:9px;background:#fafafa}.hl-inquiry-form [aria-invalid=true]{border-color:#dc2626}.hl-inquiry-done{padding:12px;border-radius:10px;background:#ecfdf5;color:#065f46!important}.hl-book-dialog{position:relative;width:min(640px,100%);max-height:92vh;overflow:auto;padding:28px;border-radius:30px;background:#fff}.hl-book-dialog h2{margin:8px 0;font-size:36px;letter-spacing:-.04em}.hl-book-dialog>p{color:var(--muted);font-size:13px}.hl-book-dialog form,.hl-book-dialog form>label{display:grid;gap:11px}.hl-book-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hl-book-dialog label,.hl-book-dialog legend{display:grid;gap:5px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.hl-book-dialog input,.hl-book-dialog select,.hl-book-dialog textarea{width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;background:#fafafa}.hl-book-dialog fieldset{margin:0;padding:0;border:0}.hl-times{display:flex;flex-wrap:wrap;gap:7px;margin-top:7px}.hl-times button{padding:8px 11px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:11px}.hl-times button.active{background:var(--ink);color:#fff}.hl-submit{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:14px;border:0;border-radius:14px;background:var(--accent);font-weight:850}.hl-submit svg{width:15px}.hl-success{text-align:center;padding:28px 8px}.hl-success i{width:68px;height:68px;display:grid;place-items:center;margin:0 auto 16px;border-radius:50%;background:var(--accent);font-size:30px;font-style:normal}.hl-comparebar{position:fixed;left:50%;bottom:20px;z-index:90;width:min(760px,calc(100% - 28px));display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border-radius:18px;background:var(--ink);color:#fff;box-shadow:0 20px 70px rgba(0,0,0,.3);transform:translateX(-50%)}.hl-comparebar>div>div{display:flex;gap:7px;margin-top:5px}.hl-comparebar span{padding:6px 9px;border-radius:9px;background:rgba(255,255,255,.1);font-size:10px}.hl-comparebar button{display:flex;align-items:center;gap:5px;padding:10px 13px;border:0;border-radius:12px;background:var(--accent);font-weight:800}.hl-comparebar svg{width:14px}.hl-toast{position:fixed;right:20px;bottom:20px;z-index:120;padding:12px 16px;border-radius:14px;background:var(--ink);color:#fff;box-shadow:var(--shadow);font-size:12px}
@media(max-width:980px){.hl-navlinks{display:none}.hl-searchbar{grid-template-columns:1fr 1fr}.hl-searchbtn{min-height:54px}.hl-grid{grid-template-columns:repeat(2,1fr)}.hl-collection-grid,.hl-split,.hl-advisor{grid-template-columns:1fr}.hl-collection-big{min-height:420px}.hl-collection{min-height:300px}.hl-advisor-actions{justify-content:flex-start}.hl-footer-grid{grid-template-columns:1fr 1fr}.hl-detail-columns{grid-template-columns:1fr}.hl-mobile-menu{display:grid}.hl-navactions .hl-ghost{display:none}}
@media(max-width:680px){.hl-shell{width:min(100% - 24px,1240px)}.hl-nav{height:72px}.hl-brand{font-size:18px}.hl-hero,.hl-hero-shell{min-height:860px}.hl-hero-content{padding-top:7vh}.hl-hero-sub{font-size:16px}.hl-searchbar{grid-template-columns:1fr}.hl-searchfield{border-right:0;border-bottom:1px solid var(--line)}.hl-searchbtn{justify-content:center}.hl-hero-meta{position:static;flex-wrap:wrap;padding-bottom:28px}.hl-hero-meta a{display:none}.hl-section{padding:72px 0}.hl-section-head{display:block}.hl-section-head>p{margin-top:15px}.hl-toolbar{overflow-x:auto;flex-wrap:nowrap;padding-bottom:5px}.hl-sort{margin-left:0}.hl-grid{grid-template-columns:1fr}.hl-collection-grid{display:block}.hl-collection{min-height:370px;margin-bottom:14px}.hl-finance-grid,.hl-breakdown,.hl-book-grid{grid-template-columns:1fr}.hl-advisor{padding:30px 24px}.hl-footer-grid{grid-template-columns:1fr 1fr}.hl-footer-bottom{display:block}.hl-detail-gallery{height:330px}.hl-detail-copy{padding:24px}.hl-detail-top{display:block}.hl-detail-top h2{font-size:34px}.hl-detail-specs{flex-wrap:wrap}.hl-amenities{grid-template-columns:1fr}.hl-modal{padding:9px}.hl-map-card{left:18px;right:18px;width:auto}.hl-comparebar{align-items:flex-start}.hl-comparebar>div>div{max-width:58vw;overflow:auto}.hl-primary{padding:10px 12px}}
@media(prefers-reduced-motion:reduce){.hl-root *{scroll-behavior:auto!important;transition:none!important}.hl-card:hover{transform:none}}
`;
