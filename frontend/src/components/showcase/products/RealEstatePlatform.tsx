'use client';

/**
 * Showcase product: Real Estate Platform.
 *
 * Everything here works against the in-memory sample catalogue: text search,
 * every filter, sorting, favourites (persisted locally), the detail drawer, and a
 * mortgage calculator that does real amortisation arithmetic.
 *
 * All listings are clearly labelled sample data. No agency, customer, review or
 * sales figures are stated anywhere, and no listing claims to be a real property.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { formatCurrency, productReset, readLocal, writeLocal } from './shared';

const BRAND = {
  name: 'Harbourline',
  ink: '#12241f',
  paper: '#ffffff',
  subtle: '#f4f8f6',
  border: '#dfe8e4',
  muted: '#5d6f69',
  accent: '#0f766e',
  accentDeep: '#115e59',
  accentSoft: '#ccfbf1',
} as const;

const FAVOURITES_KEY = 'xroga_showcase_realestate_favourites_v1';

interface Listing {
  id: string;
  title: string;
  area: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  type: 'House' | 'Apartment' | 'Townhouse' | 'Loft';
  year: number;
  features: readonly string[];
  hue: number;
}

/** Sample catalogue. Invented addresses; not real listings. */
const LISTINGS: readonly Listing[] = [
  { id: 'hl-01', title: 'Cedar Row Terrace', area: 'Cedar Row', city: 'Northbank', price: 615000, beds: 3, baths: 2, sqft: 1740, type: 'Townhouse', year: 2016, features: ['Garden', 'Garage', 'Home office'], hue: 168 },
  { id: 'hl-02', title: 'Quay Street Loft', area: 'Old Quay', city: 'Northbank', price: 429000, beds: 1, baths: 1, sqft: 880, type: 'Loft', year: 2019, features: ['River view', 'Concierge'], hue: 196 },
  { id: 'hl-03', title: 'Ashgrove House', area: 'Ashgrove', city: 'Westfield', price: 878000, beds: 4, baths: 3, sqft: 2620, type: 'House', year: 2008, features: ['Garden', 'Garage', 'Fireplace', 'Home office'], hue: 142 },
  { id: 'hl-04', title: 'Marlow Court', area: 'Marlow', city: 'Westfield', price: 352000, beds: 2, baths: 1, sqft: 940, type: 'Apartment', year: 2021, features: ['Balcony', 'Lift'], hue: 210 },
  { id: 'hl-05', title: 'Beckett Mews', area: 'Beckett', city: 'Southgate', price: 545000, beds: 3, baths: 2, sqft: 1480, type: 'Townhouse', year: 2013, features: ['Courtyard', 'Home office'], hue: 32 },
  { id: 'hl-06', title: 'Halden Rise', area: 'Halden', city: 'Southgate', price: 1240000, beds: 5, baths: 4, sqft: 3480, type: 'House', year: 2020, features: ['Garden', 'Garage', 'Pool', 'Home office'], hue: 118 },
  { id: 'hl-07', title: 'Portside Apartments', area: 'Portside', city: 'Northbank', price: 298000, beds: 1, baths: 1, sqft: 660, type: 'Apartment', year: 2017, features: ['Balcony', 'Bike store'], hue: 186 },
  { id: 'hl-08', title: 'Ellery Gardens', area: 'Ellery', city: 'Westfield', price: 702000, beds: 4, baths: 2, sqft: 2080, type: 'House', year: 2011, features: ['Garden', 'Fireplace'], hue: 96 },
  { id: 'hl-09', title: 'Vance Warehouse', area: 'Vance', city: 'Southgate', price: 486000, beds: 2, baths: 2, sqft: 1320, type: 'Loft', year: 2018, features: ['High ceilings', 'Lift', 'Bike store'], hue: 274 },
];

const CITIES = ['All cities', ...Array.from(new Set(LISTINGS.map((l) => l.city)))];
const TYPES = ['All types', 'House', 'Apartment', 'Townhouse', 'Loft'] as const;
const SORTS = [
  { id: 'relevance', label: 'Most relevant' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'sqft-desc', label: 'Largest first' },
  { id: 'year-desc', label: 'Newest built' },
] as const;

type SortId = (typeof SORTS)[number]['id'];

/* ------------------------------------------------------------------ artwork */

