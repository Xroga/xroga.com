'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BedDouble, Check, Heart, MapPin, Search, Sparkles, Star, Users, X } from 'lucide-react';

type StayKind = 'villa' | 'apartment' | 'design' | 'beach';
type BookingStep = 'search' | 'details' | 'confirm' | 'done';

interface Stay {
  id: string;
  name: string;
  place: string;
  kind: StayKind;
  tag: string;
  nightly: number;
  cleaning: number;
  rating: string;
  guests: number;
  bedrooms: number;
  minNights: number;
  image: string;
  position?: string;
  featured?: boolean;
  perks: readonly string[];
}

const STAYS: readonly Stay[] = [
  { id: 'aster', name: 'Aster House', place: 'Oia, Santorini', kind: 'villa', tag: 'Editor’s pick', nightly: 284, cleaning: 55, rating: '4.98', guests: 2, bedrooms: 1, minNights: 2, image: '/showcase/booking-2026/aster-house.jpg', position: 'center 58%', featured: true, perks: ['Sea view', 'Private pool', 'Breakfast'] },
  { id: 'nook', name: 'The Nook', place: 'Kyoto, Japan', kind: 'design', tag: 'Design-led', nightly: 173, cleaning: 38, rating: '4.95', guests: 2, bedrooms: 1, minNights: 1, image: '/showcase/booking-2026/the-nook.jpg', perks: ['Courtyard', 'Tea room', 'Walkable'] },
  { id: 'bruma', name: 'Casa Bruma', place: 'Tulum, Mexico', kind: 'beach', tag: 'Guest favorite', nightly: 219, cleaning: 48, rating: '4.91', guests: 4, bedrooms: 2, minNights: 2, image: '/showcase/booking-2026/casa-bruma.jpg', perks: ['Plunge pool', 'Beach nearby', 'Quiet zone'] },
  { id: 'palm', name: 'Palm Residence', place: 'Dubai, UAE', kind: 'apartment', tag: 'New', nightly: 246, cleaning: 45, rating: '4.97', guests: 3, bedrooms: 2, minNights: 1, image: '/showcase/booking-2026/palm-residence.jpg', perks: ['Skyline view', 'Gym', 'Concierge'] },
  { id: 'marea', name: 'Marea Villa', place: 'Ibiza, Spain', kind: 'villa', tag: 'Only 2 left', nightly: 394, cleaning: 75, rating: '4.93', guests: 6, bedrooms: 3, minNights: 3, image: '/showcase/booking-2026/marea-villa.jpg', position: 'center 55%', featured: true, perks: ['Infinity pool', 'Six guests', 'Sunset deck'] },
  { id: 'atelier', name: 'Atelier 08', place: 'Copenhagen, Denmark', kind: 'design', tag: 'Curated', nightly: 198, cleaning: 42, rating: '4.96', guests: 2, bedrooms: 1, minNights: 1, image: '/showcase/booking-2026/atelier-08.jpg', perks: ['Central', 'Design library', 'Bikes'] },
];

const DAY = 86_400_000;
const FAVOURITES_KEY = 'xroga_showcase_wayfare_favourites_v2';

