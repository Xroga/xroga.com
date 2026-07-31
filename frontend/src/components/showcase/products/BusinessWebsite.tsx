'use client';

/**
 * Showcase product: Modern Business Website.
 *
 * A self-contained, interactive marketing site. It deliberately does not use the
 * Xroga app's own tokens — a showcase product has its own design system, driven by
 * the BRAND constant below so a customised build only has to change these values.
 *
 * Imagery is composed from CSS and inline SVG rather than bitmaps: it stays crisp,
 * costs no requests, recolours with the brand, and means no section ever renders an
 * empty placeholder box.
 *
 * All testimonial and portfolio content is clearly labelled sample content, and no
 * customer, revenue, rating or download figures are stated anywhere.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { productReset } from './shared';

const BRAND = {
  name: 'Northwind Studio',
  ink: '#0b1120',
  paper: '#ffffff',
  subtle: '#f7f8fa',
  border: '#e6e9ee',
  muted: '#5b6472',
  accent: '#2563eb',
  accentDeep: '#1e40af',
  accentSoft: '#dbeafe',
} as const;

const NAV = [
  { id: 'services', label: 'Services' },
  { id: 'work', label: 'Work' },
  { id: 'process', label: 'Process' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
  { id: 'contact', label: 'Contact' },
] as const;

const SERVICES = [
  {
    title: 'Product design',
    body: 'Interface design, design systems, and prototypes your engineers can build from.',
    icon: 'design',
  },
  {
    title: 'Web engineering',
    body: 'Accessible, fast front-ends and the APIs behind them.',
    icon: 'code',
  },
  {
    title: 'Platform work',
    body: 'Migrations, integrations, and the plumbing that keeps releases boring.',
    icon: 'stack',
  },
  {
    title: 'Ongoing support',
    body: 'A retained team for iteration after launch, not just delivery.',
    icon: 'pulse',
  },
] as const;

const WORK = [
  {
    title: 'Fleet operations console',
    tag: 'Logistics',
    blurb: 'Dispatch and tracking for a regional carrier.',
    art: 'map',
  },
  {
    title: 'Clinical intake flow',
    tag: 'Healthcare',
    blurb: 'Reduced a nine-step form to three screens.',
    art: 'form',
  },
  {
    title: 'Billing migration',
    tag: 'Fintech',
    blurb: 'Moved a legacy biller without downtime.',
    art: 'chart',
  },
] as const;

const PROCESS = [
  { step: '01', title: 'Discover', body: 'We map the problem, constraints, and what success actually means.' },
  { step: '02', title: 'Design', body: 'Flows and interfaces, reviewed with the people who will use them.' },
  { step: '03', title: 'Build', body: 'Short iterations with working software at the end of each one.' },
  { step: '04', title: 'Support', body: 'We stay on after launch to iterate against real usage.' },
] as const;

const TESTIMONIALS = [
  { quote: 'They shipped the first working version in three weeks and it held up.', name: 'Sample Reviewer', role: 'Head of Ops' },
  { quote: 'The handover was the cleanest we have had from an outside team.', name: 'Sample Reviewer', role: 'Engineering Lead' },
] as const;

const PLANS: readonly {
  name: string;
  price: string;
  body: string;
  features: readonly string[];
  featured?: boolean;
}[] = [
  {
    name: 'Sprint',
    price: 'From $6k',
    body: 'A focused two-week engagement for one clear problem.',
    features: ['Discovery workshop', 'Design or build', 'Written handover'],
  },
  {
    name: 'Project',
    price: 'From $24k',
    body: 'End-to-end delivery of a defined product surface.',
    features: ['Full discovery', 'Design and build', 'QA and launch', '30 days support'],
    featured: true,
  },
  {
    name: 'Retained',
    price: 'Monthly',
    body: 'An embedded team for continuous iteration.',
    features: ['Dedicated capacity', 'Roadmap planning', 'Priority support'],
  },
];

const FAQS = [
  { q: 'How quickly can you start?', a: 'Usually within two weeks. Sprint engagements can sometimes start sooner.' },
  { q: 'Do you work with existing codebases?', a: 'Yes. Most of our work is inside systems that already carry real traffic.' },
  { q: 'Who owns the work?', a: 'You do. Code lands in your repository from the first week.' },
  { q: 'Can you work with our designers?', a: 'Yes — we regularly build against a client design team’s output.' },
] as const;

type FormState = 'idle' | 'submitting' | 'success' | 'error';

/* ---------------------------------------------------------------- iconography */