/** Per-listing generated artwork, so no card ever shows a broken image. */
function ListingArt({ listing }: { listing: Listing }) {
  const h = listing.hue;
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden className="hl-art-svg">
      <defs>
        <linearGradient id={`hl-sky-${listing.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`hsl(${h} 46% 88%)`} />
          <stop offset="100%" stopColor={`hsl(${h} 38% 78%)`} />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#hl-sky-${listing.id})`} />
      <circle cx="322" cy="52" r="24" fill="#fff" opacity="0.55" />
      {/* Skyline behind */}
      <path d="M0 176 h48 v-40 h34 v40 h30 v-58 h40 v58 h36 v-30 h44 v30 h168 v64 H0Z" fill={`hsl(${h} 30% 62%)`} opacity="0.45" />
      {/* Building front */}
      <rect x="112" y="98" width="176" height="98" rx="4" fill="#fff" opacity="0.92" />
      <path d="M104 100 L200 52 L296 100 Z" fill={`hsl(${h} 42% 40%)`} />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={128 + col * 38}
            y={112 + row * 28}
            width="24"
            height="18"
            rx="2.5"
            fill={`hsl(${h} 44% ${row === 1 && col === 2 ? 62 : 84}%)`}
          />
        )),
      )}
      <rect x="186" y="160" width="28" height="36" rx="2" fill={`hsl(${h} 42% 46%)`} />
      <rect y="196" width="400" height="44" fill={`hsl(${h} 26% 56%)`} opacity="0.6" />
    </svg>
  );
}

/* ---------------------------------------------------------------- component */

