'use client';

/**
 * Showcase product: Booking Platform.
 *
 * A working reservation flow: date and guest selection drive real availability
 * filtering, the price breakdown is computed from the actual stay length, and the
 * multi-step confirmation validates before it will advance.
 *
 * No payment is ever taken or claimed. The final step states plainly that nothing
 * is charged and no reservation is created. All inventory is sample data.
 */

import { useId, useMemo, useState } from 'react';
import { formatCurrency, productReset } from './shared';

const BRAND = {
  name: 'Wayfare',
  ink: '#1b1524',
  paper: '#ffffff',
  subtle: '#f8f6fb',
  border: '#e7e2ee',
  muted: '#655c73',
  accent: '#7c3aed',
  accentDeep: '#5b21b6',
  accentSoft: '#ede9fe',
} as const;

interface Stay {
  id: string;
  name: string;
  kind: 'Studio' | 'Suite' | 'Cabin' | 'Apartment';
  place: string;
  nightly: number;
  cleaning: number;
  sleeps: number;
  bedrooms: number;
  /** Weekdays the property cannot be checked into: 0 = Sunday. */
  blockedWeekdays: readonly number[];
  minNights: number;
  perks: readonly string[];
  hue: number;
}

const STAYS: readonly Stay[] = [
  { id: 'wf-1', name: 'Lantern Studio', kind: 'Studio', place: 'Old Town', nightly: 128, cleaning: 35, sleeps: 2, bedrooms: 1, blockedWeekdays: [], minNights: 1, perks: ['Fast wifi', 'Workspace', 'Self check-in'], hue: 268 },
  { id: 'wf-2', name: 'Ridgeway Cabin', kind: 'Cabin', place: 'Pine Ridge', nightly: 214, cleaning: 60, sleeps: 5, bedrooms: 3, blockedWeekdays: [1, 2], minNights: 2, perks: ['Log fire', 'Parking', 'Pet friendly'], hue: 152 },
  { id: 'wf-3', name: 'Harbour Suite', kind: 'Suite', place: 'Harbourside', nightly: 296, cleaning: 55, sleeps: 4, bedrooms: 2, blockedWeekdays: [0], minNights: 2, perks: ['Sea view', 'Breakfast', 'Late checkout'], hue: 200 },
  { id: 'wf-4', name: 'Maker Loft', kind: 'Apartment', place: 'Foundry', nightly: 168, cleaning: 45, sleeps: 4, bedrooms: 2, blockedWeekdays: [3], minNights: 1, perks: ['Fast wifi', 'Workspace', 'Lift'], hue: 22 },
  { id: 'wf-5', name: 'Willow Apartment', kind: 'Apartment', place: 'Willow Park', nightly: 142, cleaning: 40, sleeps: 3, bedrooms: 1, blockedWeekdays: [], minNights: 1, perks: ['Balcony', 'Parking'], hue: 96 },
  { id: 'wf-6', name: 'Beacon Suite', kind: 'Suite', place: 'Beacon Hill', nightly: 340, cleaning: 70, sleeps: 6, bedrooms: 3, blockedWeekdays: [1], minNights: 3, perks: ['Terrace', 'Breakfast', 'Parking'], hue: 330 },
];

const SERVICE_FEE_RATE = 0.11;
const TAX_RATE = 0.085;