function ServiceIcon({ kind }: { kind: string }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  const stroke = { stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'design') {
    return (
      <svg {...common}>
        <path d="M4 20h16M7 16l4-9 4 9M8.5 13h5" {...stroke} />
      </svg>
    );
  }
  if (kind === 'code') {
    return (
      <svg {...common}>
        <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" {...stroke} />
      </svg>
    );
  }
  if (kind === 'stack') {
    return (
      <svg {...common}>
        <path d="M12 4l8 4-8 4-8-4 8-4Z" {...stroke} />
        <path d="M4 12l8 4 8-4M4 16l8 4 8-4" {...stroke} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3 12h4l2-5 3 10 2-5h7" {...stroke} />
    </svg>
  );
}

/** Abstract, brand-tinted artwork so a work card is never an empty rectangle. */
function WorkArt({ kind }: { kind: string }) {
  const base = { width: '100%', height: '100%', viewBox: '0 0 320 190', preserveAspectRatio: 'none', 'aria-hidden': true } as const;
  if (kind === 'map') {
    return (
      <svg {...base}>
        <rect width="320" height="190" fill={BRAND.accentSoft} />
        <path d="M0 130 L70 96 L140 118 L215 70 L320 100 V190 H0Z" fill={BRAND.accent} opacity="0.16" />
        <path d="M0 150 L80 124 L150 142 L230 104 L320 132" stroke={BRAND.accent} strokeWidth="2" fill="none" opacity="0.65" />
        {[70, 150, 230].map((x, i) => (
          <circle key={x} cx={x} cy={[124, 142, 104][i]} r="5" fill={BRAND.paper} stroke={BRAND.accent} strokeWidth="2.5" />
        ))}
      </svg>
    );
  }
  if (kind === 'form') {
    return (
      <svg {...base}>
        <rect width="320" height="190" fill={BRAND.accentSoft} />
        {[0, 1, 2].map((row) => (
          <g key={row} transform={`translate(46 ${44 + row * 40})`}>
            <rect width="120" height="9" rx="4.5" fill={BRAND.accent} opacity="0.32" />
            <rect y="17" width="228" height="14" rx="7" fill={BRAND.paper} />
          </g>
        ))}
        <rect x="46" y="160" width="86" height="16" rx="8" fill={BRAND.accent} opacity="0.85" />
      </svg>
    );
  }
  return (
    <svg {...base}>
      <rect width="320" height="190" fill={BRAND.accentSoft} />
      {[36, 74, 112, 150, 188, 226, 264].map((x, i) => {
        const h = [46, 74, 58, 100, 82, 126, 108][i];
        return <rect key={x} x={x} y={168 - h} width="22" height={h} rx="5" fill={BRAND.accent} opacity={0.28 + i * 0.09} />;
      })}
    </svg>
  );
}

/** The hero visual: a suggestion of a shipped interface, composed in markup. */
function HeroCanvas() {
  return (
    <div className="nw-hero-canvas" aria-hidden>
      <div className="nw-hero-window">
        <div className="nw-hero-chrome">
          <span />
          <span />
          <span />
        </div>
        <div className="nw-hero-body">
          <div className="nw-hero-side">
            {[68, 46, 56, 38, 50].map((w, i) => (
              <span key={i} style={{ width: `${w}%`, opacity: i === 0 ? 1 : 0.5 }} />
            ))}
          </div>
          <div className="nw-hero-main">
            <div className="nw-hero-kpis">
              {[0, 1, 2].map((i) => (
                <div key={i} className="nw-hero-kpi">
                  <span className="nw-hero-kpi-label" />
                  <span className="nw-hero-kpi-bar" style={{ width: `${[62, 84, 48][i]}%` }} />
                </div>
              ))}
            </div>
            <svg className="nw-hero-chart" viewBox="0 0 300 96" preserveAspectRatio="none">
              <defs>
                <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND.accent} stopOpacity="0.42" />
                  <stop offset="100%" stopColor={BRAND.accent} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 74 L50 58 L100 66 L150 36 L200 46 L250 20 L300 30 V96 H0Z" fill="url(#nw-fill)" />
              <path
                d="M0 74 L50 58 L100 66 L150 36 L200 46 L250 20 L300 30"
                fill="none"
                stroke={BRAND.accent}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- product */

export function BusinessWebsite() {
  const uid = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<FormState>('idle');
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes the mobile menu, and focus returns to the control that opened it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // Solidifies the header once the hero is behind it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function validate() {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Please tell us your name.';
    if (!form.email.trim()) next.email = 'Please add an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'That email address does not look right.';
    if (form.message.trim().length < 10) next.message = 'A sentence or two about your project helps.';
    return next;
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setState('error');
      return;
    }
    setState('submitting');
    // A demonstration form: it never transmits anything, and says so in the UI.
    window.setTimeout(() => setState('success'), 700);
  }

  return (
    <div className="nw-root">
      <style>{CSS}</style>

      <a href="#nw-main" className="nw-skip">
        Skip to content
      </a>

      <header className={`nw-header${scrolled ? ' nw-header--solid' : ''}`}>
        <div className="nw-shell nw-header-inner">
          <a href="#nw-main" className="nw-brand">
            <span className="nw-brand-mark" aria-hidden>
              N
            </span>
            {BRAND.name}
          </a>

          <nav className="nw-nav" aria-label="Primary">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="nw-header-actions">
            <a href="#contact" className="nw-btn nw-btn--primary nw-btn--sm">
              Book a call
            </a>
            <button
              ref={menuButtonRef}
              type="button"
              className="nw-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls={`${uid}-menu`}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="nw-sr">{menuOpen ? 'Close menu' : 'Open menu'}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id={`${uid}-menu`} className="nw-mobile-menu">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
          </div>
        )}
      </header>

      <main id="nw-main">
        {/* ------------------------------------------------------------- hero */}
        <section className="nw-hero">
          <div className="nw-hero-glow" aria-hidden />
          <div className="nw-shell nw-hero-grid">
            <div className="nw-hero-copy">
              <span className="nw-eyebrow">Sample company</span>
              <h1 className="nw-display">
                Digital products for teams that <em>ship</em>
              </h1>
              <p className="nw-lede">
                We design and build software with small senior teams and short feedback loops. You own the code from week
                one.
              </p>
              <div className="nw-hero-ctas">
                <a href="#contact" className="nw-btn nw-btn--primary">
                  Book a discovery call
                </a>
                <a href="#work" className="nw-btn nw-btn--ghost">
                  See our work
                </a>
              </div>
              <ul className="nw-hero-points">
                <li>Senior team, no handoffs</li>
                <li>Working software every iteration</li>
                <li>Your repository from day one</li>
              </ul>
            </div>
            <HeroCanvas />
          </div>
        </section>

        {/* --------------------------------------------------------- services */}
        <section id="services" className="nw-section">
          <div className="nw-shell">
            <div className="nw-section-head">
              <span className="nw-eyebrow">Services</span>
              <h2 className="nw-h2">Four ways teams bring us in</h2>
            </div>
            <div className="nw-grid nw-grid--4">
              {SERVICES.map((service) => (
                <article key={service.title} className="nw-card nw-card--service">
                  <span className="nw-service-icon">
                    <ServiceIcon kind={service.icon} />
                  </span>
                  <h3 className="nw-h3">{service.title}</h3>
                  <p className="nw-body">{service.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- work */}
        <section id="work" className="nw-section nw-section--tint">
          <div className="nw-shell">
            <div className="nw-section-head">
              <span className="nw-eyebrow">Selected work</span>
              <h2 className="nw-h2">Sample projects</h2>
              <p className="nw-section-sub">
                Illustrative engagements for this template — not real client work.
              </p>
            </div>
            <div className="nw-grid nw-grid--3">
              {WORK.map((item) => (
                <article key={item.title} className="nw-card nw-card--work">
                  <div className="nw-work-art">
                    <WorkArt kind={item.art} />
                  </div>
                  <div className="nw-work-body">
                    <span className="nw-tag">{item.tag}</span>
                    <h3 className="nw-h3">{item.title}</h3>
                    <p className="nw-body">{item.blurb}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- process */}
        <section id="process" className="nw-section">
          <div className="nw-shell">
            <div className="nw-section-head">
              <span className="nw-eyebrow">Process</span>
              <h2 className="nw-h2">How we work</h2>
              <p className="nw-section-sub">A small senior team, working in the open. No handoff cliffs, no surprise rewrites.</p>
            </div>
            <ol className="nw-steps">
              {PROCESS.map((item) => (
                <li key={item.step} className="nw-step">
                  <span className="nw-step-num">{item.step}</span>
                  <h3 className="nw-h3">{item.title}</h3>
                  <p className="nw-body">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ----------------------------------------------------- testimonials */}
        <section className="nw-section nw-section--ink">
          <div className="nw-shell">
            <div className="nw-section-head nw-section-head--center">
              <span className="nw-eyebrow nw-eyebrow--light">Sample testimonials</span>
              <h2 className="nw-h2 nw-h2--light">What clients say</h2>
            </div>
            <div className="nw-grid nw-grid--2">
              {TESTIMONIALS.map((item) => (
                <figure key={item.quote} className="nw-quote">
                  <span className="nw-quote-mark" aria-hidden>
                    &ldquo;
                  </span>
                  <blockquote>{item.quote}</blockquote>
                  <figcaption>
                    {item.name} · {item.role}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- pricing */}
        <section id="pricing" className="nw-section nw-section--tint">
          <div className="nw-shell">
            <div className="nw-section-head">
              <span className="nw-eyebrow">Engagements</span>
              <h2 className="nw-h2">Ways to work together</h2>
              <p className="nw-section-sub">Indicative ranges. Every scope is quoted after discovery.</p>
            </div>
            <div className="nw-grid nw-grid--3 nw-grid--plans">
              {PLANS.map((plan) => (
                <article key={plan.name} className={`nw-plan${plan.featured ? ' nw-plan--featured' : ''}`}>
                  {plan.featured && <span className="nw-plan-flag">Most chosen</span>}
                  <h3 className="nw-plan-name">{plan.name}</h3>
                  <p className="nw-plan-price">{plan.price}</p>
                  <p className="nw-body">{plan.body}</p>
                  <ul className="nw-plan-features">
                    {plan.features.map((feature) => (
                      <li key={feature}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <a href="#contact" className={`nw-btn ${plan.featured ? 'nw-btn--primary' : 'nw-btn--outline'} nw-btn--block`}>
                    Enquire
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- faq */}
        <section id="faq" className="nw-section">
          <div className="nw-shell nw-shell--narrow">
            <div className="nw-section-head">
              <span className="nw-eyebrow">FAQ</span>
              <h2 className="nw-h2">Questions</h2>
            </div>
            <div className="nw-faq">
              {FAQS.map((item, index) => {
                const open = openFaq === index;
                return (
                  <div key={item.q} className={`nw-faq-item${open ? ' nw-faq-item--open' : ''}`}>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={`${uid}-faq-${index}`}
                      onClick={() => setOpenFaq(open ? null : index)}
                    >
                      <span>{item.q}</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div id={`${uid}-faq-${index}`} role="region" hidden={!open}>
                      <p className="nw-body">{item.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- contact */}
        <section id="contact" className="nw-section nw-section--tint">
          <div className="nw-shell nw-shell--narrow">
            <div className="nw-section-head nw-section-head--center">
              <span className="nw-eyebrow">Contact</span>
              <h2 className="nw-h2">Start a conversation</h2>
              <p className="nw-section-sub">
                Tell us what you are working on. This demonstration form validates your input and does not send data
                anywhere.
              </p>
            </div>

            <form className="nw-form" onSubmit={onSubmit} noValidate>
              <div className="nw-field">
                <label htmlFor={`${uid}-name`}>Name</label>
                <input
                  id={`${uid}-name`}
                  value={form.name}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? `${uid}-name-error` : undefined}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
                {errors.name && (
                  <p id={`${uid}-name-error`} className="nw-error">
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="nw-field">
                <label htmlFor={`${uid}-email`}>Email</label>
                <input
                  id={`${uid}-email`}
                  type="email"
                  value={form.email}
                  autoComplete="email"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? `${uid}-email-error` : undefined}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                />
                {errors.email && (
                  <p id={`${uid}-email-error`} className="nw-error">
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="nw-field">
                <label htmlFor={`${uid}-message`}>What do you need?</label>
                <textarea
                  id={`${uid}-message`}
                  rows={4}
                  value={form.message}
                  aria-invalid={Boolean(errors.message)}
                  aria-describedby={errors.message ? `${uid}-message-error` : undefined}
                  onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                />
                {errors.message && (
                  <p id={`${uid}-message-error`} className="nw-error">
                    {errors.message}
                  </p>
                )}
              </div>

              <button type="submit" className="nw-btn nw-btn--primary nw-btn--block" disabled={state === 'submitting'}>
                {state === 'submitting' ? 'Sending…' : 'Send enquiry'}
              </button>

              <p role="status" aria-live="polite" className="nw-status">
                {state === 'success'
                  ? 'Thank you — in a real deployment this would reach the team inbox.'
                  : state === 'error'
                    ? 'Please check the highlighted fields.'
                    : ''}
              </p>
            </form>
          </div>
        </section>
      </main>

      <footer className="nw-footer">
        <div className="nw-shell nw-footer-inner">
          <div>
            <span className="nw-brand nw-brand--footer">
              <span className="nw-brand-mark" aria-hidden>
                N
              </span>
              {BRAND.name}
            </span>
            <p className="nw-footer-note">Sample company for the Xroga AI Showcase.</p>
          </div>
          <nav className="nw-footer-nav" aria-label="Footer">
            {NAV.slice(0, 4).map((item) => (
              <a key={item.id} href={`#${item.id}`}>
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------------------------------------------------- css */

const CSS = `
${productReset('.nw-root')}
.nw-root {
  --ink: ${BRAND.ink};
  --paper: ${BRAND.paper};
  --subtle: ${BRAND.subtle};
  --border: ${BRAND.border};
  --muted: ${BRAND.muted};
  --accent: ${BRAND.accent};
  --accent-deep: ${BRAND.accentDeep};
  --accent-soft: ${BRAND.accentSoft};
  background: var(--paper);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
}
.nw-root *, .nw-root *::before, .nw-root *::after { box-sizing: border-box; }
.nw-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.nw-skip {
  position: absolute; left: -9999px; top: 8px; z-index: 60;
  background: var(--ink); color: #fff; padding: 10px 16px; border-radius: 8px; font-size: 14px;
}
.nw-skip:focus { left: 16px; }

.nw-shell { width: 100%; max-width: 1160px; margin: 0 auto; padding: 0 24px; }
.nw-shell--narrow { max-width: 760px; }

/* header */
.nw-header {
  position: sticky; top: 0; z-index: 50;
  background: transparent; transition: background 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
  border-bottom: 1px solid transparent;
}
.nw-header--solid {
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(12px);
  border-bottom-color: var(--border);
  box-shadow: 0 1px 24px rgba(11,17,32,0.05);
}
.nw-header-inner { display: flex; align-items: center; gap: 20px; height: 68px; }
.nw-brand {
  display: inline-flex; align-items: center; gap: 10px;
  font-weight: 700; font-size: 15px; letter-spacing: -0.01em; color: var(--ink); text-decoration: none;
}
.nw-brand-mark {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px;
  background: linear-gradient(140deg, var(--accent), var(--accent-deep));
  color: #fff; font-size: 14px; font-weight: 800;
}
.nw-nav { display: none; gap: 4px; margin-left: auto; }
.nw-nav a {
  padding: 8px 12px; border-radius: 8px; font-size: 14px; font-weight: 500;
  color: var(--muted); text-decoration: none; transition: color 160ms ease, background 160ms ease;
}
.nw-nav a:hover { color: var(--ink); background: var(--subtle); }
.nw-header-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.nw-nav ~ .nw-header-actions { margin-left: 0; }
.nw-menu-toggle {
  display: grid; place-items: center; width: 38px; height: 38px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--paper); color: var(--ink); cursor: pointer;
}
.nw-mobile-menu {
  display: grid; gap: 2px; padding: 8px 24px 16px;
  background: rgba(255,255,255,0.96); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border);
}
.nw-mobile-menu a {
  padding: 11px 12px; border-radius: 9px; font-size: 15px; font-weight: 500;
  color: var(--ink); text-decoration: none;
}
.nw-mobile-menu a:hover { background: var(--subtle); }

/* buttons */
.nw-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 22px; border-radius: 999px; border: 1px solid transparent;
  font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, color 160ms ease;
}
.nw-btn--sm { padding: 8px 16px; font-size: 13px; }
.nw-btn--block { width: 100%; }
.nw-btn--primary {
  background: linear-gradient(140deg, var(--accent), var(--accent-deep)); color: #fff;
  box-shadow: 0 8px 20px -8px rgba(37,99,235,0.6);
}
.nw-btn--primary:hover { transform: translateY(-1px); box-shadow: 0 14px 28px -10px rgba(37,99,235,0.62); }
.nw-btn--primary:disabled { opacity: 0.65; cursor: progress; transform: none; }
.nw-btn--ghost { background: var(--paper); color: var(--ink); border-color: var(--border); }
.nw-btn--ghost:hover { background: var(--subtle); }
.nw-btn--outline { background: transparent; color: var(--ink); border-color: var(--border); }
.nw-btn--outline:hover { border-color: var(--ink); }
.nw-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* type */
.nw-eyebrow {
  display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--accent);
}
.nw-eyebrow--light { color: #93b4fd; }
.nw-display {
  margin: 14px 0 0; font-size: clamp(34px, 5.4vw, 62px); line-height: 1.04;
  letter-spacing: -0.035em; font-weight: 800;
}
.nw-display em { font-style: normal; color: var(--accent); }
.nw-h2 {
  margin: 10px 0 0; font-size: clamp(25px, 3vw, 38px); line-height: 1.12;
  letter-spacing: -0.028em; font-weight: 750;
}
.nw-h2--light { color: #fff; }
.nw-h3 { margin: 0; font-size: 16px; font-weight: 650; letter-spacing: -0.012em; }
.nw-body { margin: 6px 0 0; font-size: 14px; line-height: 1.62; color: var(--muted); }
.nw-lede { margin: 18px 0 0; max-width: 46ch; font-size: clamp(15px, 1.6vw, 18px); line-height: 1.62; color: var(--muted); }
.nw-section-sub { margin: 12px 0 0; max-width: 62ch; font-size: 15px; line-height: 1.62; color: var(--muted); }
.nw-section-head { margin-bottom: 40px; }
.nw-section-head--center { text-align: center; }
.nw-section-head--center .nw-section-sub { margin-inline: auto; }

/* hero */
.nw-hero { position: relative; overflow: hidden; padding: clamp(56px, 9vw, 104px) 0 clamp(48px, 7vw, 88px); }
.nw-hero-glow {
  position: absolute; inset: -20% -10% auto -10%; height: 620px; pointer-events: none;
  background:
    radial-gradient(48% 60% at 22% 24%, rgba(37,99,235,0.16), transparent 70%),
    radial-gradient(42% 52% at 82% 8%, rgba(30,64,175,0.14), transparent 70%);
}
.nw-hero-grid { position: relative; display: grid; gap: clamp(40px, 6vw, 64px); align-items: center; }
.nw-hero-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.nw-hero-points {
  display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 30px 0 0; padding: 0; list-style: none;
  font-size: 13px; font-weight: 500; color: var(--muted);
}
.nw-hero-points li { display: flex; align-items: center; gap: 8px; }
.nw-hero-points li::before {
  content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); flex: none;
}

/* hero canvas */
.nw-hero-canvas { perspective: 1400px; }
.nw-hero-window {
  border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--paper);
  box-shadow: 0 40px 80px -40px rgba(11,17,32,0.34), 0 2px 8px rgba(11,17,32,0.05);
  transform: rotateY(-7deg) rotateX(3deg);
}
.nw-hero-chrome {
  display: flex; align-items: center; gap: 6px; padding: 11px 14px;
  background: var(--subtle); border-bottom: 1px solid var(--border);
}
.nw-hero-chrome span { width: 9px; height: 9px; border-radius: 50%; background: #d3d8e0; }
.nw-hero-body { display: grid; grid-template-columns: 96px 1fr; min-height: 236px; }
.nw-hero-side {
  display: grid; align-content: start; gap: 11px; padding: 18px 14px;
  border-right: 1px solid var(--border); background: #fbfcfd;
}
.nw-hero-side span { height: 7px; border-radius: 4px; background: var(--accent-soft); }
.nw-hero-main { padding: 18px; display: grid; gap: 16px; align-content: start; }
.nw-hero-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.nw-hero-kpi {
  display: grid; gap: 8px; padding: 11px; border: 1px solid var(--border); border-radius: 10px; background: var(--paper);
}
.nw-hero-kpi-label { height: 6px; width: 46%; border-radius: 3px; background: #dfe3ea; }
.nw-hero-kpi-bar { height: 9px; border-radius: 5px; background: linear-gradient(90deg, var(--accent), #60a5fa); }
.nw-hero-chart { width: 100%; height: 96px; }

/* sections */
.nw-section { padding: clamp(56px, 8vw, 96px) 0; }
.nw-section--tint { background: var(--subtle); border-block: 1px solid var(--border); }
.nw-section--ink { background: var(--ink); }

/* grids + cards */
.nw-grid { display: grid; gap: 18px; }
.nw-card {
  background: var(--paper); border: 1px solid var(--border); border-radius: 14px;
  transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
}
.nw-card--service { padding: 22px; }
.nw-card--service:hover {
  transform: translateY(-3px); border-color: #cfd6e0;
  box-shadow: 0 22px 40px -26px rgba(11,17,32,0.3);
}
.nw-service-icon {
  display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 16px;
  border-radius: 11px; background: var(--accent-soft); color: var(--accent-deep);
}
.nw-card--work { overflow: hidden; padding: 0; }
.nw-card--work:hover { transform: translateY(-3px); box-shadow: 0 26px 44px -28px rgba(11,17,32,0.32); }
.nw-work-art { height: 168px; border-bottom: 1px solid var(--border); }
.nw-work-art svg { display: block; height: 100%; width: 100%; }
.nw-work-body { padding: 18px 20px 22px; }
.nw-tag {
  display: inline-block; margin-bottom: 10px; padding: 3px 9px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent-deep);
  font-size: 10px; font-weight: 750; letter-spacing: 0.07em; text-transform: uppercase;
}

/* steps */
.nw-steps { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; counter-reset: none; }
.nw-step { position: relative; padding: 24px 22px; border-radius: 14px; background: var(--subtle); border: 1px solid var(--border); }
.nw-step-num {
  display: block; margin-bottom: 12px; font-size: 12px; font-weight: 800;
  letter-spacing: 0.1em; color: var(--accent);
}

/* testimonials */
.nw-quote {
  margin: 0; padding: 30px 28px; border-radius: 16px;
  background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.11);
}
.nw-quote-mark { display: block; font-size: 44px; line-height: 0.7; color: #93b4fd; }
.nw-quote blockquote {
  margin: 14px 0 0; font-size: clamp(16px, 1.8vw, 19px); line-height: 1.56; color: #fff; letter-spacing: -0.014em;
}
.nw-quote figcaption { margin-top: 18px; font-size: 13px; color: #9aa8bd; }

/* plans */
.nw-grid--plans { align-items: stretch; }
.nw-plan {
  position: relative; display: flex; flex-direction: column; gap: 4px;
  padding: 28px 24px; border-radius: 16px; background: var(--paper); border: 1px solid var(--border);
}
.nw-plan--featured {
  border-color: var(--accent); box-shadow: 0 26px 50px -28px rgba(37,99,235,0.42);
}
.nw-plan-flag {
  position: absolute; top: -11px; left: 24px; padding: 4px 11px; border-radius: 999px;
  background: var(--accent); color: #fff; font-size: 10px; font-weight: 750;
  letter-spacing: 0.07em; text-transform: uppercase;
}
.nw-plan-name { margin: 0; font-size: 13px; font-weight: 650; color: var(--muted); letter-spacing: 0.02em; }
.nw-plan-price { margin: 6px 0 0; font-size: 30px; font-weight: 800; letter-spacing: -0.03em; }
.nw-plan-features { display: grid; gap: 10px; margin: 20px 0 26px; padding: 0; list-style: none; }
.nw-plan-features li { display: flex; align-items: flex-start; gap: 9px; font-size: 14px; color: var(--ink); }
.nw-plan-features svg { flex: none; margin-top: 3px; color: var(--accent); }
.nw-plan .nw-btn { margin-top: auto; }

/* faq */
.nw-faq { display: grid; gap: 10px; }
.nw-faq-item { border: 1px solid var(--border); border-radius: 12px; background: var(--paper); overflow: hidden; }
.nw-faq-item--open { border-color: #cfd6e0; box-shadow: 0 14px 30px -22px rgba(11,17,32,0.3); }
.nw-faq-item button {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%;
  padding: 17px 20px; background: none; border: 0; cursor: pointer; text-align: left;
  font-size: 15px; font-weight: 600; color: var(--ink); font-family: inherit;
}
.nw-faq-item button svg { flex: none; color: var(--muted); transition: transform 200ms ease; }
.nw-faq-item--open button svg { transform: rotate(180deg); }
.nw-faq-item > div { padding: 0 20px 18px; }
.nw-faq-item > div .nw-body { margin: 0; }

/* form */
.nw-form {
  display: grid; gap: 18px; padding: 30px 26px; border-radius: 18px;
  background: var(--paper); border: 1px solid var(--border);
  box-shadow: 0 30px 60px -40px rgba(11,17,32,0.3);
}
.nw-field { display: grid; gap: 7px; }
.nw-field label { font-size: 13px; font-weight: 600; }
.nw-field input, .nw-field textarea {
  width: 100%; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--paper); color: var(--ink); font-size: 15px; font-family: inherit; resize: vertical;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.nw-field input:focus, .nw-field textarea:focus {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(37,99,235,0.14);
}
.nw-field [aria-invalid="true"] { border-color: #dc2626; }
.nw-error { margin: 0; font-size: 12.5px; color: #b91c1c; }
.nw-status { margin: 0; min-height: 20px; font-size: 13.5px; color: var(--accent-deep); }

/* footer */
.nw-footer { padding: 40px 0; background: var(--ink); color: #9aa8bd; }
.nw-footer-inner { display: grid; gap: 22px; }
.nw-brand--footer { color: #fff; }
.nw-footer-note { margin: 12px 0 0; font-size: 13px; }
.nw-footer-nav { display: flex; flex-wrap: wrap; gap: 18px; }
.nw-footer-nav a { font-size: 13px; color: #9aa8bd; text-decoration: none; }
.nw-footer-nav a:hover { color: #fff; }

/* responsive */
@media (min-width: 700px) {
  .nw-grid--2 { grid-template-columns: repeat(2, 1fr); }
  .nw-grid--3 { grid-template-columns: repeat(3, 1fr); }
  .nw-grid--4 { grid-template-columns: repeat(2, 1fr); }
  .nw-steps { grid-template-columns: repeat(2, 1fr); }
  .nw-footer-inner { grid-template-columns: 1fr auto; align-items: end; }
}
@media (min-width: 980px) {
  .nw-nav { display: flex; }
  .nw-menu-toggle { display: none; }
  .nw-grid--4 { grid-template-columns: repeat(4, 1fr); }
  .nw-steps { grid-template-columns: repeat(4, 1fr); }
  .nw-hero-grid { grid-template-columns: 1.04fr 0.96fr; }
  .nw-form { padding: 36px 34px; }
}
@media (prefers-reduced-motion: reduce) {
  .nw-root *, .nw-root *::before, .nw-root *::after {
    animation-duration: 0.001ms !important; transition-duration: 0.001ms !important;
  }
  .nw-hero-window { transform: none; }
  .nw-card:hover, .nw-btn--primary:hover { transform: none; }
}
`;