export function RealEstatePlatform() {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('All cities');
  const [type, setType] = useState<string>('All types');
  const [maxPrice, setMaxPrice] = useState(1300000);
  const [minBeds, setMinBeds] = useState(0);
  const [sort, setSort] = useState<SortId>('relevance');
  const [onlyFavourites, setOnlyFavourites] = useState(false);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [openListing, setOpenListing] = useState<Listing | null>(null);

  // Favourites are restored after mount so the markup matches on the server.
  useEffect(() => {
    setFavourites(readLocal<string[]>(FAVOURITES_KEY, []));
  }, []);

  function toggleFavourite(id: string) {
    setFavourites((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      writeLocal(FAVOURITES_KEY, next);
      return next;
    });
  }

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = LISTINGS.filter((listing) => {
      if (needle) {
        const haystack = `${listing.title} ${listing.area} ${listing.city} ${listing.type} ${listing.features.join(' ')}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (city !== 'All cities' && listing.city !== city) return false;
      if (type !== 'All types' && listing.type !== type) return false;
      if (listing.price > maxPrice) return false;
      if (listing.beds < minBeds) return false;
      if (onlyFavourites && !favourites.includes(listing.id)) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'sqft-desc') sorted.sort((a, b) => b.sqft - a.sqft);
    else if (sort === 'year-desc') sorted.sort((a, b) => b.year - a.year);
    return sorted;
  }, [query, city, type, maxPrice, minBeds, sort, onlyFavourites, favourites]);

  const activeFilters =
    (query.trim() ? 1 : 0) +
    (city !== 'All cities' ? 1 : 0) +
    (type !== 'All types' ? 1 : 0) +
    (maxPrice < 1300000 ? 1 : 0) +
    (minBeds > 0 ? 1 : 0) +
    (onlyFavourites ? 1 : 0);

  function resetFilters() {
    setQuery('');
    setCity('All cities');
    setType('All types');
    setMaxPrice(1300000);
    setMinBeds(0);
    setOnlyFavourites(false);
    setSort('relevance');
  }

  // Escape closes the detail drawer.
  useEffect(() => {
    if (!openListing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenListing(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openListing]);

  return (
    <div className="hl-root">
      <style>{CSS}</style>

      <a href="#hl-main" className="hl-skip">
        Skip to listings
      </a>

      <header className="hl-header">
        <div className="hl-shell hl-header-inner">
          <span className="hl-brand">
            <span className="hl-brand-mark" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8Z" fill="currentColor" />
              </svg>
            </span>
            {BRAND.name}
          </span>
          <nav className="hl-nav" aria-label="Primary">
            <a href="#hl-main">Buy</a>
            <a href="#hl-calc">Mortgage</a>
          </nav>
          <button
            type="button"
            className={`hl-fav-count${onlyFavourites ? ' hl-fav-count--on' : ''}`}
            aria-pressed={onlyFavourites}
            onClick={() => setOnlyFavourites((on) => !on)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={onlyFavourites ? 'currentColor' : 'none'} aria-hidden>
              <path
                d="M12 20s-7-4.6-7-9.6A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.4c0 5-7 9.6-7 9.6Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            Saved
            <span className="hl-fav-badge">{favourites.length}</span>
          </button>
        </div>
      </header>

      <p className="hl-sample-banner" role="note">
        Sample catalogue for the Xroga AI Showcase — these are invented properties, not real listings.
      </p>

      <main id="hl-main" className="hl-main">
        <div className="hl-shell">
          <div className="hl-page-head">
            <h1 className="hl-h1">Homes for sale</h1>
            <p className="hl-body">
              {LISTINGS.length} sample properties across three areas. Filter, sort, save the ones you like, then estimate
              the monthly cost below.
            </p>
          </div>
        </div>

        <div className="hl-shell hl-layout">
          {/* ------------------------------------------------------- filters */}
          <aside className="hl-filters" aria-label="Filters">
            <div className="hl-filter-head">
              <h2 className="hl-h2">Filters</h2>
              {activeFilters > 0 && (
                <button type="button" className="hl-link-btn" onClick={resetFilters}>
                  Clear {activeFilters}
                </button>
              )}
            </div>

            <div className="hl-field">
              <label htmlFor={`${uid}-q`}>Search</label>
              <input
                id={`${uid}-q`}
                type="search"
                value={query}
                placeholder="Area, feature, or type"
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            <div className="hl-field">
              <label htmlFor={`${uid}-city`}>City</label>
              <select id={`${uid}-city`} value={city} onChange={(event) => setCity(event.target.value)}>
                {CITIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="hl-field">
              <label htmlFor={`${uid}-type`}>Property type</label>
              <select id={`${uid}-type`} value={type} onChange={(event) => setType(event.target.value)}>
                {TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="hl-field">
              <label htmlFor={`${uid}-price`}>
                Max price <strong>{formatCurrency(maxPrice)}</strong>
              </label>
              <input
                id={`${uid}-price`}
                type="range"
                min={250000}
                max={1300000}
                step={25000}
                value={maxPrice}
                onChange={(event) => setMaxPrice(Number(event.target.value))}
              />
            </div>

            <fieldset className="hl-field hl-fieldset">
              <legend>Bedrooms</legend>
              <div className="hl-chips" role="group">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`hl-chip${minBeds === n ? ' hl-chip--on' : ''}`}
                    aria-pressed={minBeds === n}
                    onClick={() => setMinBeds(n)}
                  >
                    {n === 0 ? 'Any' : `${n}+`}
                  </button>
                ))}
              </div>
            </fieldset>
          </aside>

          {/* ------------------------------------------------------- results */}
          <section className="hl-results" aria-label="Search results">
            <div className="hl-results-bar">
              <p className="hl-count" role="status" aria-live="polite">
                <strong>{results.length}</strong> {results.length === 1 ? 'property' : 'properties'}
                {onlyFavourites ? ' saved' : ''}
              </p>
              <div className="hl-field hl-field--inline">
                <label htmlFor={`${uid}-sort`}>Sort</label>
                <select id={`${uid}-sort`} value={sort} onChange={(event) => setSort(event.target.value as SortId)}>
                  {SORTS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="hl-empty">
                <h3 className="hl-h3">Nothing matches those filters</h3>
                <p className="hl-body">Widen the price range or clear a filter to see more of the sample catalogue.</p>
                <button type="button" className="hl-btn hl-btn--outline" onClick={resetFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <ul className="hl-grid">
                {results.map((listing) => {
                  const saved = favourites.includes(listing.id);
                  return (
                    <li key={listing.id} className="hl-card">
                      <div className="hl-art">
                        <ListingArt listing={listing} />
                        <span className="hl-art-type">{listing.type}</span>
                        <button
                          type="button"
                          className={`hl-heart${saved ? ' hl-heart--on' : ''}`}
                          aria-pressed={saved}
                          aria-label={saved ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
                          onClick={() => toggleFavourite(listing.id)}
                        >
                          <svg width="17" height="17" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} aria-hidden>
                            <path
                              d="M12 20s-7-4.6-7-9.6A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.4c0 5-7 9.6-7 9.6Z"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>

                      <div className="hl-card-body">
                        <p className="hl-price">{formatCurrency(listing.price)}</p>
                        <h3 className="hl-h3">{listing.title}</h3>
                        <p className="hl-place">
                          {listing.area}, {listing.city}
                        </p>
                        <dl className="hl-specs">
                          <div>
                            <dt>Beds</dt>
                            <dd>{listing.beds}</dd>
                          </div>
                          <div>
                            <dt>Baths</dt>
                            <dd>{listing.baths}</dd>
                          </div>
                          <div>
                            <dt>Area</dt>
                            <dd>{listing.sqft.toLocaleString('en-US')} sq ft</dd>
                          </div>
                        </dl>
                        <button type="button" className="hl-btn hl-btn--outline hl-btn--sm" onClick={() => setOpenListing(listing)}>
                          View details
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* ------------------------------------------------------ calculator */}
        <MortgageCalculator />
      </main>

      <footer className="hl-footer">
        <div className="hl-shell">
          <p>
            {BRAND.name} — sample property platform for the Xroga AI Showcase. Figures are illustrative and are not
            financial advice.
          </p>
        </div>
      </footer>

      {openListing && <ListingDrawer listing={openListing} onClose={() => setOpenListing(null)} saved={favourites.includes(openListing.id)} onToggle={() => toggleFavourite(openListing.id)} />}
    </div>
  );
}

/* -------------------------------------------------------------- the drawer */

function ListingDrawer({
  listing,
  onClose,
  saved,
  onToggle,
}: {
  listing: Listing;
  onClose: () => void;
  saved: boolean;
  onToggle: () => void;
}) {
  const titleId = `hl-drawer-${listing.id}`;
  return (
    <div className="hl-drawer-wrap" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="hl-drawer-scrim" aria-label="Close details" onClick={onClose} />
      <div className="hl-drawer">
        <div className="hl-drawer-art">
          <ListingArt listing={listing} />
        </div>
        <div className="hl-drawer-body">
          <div className="hl-drawer-top">
            <div>
              <p className="hl-price hl-price--lg">{formatCurrency(listing.price)}</p>
              <h2 id={titleId} className="hl-h2">
                {listing.title}
              </h2>
              <p className="hl-place">
                {listing.area}, {listing.city} · Built {listing.year}
              </p>
            </div>
            <button type="button" className="hl-icon-btn" onClick={onClose} aria-label="Close details">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <dl className="hl-specs hl-specs--lg">
            <div>
              <dt>Bedrooms</dt>
              <dd>{listing.beds}</dd>
            </div>
            <div>
              <dt>Bathrooms</dt>
              <dd>{listing.baths}</dd>
            </div>
            <div>
              <dt>Floor area</dt>
              <dd>{listing.sqft.toLocaleString('en-US')} sq ft</dd>
            </div>
            <div>
              <dt>Price per sq ft</dt>
              <dd>{formatCurrency(Math.round(listing.price / listing.sqft))}</dd>
            </div>
          </dl>

          <h3 className="hl-h3">Features</h3>
          <ul className="hl-features">
            {listing.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>

          <div className="hl-drawer-actions">
            <button type="button" className={`hl-btn ${saved ? 'hl-btn--outline' : 'hl-btn--primary'}`} onClick={onToggle}>
              {saved ? 'Remove from saved' : 'Save this property'}
            </button>
            <a href="#hl-calc" className="hl-btn hl-btn--outline" onClick={onClose}>
              Estimate payments
            </a>
          </div>

          <p className="hl-note">
            Sample listing. Viewing requests are not sent anywhere in this demonstration.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- the calculator */

function MortgageCalculator() {
  const uid = useId();
  const [price, setPrice] = useState(615000);
  const [depositPct, setDepositPct] = useState(15);
  const [years, setYears] = useState(25);
  const [rate, setRate] = useState(5.4);

  const result = useMemo(() => {
    const deposit = Math.round((price * depositPct) / 100);
    const principal = Math.max(price - deposit, 0);
    const months = years * 12;
    const monthlyRate = rate / 100 / 12;

    // Standard amortisation. The zero-rate case would divide by zero.
    const monthly =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));

    const total = monthly * months;
    return {
      deposit,
      principal,
      monthly: Number.isFinite(monthly) ? monthly : 0,
      totalInterest: Number.isFinite(total) ? total - principal : 0,
      total: Number.isFinite(total) ? total : 0,
    };
  }, [price, depositPct, years, rate]);

  return (
    <section id="hl-calc" className="hl-calc">
      <div className="hl-shell hl-calc-inner">
        <div>
          <span className="hl-eyebrow">Affordability</span>
          <h2 className="hl-h2">Mortgage calculator</h2>
          <p className="hl-body">
            Real amortisation arithmetic on the values you enter. Illustrative only — not a quote and not financial
            advice.
          </p>

          <div className="hl-calc-fields">
            <div className="hl-field">
              <label htmlFor={`${uid}-price`}>
                Property price <strong>{formatCurrency(price)}</strong>
              </label>
              <input
                id={`${uid}-price`}
                type="range"
                min={150000}
                max={2000000}
                step={5000}
                value={price}
                onChange={(event) => setPrice(Number(event.target.value))}
              />
            </div>

            <div className="hl-field">
              <label htmlFor={`${uid}-dep`}>
                Deposit <strong>{depositPct}% · {formatCurrency(result.deposit)}</strong>
              </label>
              <input
                id={`${uid}-dep`}
                type="range"
                min={0}
                max={60}
                step={1}
                value={depositPct}
                onChange={(event) => setDepositPct(Number(event.target.value))}
              />
            </div>

            <div className="hl-field">
              <label htmlFor={`${uid}-years`}>
                Term <strong>{years} years</strong>
              </label>
              <input
                id={`${uid}-years`}
                type="range"
                min={5}
                max={40}
                step={1}
                value={years}
                onChange={(event) => setYears(Number(event.target.value))}
              />
            </div>

            <div className="hl-field">
              <label htmlFor={`${uid}-rate`}>
                Interest rate <strong>{rate.toFixed(2)}%</strong>
              </label>
              <input
                id={`${uid}-rate`}
                type="range"
                min={0}
                max={12}
                step={0.05}
                value={rate}
                onChange={(event) => setRate(Number(event.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="hl-calc-out" role="status" aria-live="polite">
          <p className="hl-calc-label">Estimated monthly payment</p>
          <p className="hl-calc-big">{formatCurrency(result.monthly, 'USD', 0)}</p>
          <dl className="hl-calc-rows">
            <div>
              <dt>Loan amount</dt>
              <dd>{formatCurrency(result.principal)}</dd>
            </div>
            <div>
              <dt>Deposit</dt>
              <dd>{formatCurrency(result.deposit)}</dd>
            </div>
            <div>
              <dt>Total interest</dt>
              <dd>{formatCurrency(result.totalInterest)}</dd>
            </div>
            <div>
              <dt>Total repaid</dt>
              <dd>{formatCurrency(result.total)}</dd>
            </div>
          </dl>
          {/* Proportional bar: how much of the total is interest. */}
          <div className="hl-calc-bar" aria-hidden>
            <span
              style={{
                width: `${result.total > 0 ? Math.min(100, (result.principal / result.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="hl-calc-legend" aria-hidden>
            <span className="hl-dot hl-dot--principal" /> Loan
            <span className="hl-dot hl-dot--interest" /> Interest
          </p>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- css */

const CSS = `
${productReset('.hl-root')}
.hl-root {
  --ink: ${BRAND.ink};
  --paper: ${BRAND.paper};
  --subtle: ${BRAND.subtle};
  --border: ${BRAND.border};
  --muted: ${BRAND.muted};
  --accent: ${BRAND.accent};
  --accent-deep: ${BRAND.accentDeep};
  --accent-soft: ${BRAND.accentSoft};
  background: var(--paper); color: var(--ink); line-height: 1.5;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.hl-root *, .hl-root *::before, .hl-root *::after { box-sizing: border-box; }
.hl-skip { position: absolute; left: -9999px; top: 8px; z-index: 60; background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 8px; }
.hl-skip:focus { left: 16px; }
.hl-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.hl-shell { width: 100%; max-width: 1180px; margin: 0 auto; padding: 0 20px; }

.hl-header { position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
.hl-header-inner { display: flex; align-items: center; gap: 16px; height: 62px; }
.hl-brand { display: inline-flex; align-items: center; gap: 9px; font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
.hl-brand-mark { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 9px; background: var(--accent); color: #fff; }
.hl-nav { display: none; gap: 4px; margin-left: 12px; }
.hl-nav a { padding: 7px 11px; border-radius: 8px; font-size: 14px; color: var(--muted); text-decoration: none; }
.hl-nav a:hover { color: var(--ink); background: var(--subtle); }
.hl-fav-count {
  display: inline-flex; align-items: center; gap: 7px; margin-left: auto; padding: 7px 13px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--paper);
  font-size: 13px; font-weight: 600; color: var(--ink); cursor: pointer; font-family: inherit;
}
.hl-fav-count--on { border-color: var(--accent); color: var(--accent-deep); background: var(--accent-soft); }
.hl-fav-badge { min-width: 19px; padding: 1px 5px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px; text-align: center; }

.hl-sample-banner {
  margin: 0; padding: 9px 20px; text-align: center; font-size: 12.5px;
  background: #fff8e6; border-bottom: 1px solid #f2e2b8; color: #7a5b12;
}

.hl-main { padding: 26px 0 0; }
.hl-page-head { margin-bottom: 24px; }
.hl-h1 { margin: 0; font-size: clamp(25px, 3.2vw, 36px); font-weight: 800; letter-spacing: -0.032em; line-height: 1.1; }
.hl-page-head .hl-body { max-width: 58ch; }
.hl-layout { display: grid; gap: 24px; }

/* filters */
.hl-filters {
  align-self: start; display: grid; gap: 18px; padding: 20px;
  border: 1px solid var(--border); border-radius: 14px; background: var(--subtle);
}
.hl-filter-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.hl-link-btn { border: 0; background: none; padding: 0; font-size: 12.5px; font-weight: 650; color: var(--accent-deep); cursor: pointer; text-decoration: underline; font-family: inherit; }
.hl-field { display: grid; gap: 7px; }
.hl-field--inline { display: flex; align-items: center; gap: 8px; }
.hl-field label, .hl-fieldset legend { font-size: 12.5px; font-weight: 600; color: var(--muted); }
.hl-field label strong { color: var(--ink); }
.hl-field input[type="search"], .hl-field select {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 9px;
  background: var(--paper); color: var(--ink); font-size: 14px; font-family: inherit;
}
.hl-field input[type="range"] { width: 100%; accent-color: var(--accent); }
.hl-fieldset { margin: 0; padding: 0; border: 0; }
.hl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.hl-chip {
  padding: 6px 12px; border: 1px solid var(--border); border-radius: 999px; background: var(--paper);
  font-size: 12.5px; font-weight: 600; color: var(--muted); cursor: pointer; font-family: inherit;
}
.hl-chip--on { background: var(--accent); border-color: var(--accent); color: #fff; }

/* results */
.hl-results-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.hl-count { margin: 0; font-size: 14px; color: var(--muted); }
.hl-count strong { color: var(--ink); }
.hl-grid { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; }
.hl-card {
  display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border); border-radius: 14px; background: var(--paper);
  transition: transform 200ms ease, box-shadow 200ms ease;
}
.hl-card:hover { transform: translateY(-3px); box-shadow: 0 24px 42px -30px rgba(18,36,31,0.4); }
.hl-art { position: relative; height: 168px; border-bottom: 1px solid var(--border); }
.hl-art-svg { display: block; width: 100%; height: 100%; }
.hl-art-type {
  position: absolute; left: 11px; top: 11px; padding: 3px 9px; border-radius: 999px;
  background: rgba(255,255,255,0.92); font-size: 10.5px; font-weight: 750; text-transform: uppercase; letter-spacing: 0.06em;
}
.hl-heart {
  position: absolute; right: 10px; top: 10px; display: grid; place-items: center;
  width: 31px; height: 31px; border-radius: 50%; border: 0;
  background: rgba(255,255,255,0.92); color: var(--muted); cursor: pointer;
}
.hl-heart--on { color: #dc2626; }
.hl-card-body { display: grid; gap: 5px; padding: 15px 16px 16px; }
.hl-price { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.02em; }
.hl-price--lg { font-size: 26px; }
.hl-h2 { margin: 8px 0 0; font-size: clamp(21px, 2.4vw, 27px); font-weight: 750; letter-spacing: -0.025em; }
.hl-h3 { margin: 0; font-size: 15px; font-weight: 650; }
.hl-place { margin: 0; font-size: 13px; color: var(--muted); }
.hl-body { margin: 10px 0 0; font-size: 14px; line-height: 1.6; color: var(--muted); }
.hl-eyebrow { font-size: 11px; font-weight: 750; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
.hl-specs { display: flex; flex-wrap: wrap; gap: 14px; margin: 8px 0 12px; }
.hl-specs > div { display: grid; gap: 1px; }
.hl-specs dt { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
.hl-specs dd { margin: 0; font-size: 13.5px; font-weight: 650; }
.hl-specs--lg { gap: 22px; margin: 18px 0 22px; }
.hl-features { display: flex; flex-wrap: wrap; gap: 7px; margin: 10px 0 0; padding: 0; list-style: none; }
.hl-features li { padding: 5px 11px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-deep); font-size: 12.5px; font-weight: 600; }
.hl-empty { padding: 46px 24px; text-align: center; border: 1px dashed var(--border); border-radius: 14px; background: var(--subtle); }
.hl-empty .hl-btn { margin-top: 16px; }

/* buttons */
.hl-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  padding: 10px 18px; border-radius: 999px; border: 1px solid transparent;
  font-size: 13.5px; font-weight: 650; cursor: pointer; text-decoration: none; font-family: inherit;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.hl-btn--sm { padding: 8px 15px; font-size: 12.5px; }
.hl-btn--primary { background: var(--accent); color: #fff; }
.hl-btn--primary:hover { background: var(--accent-deep); }
.hl-btn--outline { background: var(--paper); border-color: var(--border); color: var(--ink); }
.hl-btn--outline:hover { border-color: var(--accent); color: var(--accent-deep); }
.hl-icon-btn { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border: 1px solid var(--border); border-radius: 10px; background: var(--paper); color: var(--ink); cursor: pointer; }

/* drawer */
.hl-drawer-wrap { position: fixed; inset: 0; z-index: 70; display: flex; justify-content: flex-end; }
.hl-drawer-scrim { flex: 1; border: 0; padding: 0; background: rgba(18,36,31,0.42); cursor: pointer; }
.hl-drawer { width: min(470px, 100%); overflow-y: auto; background: var(--paper); box-shadow: -20px 0 60px -30px rgba(18,36,31,0.55); }
.hl-drawer-art { height: 210px; border-bottom: 1px solid var(--border); }
.hl-drawer-body { padding: 20px 22px 28px; }
.hl-drawer-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.hl-drawer-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.hl-note { margin: 16px 0 0; font-size: 12px; color: var(--muted); }

/* calculator */
.hl-calc { margin-top: 44px; padding: 44px 0; background: var(--subtle); border-top: 1px solid var(--border); }
.hl-calc-inner { display: grid; gap: 28px; align-items: start; }
.hl-calc-fields { display: grid; gap: 16px; margin-top: 22px; }
.hl-calc-out { padding: 24px; border-radius: 16px; background: var(--ink); color: #fff; }
.hl-calc-label { margin: 0; font-size: 12px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: #8fb3ab; }
.hl-calc-big { margin: 6px 0 20px; font-size: clamp(32px, 4vw, 44px); font-weight: 800; letter-spacing: -0.035em; }
.hl-calc-rows { display: grid; gap: 9px; margin: 0 0 18px; }
.hl-calc-rows > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; }
.hl-calc-rows dt { color: #8fb3ab; }
.hl-calc-rows dd { margin: 0; font-weight: 650; }
.hl-calc-bar { height: 9px; border-radius: 999px; overflow: hidden; background: #b45309; }
.hl-calc-bar span { display: block; height: 100%; background: #2dd4bf; }
.hl-calc-legend { display: flex; align-items: center; gap: 7px; margin: 11px 0 0; font-size: 12px; color: #8fb3ab; }
.hl-dot { width: 8px; height: 8px; border-radius: 50%; }
.hl-dot--principal { background: #2dd4bf; }
.hl-dot--interest { background: #b45309; margin-left: 10px; }

.hl-footer { padding: 26px 0; border-top: 1px solid var(--border); }
.hl-footer p { margin: 0; font-size: 12.5px; color: var(--muted); }

@media (min-width: 640px) {
  .hl-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 900px) {
  .hl-nav { display: flex; }
  .hl-layout { grid-template-columns: 258px 1fr; }
  .hl-calc-inner { grid-template-columns: 1.1fr 0.9fr; gap: 44px; }
}
@media (min-width: 1120px) {
  .hl-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .hl-root *, .hl-root *::before, .hl-root *::after { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
  .hl-card:hover { transform: none; }
}
`;