/** Today at midnight, so date arithmetic never drifts on a time component. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function nightsBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function StayArt({ stay }: { stay: Stay }) {
  const h = stay.hue;
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden className="wf-art-svg">
      <defs>
        <linearGradient id={`wf-g-${stay.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${h} 52% 86%)`} />
          <stop offset="100%" stopColor={`hsl(${h + 24} 44% 74%)`} />
        </linearGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#wf-g-${stay.id})`} />
      <path d="M0 190 C70 156 130 200 200 174 C268 150 330 186 400 162 V240 H0Z" fill={`hsl(${h} 34% 58%)`} opacity="0.42" />
      <rect x="132" y="86" width="136" height="104" rx="6" fill="#fff" opacity="0.94" />
      <path d="M124 88 L200 44 L276 88 Z" fill={`hsl(${h} 46% 42%)`} />
      {[0, 1].map((row) =>
        [0, 1, 2].map((col) => (
          <rect key={`${row}-${col}`} x={148 + col * 38} y={104 + row * 34} width="26" height="22" rx="3" fill={`hsl(${h} 48% ${row === 0 && col === 1 ? 60 : 86}%)`} />
        )),
      )}
      <rect x="186" y="158" width="28" height="32" rx="2" fill={`hsl(${h} 46% 48%)`} />
      <circle cx="330" cy="56" r="20" fill="#fff" opacity="0.5" />
    </svg>
  );
}

type Step = 'search' | 'details' | 'confirm' | 'done';

export function BookingPlatform() {
  const uid = useId();
  const today = useMemo(startOfToday, []);
  const defaultFrom = useMemo(() => new Date(today.getTime() + 7 * 86_400_000), [today]);
  const defaultTo = useMemo(() => new Date(today.getTime() + 10 * 86_400_000), [today]);

  const [from, setFrom] = useState(() => toInputValue(defaultFrom));
  const [to, setTo] = useState(() => toInputValue(defaultTo));
  const [guests, setGuests] = useState(2);
  const [kind, setKind] = useState('Any');
  const [step, setStep] = useState<Step>('search');
  const [selected, setSelected] = useState<Stay | null>(null);
  const [guest, setGuest] = useState({ name: '', email: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reference, setReference] = useState('');

  const fromDate = parseInputValue(from);
  const toDate = parseInputValue(to);

  const dateError = useMemo(() => {
    if (!fromDate || !toDate) return 'Choose both a check-in and a check-out date.';
    if (fromDate < today) return 'Check-in cannot be in the past.';
    if (nightsBetween(fromDate, toDate) < 1) return 'Check-out must be after check-in.';
    return null;
  }, [fromDate, toDate, today]);

  const nights = fromDate && toDate && !dateError ? nightsBetween(fromDate, toDate) : 0;

  /** Availability is decided by real rules: capacity, minimum stay, blocked days. */
  const available = useMemo(() => {
    if (dateError || !fromDate) return [];
    const checkInWeekday = fromDate.getDay();
    return STAYS.filter((stay) => {
      if (stay.sleeps < guests) return false;
      if (kind !== 'Any' && stay.kind !== kind) return false;
      if (stay.minNights > nights) return false;
      if (stay.blockedWeekdays.includes(checkInWeekday)) return false;
      return true;
    });
  }, [dateError, fromDate, guests, kind, nights]);

  const quote = useMemo(() => {
    if (!selected || nights <= 0) return null;
    const accommodation = selected.nightly * nights;
    const serviceFee = Math.round(accommodation * SERVICE_FEE_RATE);
    const taxable = accommodation + selected.cleaning + serviceFee;
    const tax = Math.round(taxable * TAX_RATE);
    return {
      accommodation,
      cleaning: selected.cleaning,
      serviceFee,
      tax,
      total: accommodation + selected.cleaning + serviceFee + tax,
      perNight: Math.round((accommodation + selected.cleaning + serviceFee + tax) / nights),
    };
  }, [selected, nights]);

  function validateGuest() {
    const next: Record<string, string> = {};
    if (!guest.name.trim()) next.name = 'Please add the lead guest name.';
    if (!guest.email.trim()) next.email = 'Please add an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim())) next.email = 'That email address does not look right.';
    return next;
  }

  function confirm() {
    const found = validateGuest();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // A local reference so the confirmation is concrete without implying a booking
    // was created on any server.
    setReference(`WF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
    setStep('done');
  }

  function restart() {
    setStep('search');
    setSelected(null);
    setGuest({ name: '', email: '', notes: '' });
    setErrors({});
    setReference('');
  }

  return (
    <div className="wf-root">
      <style>{CSS}</style>

      <a href="#wf-main" className="wf-skip">
        Skip to booking
      </a>

      <header className="wf-header">
        <div className="wf-shell wf-header-inner">
          <span className="wf-brand">
            <span className="wf-brand-mark" aria-hidden>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M12 3l2.6 5.7 6.4.7-4.7 4.3 1.3 6.3L12 17l-5.6 3 1.3-6.3L3 9.4l6.4-.7L12 3Z" fill="currentColor" />
              </svg>
            </span>
            {BRAND.name}
          </span>
          <nav className="wf-steps" aria-label="Booking progress">
            {(['search', 'details', 'confirm'] as const).map((id, index) => {
              const order: Step[] = ['search', 'details', 'confirm', 'done'];
              const currentIndex = order.indexOf(step);
              const state = currentIndex > index ? 'done' : currentIndex === index ? 'current' : 'todo';
              return (
                <span key={id} className={`wf-step wf-step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="wf-step-dot">{state === 'done' ? '✓' : index + 1}</span>
                  {id === 'search' ? 'Search' : id === 'details' ? 'Your details' : 'Confirm'}
                </span>
              );
            })}
          </nav>
        </div>
      </header>

      <p className="wf-sample-banner" role="note">
        Sample inventory for the Xroga AI Showcase. No payment is taken and no reservation is created.
      </p>

      <main id="wf-main" className="wf-main">
        {step === 'search' && (
          <div className="wf-shell">
            <section className="wf-hero">
              <h1 className="wf-h1">Find a place to stay</h1>
              <p className="wf-lede">
                Pick your dates and party size. Availability below reflects each property&rsquo;s real capacity, minimum
                stay, and check-in rules.
              </p>

              <div className="wf-searchbar">
                <div className="wf-field">
                  <label htmlFor={`${uid}-from`}>Check in</label>
                  <input id={`${uid}-from`} type="date" value={from} min={toInputValue(today)} onChange={(event) => setFrom(event.target.value)} />
                </div>
                <div className="wf-field">
                  <label htmlFor={`${uid}-to`}>Check out</label>
                  <input id={`${uid}-to`} type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
                </div>
                <div className="wf-field">
                  <label htmlFor={`${uid}-guests`}>Guests</label>
                  <select id={`${uid}-guests`} value={guests} onChange={(event) => setGuests(Number(event.target.value))}>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'guest' : 'guests'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="wf-field">
                  <label htmlFor={`${uid}-kind`}>Type</label>
                  <select id={`${uid}-kind`} value={kind} onChange={(event) => setKind(event.target.value)}>
                    {['Any', 'Studio', 'Suite', 'Cabin', 'Apartment'].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {dateError ? (
                <p className="wf-alert" role="alert">
                  {dateError}
                </p>
              ) : (
                <p className="wf-nights" role="status" aria-live="polite">
                  {nights} {nights === 1 ? 'night' : 'nights'} · {available.length} of {STAYS.length} properties available
                </p>
              )}
            </section>

            {!dateError && (
              <section aria-label="Available stays">
                {available.length === 0 ? (
                  <div className="wf-empty">
                    <h2 className="wf-h3">Nothing is available for those dates</h2>
                    <p className="wf-body">
                      Some properties have a minimum stay or do not accept check-in on that weekday. Try a longer stay or
                      a different start date.
                    </p>
                  </div>
                ) : (
                  <ul className="wf-grid">
                    {available.map((stay) => (
                      <li key={stay.id} className="wf-card">
                        <div className="wf-art">
                          <StayArt stay={stay} />
                          <span className="wf-art-kind">{stay.kind}</span>
                        </div>
                        <div className="wf-card-body">
                          <h2 className="wf-h3">{stay.name}</h2>
                          <p className="wf-place">{stay.place}</p>
                          <p className="wf-meta">
                            Sleeps {stay.sleeps} · {stay.bedrooms} {stay.bedrooms === 1 ? 'bedroom' : 'bedrooms'}
                            {stay.minNights > 1 ? ` · ${stay.minNights}-night minimum` : ''}
                          </p>
                          <ul className="wf-perks">
                            {stay.perks.map((perk) => (
                              <li key={perk}>{perk}</li>
                            ))}
                          </ul>
                          <div className="wf-card-foot">
                            <p className="wf-price">
                              <strong>{formatCurrency(stay.nightly)}</strong> / night
                            </p>
                            <button
                              type="button"
                              className="wf-btn wf-btn--primary wf-btn--sm"
                              onClick={() => {
                                setSelected(stay);
                                setStep('details');
                              }}
                            >
                              Select
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}

        {step !== 'search' && selected && quote && (
          <div className="wf-shell wf-checkout">
            <div className="wf-checkout-main">
              {step === 'details' && (
                <section aria-labelledby={`${uid}-details-h`}>
                  <button type="button" className="wf-back" onClick={() => setStep('search')}>
                    ← Back to results
                  </button>
                  <h1 id={`${uid}-details-h`} className="wf-h1">
                    Who is staying?
                  </h1>
                  <p className="wf-lede">We only need a name and an email for the sample confirmation.</p>

                  <div className="wf-form">
                    <div className="wf-field">
                      <label htmlFor={`${uid}-name`}>Lead guest name</label>
                      <input
                        id={`${uid}-name`}
                        value={guest.name}
                        autoComplete="name"
                        aria-invalid={Boolean(errors.name)}
                        aria-describedby={errors.name ? `${uid}-name-e` : undefined}
                        onChange={(event) => setGuest((prev) => ({ ...prev, name: event.target.value }))}
                      />
                      {errors.name && (
                        <p id={`${uid}-name-e`} className="wf-error">
                          {errors.name}
                        </p>
                      )}
                    </div>
                    <div className="wf-field">
                      <label htmlFor={`${uid}-email`}>Email</label>
                      <input
                        id={`${uid}-email`}
                        type="email"
                        value={guest.email}
                        autoComplete="email"
                        aria-invalid={Boolean(errors.email)}
                        aria-describedby={errors.email ? `${uid}-email-e` : undefined}
                        onChange={(event) => setGuest((prev) => ({ ...prev, email: event.target.value }))}
                      />
                      {errors.email && (
                        <p id={`${uid}-email-e`} className="wf-error">
                          {errors.email}
                        </p>
                      )}
                    </div>
                    <div className="wf-field">
                      <label htmlFor={`${uid}-notes`}>Anything we should know? (optional)</label>
                      <textarea
                        id={`${uid}-notes`}
                        rows={3}
                        value={guest.notes}
                        onChange={(event) => setGuest((prev) => ({ ...prev, notes: event.target.value }))}
                      />
                    </div>
                    <button
                      type="button"
                      className="wf-btn wf-btn--primary wf-btn--block"
                      onClick={() => {
                        const found = validateGuest();
                        setErrors(found);
                        if (Object.keys(found).length === 0) setStep('confirm');
                      }}
                    >
                      Review reservation
                    </button>
                  </div>
                </section>
              )}

              {step === 'confirm' && (
                <section aria-labelledby={`${uid}-confirm-h`}>
                  <button type="button" className="wf-back" onClick={() => setStep('details')}>
                    ← Edit details
                  </button>
                  <h1 id={`${uid}-confirm-h`} className="wf-h1">
                    Review and confirm
                  </h1>
                  <dl className="wf-review">
                    <div>
                      <dt>Property</dt>
                      <dd>
                        {selected.name}, {selected.place}
                      </dd>
                    </div>
                    <div>
                      <dt>Dates</dt>
                      <dd>
                        {from} → {to} ({nights} {nights === 1 ? 'night' : 'nights'})
                      </dd>
                    </div>
                    <div>
                      <dt>Guests</dt>
                      <dd>{guests}</dd>
                    </div>
                    <div>
                      <dt>Lead guest</dt>
                      <dd>
                        {guest.name} · {guest.email}
                      </dd>
                    </div>
                    {guest.notes.trim() && (
                      <div>
                        <dt>Notes</dt>
                        <dd>{guest.notes}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="wf-nopay" role="note">
                    <strong>No payment is collected.</strong> This template demonstrates the reservation flow only. There
                    is no card form, nothing is charged, and no booking is created anywhere.
                  </div>

                  <button type="button" className="wf-btn wf-btn--primary wf-btn--block" onClick={confirm}>
                    Confirm sample reservation
                  </button>
                </section>
              )}

              {step === 'done' && (
                <section aria-labelledby={`${uid}-done-h`} className="wf-done">
                  <span className="wf-done-tick" aria-hidden>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <h1 id={`${uid}-done-h`} className="wf-h1">
                    Sample reservation recorded
                  </h1>
                  <p className="wf-lede">
                    Reference <code>{reference}</code> exists only in this browser tab. Nothing was charged and no
                    property was actually reserved.
                  </p>
                  <div className="wf-done-actions">
                    <button type="button" className="wf-btn wf-btn--primary" onClick={restart}>
                      Start another search
                    </button>
                  </div>
                </section>
              )}
            </div>

            {/* --------------------------------------------- price breakdown */}
            <aside className="wf-summary" aria-label="Price breakdown">
              <div className="wf-summary-art">
                <StayArt stay={selected} />
              </div>
              <div className="wf-summary-body">
                <h2 className="wf-h3">{selected.name}</h2>
                <p className="wf-place">{selected.place}</p>
                <p className="wf-meta">
                  {from} → {to} · {guests} {guests === 1 ? 'guest' : 'guests'}
                </p>

                <dl className="wf-lines">
                  <div>
                    <dt>
                      {formatCurrency(selected.nightly)} × {nights} {nights === 1 ? 'night' : 'nights'}
                    </dt>
                    <dd>{formatCurrency(quote.accommodation)}</dd>
                  </div>
                  <div>
                    <dt>Cleaning fee</dt>
                    <dd>{formatCurrency(quote.cleaning)}</dd>
                  </div>
                  <div>
                    <dt>Service fee ({Math.round(SERVICE_FEE_RATE * 100)}%)</dt>
                    <dd>{formatCurrency(quote.serviceFee)}</dd>
                  </div>
                  <div>
                    <dt>Tax ({(TAX_RATE * 100).toFixed(1)}%)</dt>
                    <dd>{formatCurrency(quote.tax)}</dd>
                  </div>
                </dl>

                <div className="wf-total">
                  <span>Total</span>
                  <strong>{formatCurrency(quote.total)}</strong>
                </div>
                <p className="wf-per-night">{formatCurrency(quote.perNight)} per night, all in</p>
              </div>
            </aside>
          </div>
        )}
      </main>

      <footer className="wf-footer">
        <div className="wf-shell">
          <p>{BRAND.name} — sample booking platform for the Xroga AI Showcase. Prices are illustrative.</p>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
${productReset('.wf-root')}
.wf-root {
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
.wf-root *, .wf-root *::before, .wf-root *::after { box-sizing: border-box; }
.wf-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.wf-skip { position: absolute; left: -9999px; top: 8px; z-index: 60; background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 8px; }
.wf-skip:focus { left: 16px; }
.wf-shell { width: 100%; max-width: 1160px; margin: 0 auto; padding: 0 20px; }

.wf-header { position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,0.92); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
.wf-header-inner { display: flex; align-items: center; gap: 18px; min-height: 62px; flex-wrap: wrap; padding: 8px 0; }
.wf-brand { display: inline-flex; align-items: center; gap: 9px; font-weight: 700; font-size: 15px; letter-spacing: -0.01em; }
.wf-brand-mark { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 9px; background: var(--accent); color: #fff; }
.wf-steps { display: flex; flex-wrap: wrap; gap: 14px; margin-left: auto; }
.wf-step { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--muted); }
.wf-step-dot { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--subtle); border: 1px solid var(--border); font-size: 11px; }
.wf-step--current { color: var(--ink); }
.wf-step--current .wf-step-dot { background: var(--accent); border-color: var(--accent); color: #fff; }
.wf-step--done .wf-step-dot { background: var(--accent-soft); border-color: var(--accent-soft); color: var(--accent-deep); }

.wf-sample-banner { margin: 0; padding: 9px 20px; text-align: center; font-size: 12.5px; background: #fff8e6; border-bottom: 1px solid #f2e2b8; color: #7a5b12; }

.wf-main { padding: 30px 0 0; }
.wf-h1 { margin: 12px 0 0; font-size: clamp(26px, 3.4vw, 38px); font-weight: 780; letter-spacing: -0.032em; line-height: 1.1; }
.wf-h3 { margin: 0; font-size: 15.5px; font-weight: 680; }
.wf-lede { margin: 12px 0 0; max-width: 58ch; font-size: 15px; line-height: 1.62; color: var(--muted); }
.wf-body { margin: 10px 0 0; font-size: 14px; line-height: 1.6; color: var(--muted); }
.wf-hero { margin-bottom: 30px; }

.wf-searchbar {
  display: grid; gap: 12px; margin-top: 22px; padding: 16px;
  border: 1px solid var(--border); border-radius: 16px; background: var(--subtle);
  box-shadow: 0 22px 44px -34px rgba(27,21,36,0.4);
}
.wf-field { display: grid; gap: 6px; }
.wf-field label { font-size: 12px; font-weight: 650; color: var(--muted); }
.wf-field input, .wf-field select, .wf-field textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 9px;
  background: var(--paper); color: var(--ink); font-size: 14px; font-family: inherit; resize: vertical;
}
.wf-field [aria-invalid="true"] { border-color: #dc2626; }
.wf-error { margin: 0; font-size: 12px; color: #b91c1c; }
.wf-alert { margin: 14px 0 0; padding: 10px 13px; border-radius: 9px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 13px; }
.wf-nights { margin: 14px 0 0; font-size: 13.5px; font-weight: 600; color: var(--accent-deep); }

.wf-grid { display: grid; gap: 18px; margin: 0 0 40px; padding: 0; list-style: none; }
.wf-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 15px; background: var(--paper); transition: transform 200ms ease, box-shadow 200ms ease; }
.wf-card:hover { transform: translateY(-3px); box-shadow: 0 26px 44px -30px rgba(27,21,36,0.4); }
.wf-art { position: relative; height: 164px; border-bottom: 1px solid var(--border); }
.wf-art-svg { display: block; width: 100%; height: 100%; }
.wf-art-kind { position: absolute; left: 11px; top: 11px; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,0.93); font-size: 10.5px; font-weight: 750; text-transform: uppercase; letter-spacing: 0.06em; }
.wf-card-body { display: grid; gap: 5px; padding: 15px 16px 16px; flex: 1; }
.wf-place { margin: 0; font-size: 13px; color: var(--muted); }
.wf-meta { margin: 2px 0 0; font-size: 12.5px; color: var(--muted); }
.wf-perks { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
.wf-perks li { padding: 4px 10px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-deep); font-size: 11.5px; font-weight: 600; }
.wf-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 14px; }
.wf-price { margin: 0; font-size: 13px; color: var(--muted); }
.wf-price strong { font-size: 17px; font-weight: 780; color: var(--ink); letter-spacing: -0.02em; }
.wf-empty { margin-bottom: 40px; padding: 40px 24px; text-align: center; border: 1px dashed var(--border); border-radius: 14px; background: var(--subtle); }

.wf-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  padding: 11px 20px; border-radius: 999px; border: 1px solid transparent;
  font-size: 13.5px; font-weight: 650; cursor: pointer; font-family: inherit; text-decoration: none;
  transition: background 160ms ease, transform 160ms ease;
}
.wf-btn--sm { padding: 8px 15px; font-size: 12.5px; }
.wf-btn--block { width: 100%; }
.wf-btn--primary { background: var(--accent); color: #fff; }
.wf-btn--primary:hover { background: var(--accent-deep); }
.wf-back { margin-bottom: 4px; padding: 0; border: 0; background: none; font-size: 13px; font-weight: 600; color: var(--accent-deep); cursor: pointer; font-family: inherit; }

.wf-checkout { display: grid; gap: 26px; padding-bottom: 44px; }
.wf-form { display: grid; gap: 16px; margin-top: 22px; max-width: 460px; }
.wf-review { display: grid; gap: 12px; margin: 22px 0; padding: 18px 20px; border: 1px solid var(--border); border-radius: 13px; background: var(--subtle); }
.wf-review > div { display: grid; gap: 2px; }
.wf-review dt { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
.wf-review dd { margin: 0; font-size: 14px; font-weight: 600; }
.wf-nopay { margin: 0 0 20px; padding: 14px 16px; border-radius: 11px; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 13px; line-height: 1.6; }
.wf-done { text-align: center; padding: 24px 0 8px; }
.wf-done-tick { display: inline-grid; place-items: center; width: 54px; height: 54px; border-radius: 50%; background: #ecfdf5; color: #059669; }
.wf-done .wf-lede { margin-inline: auto; }
.wf-done code { padding: 2px 7px; border-radius: 6px; background: var(--subtle); font-size: 14px; font-weight: 700; }
.wf-done-actions { margin-top: 22px; }

.wf-summary { align-self: start; overflow: hidden; border: 1px solid var(--border); border-radius: 16px; background: var(--paper); box-shadow: 0 24px 48px -36px rgba(27,21,36,0.42); }
.wf-summary-art { height: 132px; border-bottom: 1px solid var(--border); }
.wf-summary-body { padding: 17px 18px 20px; }
.wf-lines { display: grid; gap: 9px; margin: 18px 0; padding: 18px 0 0; border-top: 1px solid var(--border); }
.wf-lines > div { display: flex; justify-content: space-between; gap: 12px; font-size: 13.5px; }
.wf-lines dt { color: var(--muted); }
.wf-lines dd { margin: 0; font-weight: 620; }
.wf-total { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding-top: 15px; border-top: 1px solid var(--border); font-size: 14px; font-weight: 650; }
.wf-total strong { font-size: 23px; font-weight: 800; letter-spacing: -0.028em; }
.wf-per-night { margin: 6px 0 0; font-size: 12px; color: var(--muted); }

.wf-footer { padding: 26px 0; border-top: 1px solid var(--border); }
.wf-footer p { margin: 0; font-size: 12.5px; color: var(--muted); }

@media (min-width: 620px) {
  .wf-searchbar { grid-template-columns: repeat(4, 1fr); align-items: end; }
  .wf-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 960px) {
  .wf-grid { grid-template-columns: repeat(3, 1fr); }
  .wf-checkout { grid-template-columns: 1fr 340px; gap: 40px; }
}
@media (prefers-reduced-motion: reduce) {
  .wf-root *, .wf-root *::before, .wf-root *::after { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
  .wf-card:hover { transform: none; }
}
`;