function startOfToday() {
  const value = new Date();
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function inputDate(value: Date) {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

function dateFromInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function BookingPlatform() {
  const today = useMemo(startOfToday, []);
  const [from, setFrom] = useState(() => inputDate(new Date(today.getTime() + 14 * DAY)));
  const [to, setTo] = useState(() => inputDate(new Date(today.getTime() + 17 * DAY)));
  const [guests, setGuests] = useState(2);
  const [destination, setDestination] = useState('Dubai');
  const [filter, setFilter] = useState<'all' | StayKind>('all');
  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Stay | null>(null);
  const [step, setStep] = useState<BookingStep>('search');
  const [guest, setGuest] = useState({ name: '', email: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reference, setReference] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVOURITES_KEY);
      setFavourites(new Set(stored ? (JSON.parse(stored) as string[]) : []));
    } catch {
      setFavourites(new Set());
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBooking();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [selected]);

  const fromDate = dateFromInput(from);
  const toDate = dateFromInput(to);
  const nights = fromDate && toDate ? Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / DAY)) : 0;
  const dateError = !fromDate || !toDate || nights < 1 ? 'Check-out must be after check-in.' : fromDate < today ? 'Check-in cannot be in the past.' : null;

  const available = useMemo(
    () => STAYS.filter((stay) => !dateError && stay.guests >= guests && stay.minNights <= nights && (filter === 'all' || stay.kind === filter)),
    [dateError, filter, guests, nights],
  );

  const quote = useMemo(() => {
    if (!selected || nights < 1) return null;
    const accommodation = selected.nightly * nights;
    const service = Math.round(accommodation * 0.08);
    return { accommodation, service, total: accommodation + selected.cleaning + service };
  }, [nights, selected]);

  function toggleFavourite(id: string) {
    setFavourites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify([...next]));
      setToast(next.has(id) ? 'Saved to favorites' : 'Removed from favorites');
      return next;
    });
  }

  function openBooking(stay: Stay) {
    setSelected(stay);
    setStep('details');
    setErrors({});
  }

  function closeBooking() {
    setSelected(null);
    setStep('search');
    setErrors({});
  }

  function review() {
    const next: Record<string, string> = {};
    if (!guest.name.trim()) next.name = 'Add the lead guest name.';
    if (!guest.email.trim()) next.email = 'Add an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim())) next.email = 'Enter a valid email address.';
    setErrors(next);
    if (Object.keys(next).length === 0) setStep('confirm');
  }

  function confirm() {
    setReference(`WF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
    setStep('done');
  }

  return (
    <div className="wf-root">
      <style>{CSS}</style>
      <a className="wf-skip" href="#wf-stays">Skip to stays</a>

      <header className="wf-nav-wrap">
        <nav className="wf-nav" aria-label="Wayfare navigation">
          <a className="wf-brand" href="#wf-top"><span>W</span>Wayfare<small>STAYS</small></a>
          <div className="wf-links"><a href="#wf-stays">Stays</a><a href="#wf-smart">Smart Match</a><a href="#wf-how">How it works</a></div>
          <div className="wf-nav-actions">
            <button type="button" className="wf-saved" onClick={() => setToast(`${favourites.size} saved stay${favourites.size === 1 ? '' : 's'}`)}>
              <Heart aria-hidden="true" /> Saved {favourites.size > 0 ? <b>{favourites.size}</b> : null}
            </button>
            <button type="button" className="wf-nav-cta" onClick={() => document.getElementById('wf-stays')?.scrollIntoView({ behavior: 'smooth' })}>Find a stay</button>
          </div>
        </nav>
      </header>

      <main id="wf-top">
        <section className="wf-hero">
          <div className="wf-shell wf-hero-grid">
            <div className="wf-hero-copy">
              <span className="wf-eyebrow"><i /> Thoughtful stays, beautifully booked</span>
              <h1>Go somewhere <em>less ordinary.</em> <mark>Stay better.</mark></h1>
              <p>Wayfare narrows the noise into a curated collection of places that feel as considered as the trip itself.</p>
              <div className="wf-proof"><span>4.92</span><div><b>Average guest rating</b><small>Across 18 sample destinations</small></div><div className="wf-avatars" aria-hidden="true"><i /><i /><i /></div></div>
            </div>
            <div className="wf-hero-media">
              <Image src="/showcase/booking-2026/wayfare-hero.jpg" alt="Infinity pool overlooking white coastal buildings" fill priority sizes="(min-width: 900px) 48vw, 100vw" />
              <div className="wf-hero-badge"><i /> Editor’s pick · Santorini</div>
              <button type="button" className={`wf-hero-heart ${favourites.has('aster') ? 'on' : ''}`} onClick={() => toggleFavourite('aster')} aria-label="Save Aster House"><Heart aria-hidden="true" /></button>
              <div className="wf-hero-card"><div><b>Aster House, Oia</b><span>2 guests · 1 suite · Sea view · ★ 4.98</span></div><strong>$284<small>/ night</small></strong></div>
            </div>
          </div>

          <form className="wf-search wf-shell" onSubmit={(event) => { event.preventDefault(); document.getElementById('wf-stays')?.scrollIntoView({ behavior: 'smooth' }); setToast(`Showing curated stays for ${destination || 'your trip'}`); }}>
            <label>Destination<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Where do you want to go?" /></label>
            <label>Check in<input type="date" value={from} min={inputDate(today)} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>Check out<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} /></label>
            <label>Guests<select value={guests} onChange={(event) => setGuests(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value} {value === 1 ? 'guest' : 'guests'}</option>)}</select></label>
            <button type="submit" aria-label="Search stays"><Search aria-hidden="true" /></button>
          </form>
        </section>

        <div className="wf-marquee" aria-hidden="true"><div>Transparent pricing ✦ Verified properties ✦ Instant confirmation ✦ Flexible stays ✦ Human support ✦ Transparent pricing ✦ Verified properties ✦ Instant confirmation</div></div>

        <section id="wf-stays" className="wf-section wf-shell">
          <div className="wf-section-head"><div><span>Handpicked this week</span><h2>Stays worth<br />leaving home for.</h2></div><p>Not thousands of listings. Just a tighter collection of spaces we would actually want to book ourselves.</p></div>
          <div className="wf-filter-row" role="group" aria-label="Filter stays">
            {([['all', 'All stays'], ['villa', 'Villas'], ['apartment', 'Apartments'], ['design', 'Design-led'], ['beach', 'Beach']] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
          </div>
          <p className="wf-nights" role="status">{dateError ?? `${nights} night${nights === 1 ? '' : 's'} · ${available.length} curated stay${available.length === 1 ? '' : 's'} available`}</p>
          <div className="wf-grid">
            {available.map((stay) => <StayCard key={stay.id} stay={stay} saved={favourites.has(stay.id)} onSave={() => toggleFavourite(stay.id)} onSelect={() => openBooking(stay)} />)}
          </div>
          {available.length === 0 ? <div className="wf-empty"><Sparkles aria-hidden="true" /><h3>No exact match yet.</h3><p>Try fewer guests, different dates, or another collection.</p></div> : null}
        </section>

        <section id="wf-smart" className="wf-section wf-shell"><div className="wf-smart"><div><span>Smart Match</span><h2>Less scrolling.<br />Better matches.</h2><p>Tell us the mood, budget, trip type, and what matters. Wayfare turns the noise into a short list that feels made for the trip.</p><div className="wf-smart-chips"><i>Quiet weekend</i><i>Under $300/night</i><i>Design-led</i><i>Walkable area</i><i>Pool</i></div></div><div className="wf-match"><div className="wf-match-media"><Image src="/showcase/booking-2026/casa-bruma.jpg" alt="Casa Bruma private villa" fill sizes="(min-width: 900px) 36vw, 100vw" /><b>96% MATCH</b></div><span>Your top match</span><h3>Casa Bruma · Tulum</h3><div><i>Private plunge pool</i><i>6 min to beach</i><i>Quiet zone</i></div><footer><strong>$219 <small>/ night</small></strong><button type="button" onClick={() => openBooking(STAYS[2]!)}>View & book</button></footer></div></div></section>

        <section id="wf-how" className="wf-section wf-shell"><div className="wf-section-head"><div><span>Designed around your time</span><h2>Booking, minus<br />the friction.</h2></div><p>Every interaction is intentionally short: discover, compare, understand the price, confirm.</p></div><div className="wf-steps">{[['01 / DISCOVER', 'Find your kind of place.', 'Search by destination, dates, vibe, budget, and details that shape the trip.'], ['02 / COMPARE', 'Know what you’re paying.', 'Clear nightly rates and a live cost breakdown before you commit.'], ['03 / CONFIRM', 'Book in a few taps.', 'Dates, guests, and totals stay visible through the demo confirmation.']].map(([number, title, body]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p><i><Check aria-hidden="true" /></i></article>)}</div></section>

        <section className="wf-shell wf-cta"><h2>Your next place should feel like part of the trip.</h2><button type="button" onClick={() => document.getElementById('wf-stays')?.scrollIntoView({ behavior: 'smooth' })}>Explore the collection <ArrowUpRight aria-hidden="true" /></button></section>
      </main>

      <footer className="wf-footer"><div className="wf-shell"><div><h3>Wayfare</h3><p>Thoughtful stays, beautifully booked.</p></div><nav><a href="#wf-stays">Stays</a><a href="#wf-smart">Smart Match</a><a href="#wf-how">How it works</a></nav><p>© 2026 Wayfare · Sample Xroga showcase inventory. No real reservations or payments.</p></div></footer>

      {selected && quote ? <BookingPanel stay={selected} step={step} from={from} to={to} guests={guests} quote={quote} guest={guest} errors={errors} reference={reference} setGuest={setGuest} onClose={closeBooking} onReview={review} onConfirm={confirm} onBack={() => setStep('details')} /> : null}
      <div className={`wf-toast ${toast ? 'show' : ''}`} role="status">{toast}</div>
    </div>
  );
}

function StayCard({ stay, saved, onSave, onSelect }: { stay: Stay; saved: boolean; onSave: () => void; onSelect: () => void }) {
  return <article className={`wf-card ${stay.featured ? 'featured' : ''}`}><div className="wf-card-media"><Image src={stay.image} alt={`${stay.name} in ${stay.place}`} fill sizes="(min-width: 1100px) 34vw, (min-width: 640px) 50vw, 100vw" style={{ objectPosition: stay.position ?? 'center' }} /><span>{stay.tag}</span><button type="button" className={saved ? 'on' : ''} onClick={onSave} aria-label={`${saved ? 'Remove' : 'Save'} ${stay.name}`}><Heart aria-hidden="true" /></button></div><div className="wf-card-body"><div><div><h3>{stay.name}</h3><p><MapPin aria-hidden="true" /> {stay.place}</p></div><b><Star aria-hidden="true" /> {stay.rating}</b></div><div className="wf-perks"><span><Users aria-hidden="true" /> {stay.guests}</span><span><BedDouble aria-hidden="true" /> {stay.bedrooms}</span><span>{stay.perks[0]}</span></div><footer><strong>{money(stay.nightly)} <small>/ night</small></strong><button type="button" onClick={onSelect}>Select</button></footer></div></article>;
}

function BookingPanel({ stay, step, from, to, guests, quote, guest, errors, reference, setGuest, onClose, onReview, onConfirm, onBack }: { stay: Stay; step: BookingStep; from: string; to: string; guests: number; quote: { accommodation: number; service: number; total: number }; guest: { name: string; email: string; notes: string }; errors: Record<string, string>; reference: string; setGuest: React.Dispatch<React.SetStateAction<{ name: string; email: string; notes: string }>>; onClose: () => void; onReview: () => void; onConfirm: () => void; onBack: () => void }) {
  return <div className="wf-booking-bg" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="wf-booking" role="dialog" aria-modal="true" aria-label={`Reserve ${stay.name}`}><header><div><span>Reserve your stay</span><h2>{stay.name}</h2><p>{stay.place} · ★ {stay.rating}</p></div><button type="button" onClick={onClose} aria-label="Close booking"><X aria-hidden="true" /></button></header><div className="wf-book-media"><Image src={stay.image} alt="" fill sizes="460px" style={{ objectPosition: stay.position ?? 'center' }} /></div>{step === 'done' ? <div className="wf-done"><i><Check aria-hidden="true" /></i><h2>Sample reservation recorded</h2><p>Reference <code>{reference}</code>. Nothing was charged and no real reservation was created.</p><button type="button" onClick={onClose}>Done</button></div> : <>{step === 'details' ? <div className="wf-book-form"><label>Lead guest name<input value={guest.name} onChange={(event) => setGuest((value) => ({ ...value, name: event.target.value }))} aria-invalid={Boolean(errors.name)} />{errors.name ? <small>{errors.name}</small> : null}</label><label>Email<input type="email" value={guest.email} onChange={(event) => setGuest((value) => ({ ...value, email: event.target.value }))} aria-invalid={Boolean(errors.email)} />{errors.email ? <small>{errors.email}</small> : null}</label><label>Trip note<textarea rows={3} value={guest.notes} onChange={(event) => setGuest((value) => ({ ...value, notes: event.target.value }))} placeholder="Arrival time or anything useful" /></label></div> : <div className="wf-review-note"><Sparkles aria-hidden="true" /><div><b>Review this sample reservation</b><p>No payment is collected. Confirming only demonstrates the completed interface.</p></div></div>}<dl className="wf-book-dates"><div><dt>Check in</dt><dd>{from}</dd></div><div><dt>Check out</dt><dd>{to}</dd></div><div><dt>Guests</dt><dd>{guests}</dd></div></dl><dl className="wf-lines"><div><dt>{money(stay.nightly)} × stay</dt><dd>{money(quote.accommodation)}</dd></div><div><dt>Cleaning fee</dt><dd>{money(stay.cleaning)}</dd></div><div><dt>Wayfare service</dt><dd>{money(quote.service)}</dd></div></dl><div className="wf-total"><span>Total</span><strong>{money(quote.total)}</strong></div><div className="wf-book-actions">{step === 'confirm' ? <button type="button" className="wf-secondary" onClick={onBack}>Edit details</button> : <button type="button" className="wf-secondary" onClick={onClose}>Back to results</button>}<button type="button" className="wf-primary" onClick={step === 'confirm' ? onConfirm : onReview}>{step === 'confirm' ? 'Confirm sample reservation' : 'Review reservation'}</button></div></>}</aside></div>;
}

const CSS = `
.wf-root{--bg:#f5f3ee;--paper:#fff;--ink:#11110f;--muted:#74736d;--line:rgba(17,17,15,.11);--acid:#d9ff55;--orange:#ff6b3d;--blue:#7b8cff;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif;min-height:100vh;overflow:hidden}.wf-root *{box-sizing:border-box}.wf-root button,.wf-root input,.wf-root select,.wf-root textarea{font:inherit}.wf-root button{cursor:pointer}.wf-root a{color:inherit;text-decoration:none}.wf-shell{width:min(1320px,calc(100% - 36px));margin:auto}.wf-skip{position:fixed;left:16px;top:-80px;z-index:100;background:#111;color:#fff;padding:10px 14px;border-radius:10px}.wf-skip:focus{top:12px}.wf-nav-wrap{position:absolute;inset:18px 0 auto;z-index:30}.wf-nav{width:min(1320px,calc(100% - 36px));height:66px;margin:auto;padding:0 12px 0 20px;border:1px solid rgba(255,255,255,.13);border-radius:21px;background:rgba(20,20,18,.94);box-shadow:0 14px 50px rgba(0,0,0,.17);backdrop-filter:blur(20px);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:22px}.wf-brand{display:flex;align-items:center;gap:9px;font-size:17px;font-weight:850;letter-spacing:-.04em}.wf-brand>span{width:34px;height:34px;border-radius:11px;background:var(--acid);color:#111;display:grid;place-items:center}.wf-brand small{font-size:9px;letter-spacing:.1em;color:#8d8d87}.wf-links{display:flex;gap:25px;font-size:12px;color:#bcbcb6}.wf-links a:hover{color:#fff}.wf-nav-actions{display:flex;align-items:center;gap:8px}.wf-saved,.wf-nav-cta{height:42px;border:0;border-radius:13px;padding:0 15px;font-size:11px;font-weight:800}.wf-saved{background:#2a2a27;color:#fff;display:flex;align-items:center;gap:7px}.wf-saved svg{width:14px}.wf-saved b{min-width:17px;height:17px;border-radius:99px;background:var(--orange);display:grid;place-items:center;font-size:9px}.wf-nav-cta{background:var(--acid);color:#111}.wf-hero{position:relative;padding:124px 0 50px}.wf-hero:before{content:"";position:absolute;width:650px;height:650px;border-radius:50%;right:-250px;top:-160px;background:radial-gradient(circle,#dce4ff,#e9e5ff 35%,transparent 69%)}.wf-hero-grid{position:relative;display:grid;grid-template-columns:1.04fr .96fr;gap:28px}.wf-hero-copy{padding:55px 0 24px;position:relative;z-index:1}.wf-eyebrow{display:flex;align-items:center;gap:10px;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.12em}.wf-eyebrow i{width:9px;height:9px;border-radius:50%;background:var(--orange);box-shadow:0 0 0 5px rgba(255,107,61,.13)}.wf-hero h1{max-width:760px;margin:31px 0 26px;font-size:clamp(62px,7vw,108px);line-height:.89;letter-spacing:-.075em}.wf-hero h1 em{font-weight:inherit;color:transparent;-webkit-text-stroke:1.4px var(--ink)}.wf-hero h1 mark{position:relative;background:linear-gradient(transparent 72%,var(--acid) 72%);color:inherit}.wf-hero-copy>p{max-width:590px;color:#65645f;font-size:16px;line-height:1.7}.wf-proof{margin-top:30px;display:flex;align-items:center;gap:13px;width:max-content;max-width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.58)}.wf-proof>span{font-size:24px;font-weight:900}.wf-proof div{display:grid}.wf-proof b{font-size:11px}.wf-proof small{font-size:9px;color:var(--muted)}.wf-avatars{display:flex!important;margin-left:8px}.wf-avatars i{width:25px;height:25px;margin-left:-7px;border:2px solid #fff;border-radius:50%;background:linear-gradient(135deg,#ffab91,#7b8cff)}.wf-hero-media{position:relative;min-height:610px;border-radius:34px;overflow:hidden;box-shadow:0 30px 90px rgba(27,25,18,.16)}.wf-hero-media>img{object-fit:cover}.wf-hero-media:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 48%,rgba(8,8,7,.48))}.wf-hero-badge{position:absolute;left:22px;top:22px;z-index:2;padding:10px 13px;border-radius:99px;background:rgba(17,17,15,.84);color:#fff;font-size:10px;font-weight:850}.wf-hero-badge i{display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:var(--acid)}.wf-hero-heart{position:absolute;right:22px;top:22px;z-index:3;width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.88);display:grid;place-items:center}.wf-hero-heart svg{width:18px}.wf-hero-heart.on{background:#111;color:#fff}.wf-hero-heart.on svg{fill:currentColor}.wf-hero-card{position:absolute;z-index:2;left:22px;right:22px;bottom:22px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border:1px solid rgba(255,255,255,.65);border-radius:22px;background:rgba(255,255,255,.91);backdrop-filter:blur(20px)}.wf-hero-card>div{display:grid;gap:6px}.wf-hero-card b{font-size:17px}.wf-hero-card span{font-size:10px;color:var(--muted)}.wf-hero-card strong{font-size:21px;white-space:nowrap}.wf-hero-card small{display:block;color:var(--muted);font-size:9px;text-align:right}.wf-search{position:relative;z-index:5;margin-top:-10px;padding:9px;border:1px solid var(--line);border-radius:26px;background:rgba(255,255,255,.97);box-shadow:0 24px 70px rgba(42,39,29,.12);display:grid;grid-template-columns:1.25fr .9fr .9fr .72fr auto}.wf-search label{min-height:74px;padding:14px 18px;border-right:1px solid var(--line);display:grid;gap:7px;color:#9a9890;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.1em}.wf-search input,.wf-search select{width:100%;border:0;outline:0;background:transparent;color:#161614;font-size:13px;font-weight:750;text-transform:none;letter-spacing:0}.wf-search>button{width:74px;height:74px;border:0;border-radius:19px;background:#111;color:#fff;display:grid;place-items:center}.wf-search>button svg{width:20px}.wf-marquee{overflow:hidden;padding:24px 0;border-bottom:1px solid var(--line)}.wf-marquee div{width:max-content;font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.13em;color:#797870;animation:wf-slide 28s linear infinite}@keyframes wf-slide{to{transform:translateX(-45%)}}.wf-section{padding-top:92px}.wf-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;margin-bottom:30px}.wf-section-head span,.wf-smart>div>span{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.16em;color:#838179}.wf-section-head h2,.wf-smart h2{margin:11px 0 0;font-size:clamp(38px,4.2vw,65px);line-height:.98;letter-spacing:-.055em}.wf-section-head>p{max-width:420px;margin:0;color:#77756f;font-size:12px;line-height:1.65}.wf-filter-row{display:flex;gap:8px;flex-wrap:wrap}.wf-filter-row button{height:38px;padding:0 15px;border:1px solid var(--line);border-radius:99px;background:transparent;color:#6a6963;font-size:10px;font-weight:850}.wf-filter-row button:hover,.wf-filter-row button.active{background:#111;color:#fff}.wf-nights{margin:18px 0 20px;color:var(--muted);font-size:11px;font-weight:700}.wf-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px}.wf-card{grid-column:span 4;overflow:hidden;padding:8px;border:1px solid rgba(17,17,15,.08);border-radius:26px;background:#fff;transition:.3s}.wf-card.featured{grid-column:span 6}.wf-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(31,29,21,.12)}.wf-card-media{position:relative;height:285px;overflow:hidden;border-radius:20px}.wf-card.featured .wf-card-media{height:350px}.wf-card-media img{object-fit:cover}.wf-card-media>span{position:absolute;left:14px;top:14px;padding:8px 11px;border-radius:99px;background:rgba(255,255,255,.9);font-size:9px;font-weight:850}.wf-card-media>button{position:absolute;right:14px;top:14px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(255,255,255,.9);display:grid;place-items:center}.wf-card-media>button svg{width:17px}.wf-card-media>button.on{background:#111;color:#fff}.wf-card-media>button.on svg{fill:currentColor}.wf-card-body{padding:16px 12px 12px}.wf-card-body>div:first-child{display:flex;justify-content:space-between;gap:12px}.wf-card h3{margin:0;font-size:17px;letter-spacing:-.035em}.wf-card p{display:flex;align-items:center;gap:4px;margin:5px 0 0;color:var(--muted);font-size:10px}.wf-card p svg,.wf-card-body>div>b svg{width:11px;height:11px}.wf-card-body>div>b{display:flex;gap:3px;font-size:10px;white-space:nowrap}.wf-perks{display:flex!important;gap:11px!important;margin-top:14px;color:var(--muted);font-size:9px}.wf-perks span{display:flex;align-items:center;gap:4px}.wf-perks svg{width:11px}.wf-card footer{display:flex;align-items:center;justify-content:space-between;margin-top:15px;padding-top:13px;border-top:1px solid var(--line)}.wf-card footer strong{font-size:15px}.wf-card footer small{color:var(--muted);font-size:9px}.wf-card footer button,.wf-match footer button{padding:10px 13px;border:0;border-radius:11px;background:#111;color:#fff;font-size:9px;font-weight:850}.wf-empty{grid-column:1/-1;padding:70px;text-align:center;border:1px dashed var(--line);border-radius:28px}.wf-empty svg{width:24px}.wf-empty h3{margin:12px 0 4px}.wf-empty p{margin:0;color:var(--muted)}.wf-smart{padding:58px;border-radius:36px;background:#151513;color:#fff;display:grid;grid-template-columns:1fr 1fr;gap:55px;overflow:hidden;position:relative}.wf-smart:after{content:"";position:absolute;width:430px;height:430px;right:-130px;top:-170px;border-radius:50%;background:radial-gradient(circle,var(--blue),transparent 70%);opacity:.62}.wf-smart>div{position:relative;z-index:1}.wf-smart h2{font-size:clamp(40px,5vw,72px)}.wf-smart p{max-width:540px;color:#aaa9a2;font-size:13px;line-height:1.7}.wf-smart-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:25px}.wf-smart-chips i{padding:9px 11px;border:1px solid rgba(255,255,255,.09);border-radius:99px;background:#282824;color:#d0cec5;font-size:9px;font-style:normal}.wf-match{padding:13px;border-radius:29px;background:#f3f2ec;color:#111;transform:rotate(2deg);box-shadow:0 35px 90px rgba(0,0,0,.3)}.wf-match-media{position:relative;height:290px;overflow:hidden;border-radius:21px}.wf-match-media img{object-fit:cover}.wf-match-media b{position:absolute;right:14px;top:14px;padding:9px 11px;border-radius:99px;background:var(--acid);font-size:9px}.wf-match>span{display:block;margin:15px 9px 5px;color:#777;font-size:9px;text-transform:uppercase;font-weight:850}.wf-match h3{margin:0 9px;font-size:21px}.wf-match>div:not(.wf-match-media){display:flex;gap:6px;flex-wrap:wrap;margin:11px 9px}.wf-match>div i{padding:6px 8px;border-radius:99px;background:#e7e5df;color:#666;font-size:8px;font-style:normal}.wf-match footer{display:flex;align-items:center;justify-content:space-between;margin:15px 9px 7px;padding-top:13px;border-top:1px solid #ddd}.wf-match footer strong{font-size:19px}.wf-match footer small{font-size:9px;color:#777}.wf-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.wf-steps article{padding:23px 12px 9px 0;border-top:1px solid var(--line)}.wf-steps article>span{color:#999;font-size:9px;font-weight:900}.wf-steps h3{margin:52px 0 9px;font-size:19px}.wf-steps p{max-width:330px;color:#777;font-size:11px;line-height:1.6}.wf-steps i{width:46px;height:46px;border-radius:14px;background:#fff;display:grid;place-items:center;box-shadow:0 10px 30px rgba(0,0,0,.06)}.wf-steps svg{width:18px}.wf-cta{margin-top:92px;padding:65px 68px;border-radius:36px;background:var(--acid);display:flex;align-items:center;justify-content:space-between;gap:30px}.wf-cta h2{max-width:760px;margin:0;font-size:clamp(40px,5vw,70px);line-height:.96;letter-spacing:-.06em}.wf-cta button{height:56px;padding:0 18px;border:0;border-radius:16px;background:#111;color:#fff;font-size:10px;font-weight:850;display:flex;align-items:center;gap:8px}.wf-cta svg{width:16px}.wf-footer{margin-top:72px;padding:35px 0;border-top:1px solid var(--line)}.wf-footer>.wf-shell{display:grid;grid-template-columns:1fr auto;gap:12px 50px;align-items:center}.wf-footer h3{margin:0;font-size:25px}.wf-footer p{margin:5px 0 0;color:var(--muted);font-size:9px}.wf-footer nav{display:flex;gap:25px;color:var(--muted);font-size:10px}.wf-footer>.wf-shell>p{grid-column:1/-1;padding-top:20px;border-top:1px solid var(--line)}.wf-booking-bg{position:fixed;inset:0;z-index:100;background:rgba(8,8,7,.48);backdrop-filter:blur(7px);display:flex;justify-content:flex-end;padding:10px}.wf-booking{width:min(470px,100%);height:100%;overflow:auto;padding:20px;border-radius:30px;background:#f8f7f2;box-shadow:-30px 0 100px rgba(0,0,0,.2)}.wf-booking>header{display:flex;justify-content:space-between;gap:15px}.wf-booking header span{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.wf-booking header h2{margin:7px 0 3px;font-size:28px}.wf-booking header p{margin:0;color:var(--muted);font-size:10px}.wf-booking header button{width:40px;height:40px;border:0;border-radius:50%;background:#e9e7df;display:grid;place-items:center}.wf-booking header svg{width:17px}.wf-book-media{position:relative;height:205px;margin-top:18px;overflow:hidden;border-radius:22px}.wf-book-media img{object-fit:cover}.wf-book-form{display:grid;gap:11px;margin-top:18px}.wf-book-form label{display:grid;gap:6px;color:#777;font-size:9px;font-weight:850;text-transform:uppercase}.wf-book-form input,.wf-book-form textarea{width:100%;border:1px solid var(--line);border-radius:13px;background:#fff;padding:11px 12px;outline:none;color:#111;text-transform:none}.wf-book-form input:focus,.wf-book-form textarea:focus{border-color:#111}.wf-book-form input[aria-invalid=true]{border-color:#d84a3a}.wf-book-form small{color:#b42318;text-transform:none}.wf-book-dates{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:16px 0}.wf-book-dates>div{padding:11px;border:1px solid var(--line);border-radius:13px;background:#fff}.wf-book-dates dt{color:#999;font-size:8px;text-transform:uppercase}.wf-book-dates dd{margin:5px 0 0;font-size:10px;font-weight:750}.wf-lines{display:grid;gap:9px;margin:17px 0;padding-top:15px;border-top:1px solid var(--line)}.wf-lines>div{display:flex;justify-content:space-between;font-size:10px}.wf-lines dt{color:var(--muted)}.wf-lines dd{margin:0;font-weight:700}.wf-total{display:flex;align-items:center;justify-content:space-between;padding-top:14px;border-top:1px solid var(--line)}.wf-total span{font-size:12px;font-weight:800}.wf-total strong{font-size:23px}.wf-book-actions{display:flex;gap:8px;margin-top:17px}.wf-book-actions button,.wf-done button{height:49px;border:0;border-radius:14px;font-size:10px;font-weight:850}.wf-secondary{flex:1;background:#e9e7df;color:#111}.wf-primary{flex:1.45;background:#111;color:#fff}.wf-review-note{display:flex;gap:10px;margin-top:18px;padding:14px;border:1px solid #b7d9ce;border-radius:14px;background:#ecfdf5;color:#065f46}.wf-review-note svg{width:18px}.wf-review-note b{font-size:11px}.wf-review-note p{margin:4px 0 0;font-size:9px;line-height:1.5}.wf-done{padding:38px 6px;text-align:center}.wf-done>i{width:54px;height:54px;margin:auto;border-radius:50%;background:#ecfdf5;color:#059669;display:grid;place-items:center}.wf-done h2{margin:18px 0 7px}.wf-done p{color:var(--muted);font-size:11px;line-height:1.6}.wf-done code{padding:3px 7px;border-radius:6px;background:#e9e7df;color:#111}.wf-done button{width:100%;margin-top:16px;background:#111;color:#fff}.wf-toast{position:fixed;left:50%;bottom:24px;z-index:120;transform:translate(-50%,30px);opacity:0;pointer-events:none;padding:12px 16px;border-radius:99px;background:#111;color:#fff;font-size:10px;font-weight:800;transition:.25s}.wf-toast.show{opacity:1;transform:translate(-50%,0)}
@media(max-width:980px){.wf-links{display:none}.wf-hero-grid{grid-template-columns:1fr}.wf-hero-copy{padding-top:30px}.wf-hero-media{min-height:520px}.wf-search{grid-template-columns:1fr 1fr}.wf-search label{border-bottom:1px solid var(--line)}.wf-search>button{width:100%;grid-column:1/-1}.wf-card,.wf-card.featured{grid-column:span 6}.wf-smart{grid-template-columns:1fr}.wf-match{max-width:620px;transform:none}.wf-steps{grid-template-columns:1fr}.wf-steps h3{margin-top:24px}.wf-cta{padding:50px 40px}}
@media(max-width:650px){.wf-shell{width:calc(100% - 20px)}.wf-nav-wrap{top:10px}.wf-nav{width:calc(100% - 20px);height:58px;padding-left:12px}.wf-brand small,.wf-saved{display:none}.wf-hero{padding-top:92px}.wf-hero h1{font-size:56px}.wf-hero-media{min-height:430px}.wf-hero-card{left:12px;right:12px;bottom:12px}.wf-hero-card span{display:none}.wf-search{grid-template-columns:1fr;margin-top:10px;border-radius:22px}.wf-search label{min-height:62px;padding:11px 14px}.wf-search>button{height:56px}.wf-section{padding-top:72px}.wf-section-head{display:block}.wf-section-head>p{margin-top:17px}.wf-grid{gap:10px}.wf-card,.wf-card.featured{grid-column:1/-1}.wf-card-media,.wf-card.featured .wf-card-media{height:270px}.wf-smart{padding:34px 20px;border-radius:28px}.wf-match-media{height:245px}.wf-cta{display:block;padding:42px 24px;border-radius:28px}.wf-cta button{width:100%;justify-content:center;margin-top:26px}.wf-footer>.wf-shell{grid-template-columns:1fr}.wf-footer nav{flex-wrap:wrap}.wf-booking-bg{padding:0}.wf-booking{border-radius:0}.wf-book-dates{grid-template-columns:1fr 1fr}.wf-book-actions{flex-direction:column}}
@media(prefers-reduced-motion:reduce){.wf-root *{scroll-behavior:auto!important;animation:none!important;transition:none!important}.wf-card:hover{transform:none}}
`;
