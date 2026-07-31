'use client';

/**
 * Showcase product: Modern Business Website.
 *
 * A self-contained, interactive marketing site. It deliberately does not use the
 * Xroga app's own tokens — a showcase product has its own design system, driven by
 * the BRAND constant below so a customised build only has to change these values.
 *
 * All testimonial and portfolio content is clearly labelled sample content.
 */

import { useEffect, useId, useRef, useState } from 'react';

const BRAND = {
  name: 'Northwind Studio',
  tagline: 'Digital products for teams that ship',
  ink: '#101828',
  paper: '#ffffff',
  subtle: '#f6f7f9',
  border: '#e4e7ec',
  muted: '#5b6472',
  accent: '#1f6feb',
  accentInk: '#ffffff',
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
  { title: 'Product design', body: 'Interface design, design systems, and prototypes your engineers can build from.' },
  { title: 'Web engineering', body: 'Accessible, fast front-ends and the APIs behind them.' },
  { title: 'Platform work', body: 'Migrations, integrations, and the plumbing that keeps releases boring.' },
  { title: 'Ongoing support', body: 'A retained team for iteration after launch, not just delivery.' },
] as const;

const WORK = [
  { title: 'Fleet operations console', tag: 'Logistics', blurb: 'Dispatch and tracking for a regional carrier.' },
  { title: 'Clinical intake flow', tag: 'Healthcare', blurb: 'Reduced a nine-step form to three screens.' },
  { title: 'Billing migration', tag: 'Fintech', blurb: 'Moved a legacy biller without downtime.' },
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
  { name: 'Sprint', price: 'From $6k', body: 'A focused two-week engagement for one clear problem.', features: ['Discovery workshop', 'Design or build', 'Written handover'] },
  { name: 'Project', price: 'From $24k', body: 'End-to-end delivery of a defined product surface.', features: ['Full discovery', 'Design and build', 'QA and launch', '30 days support'], featured: true },
  { name: 'Retained', price: 'Monthly', body: 'An embedded team for continuous iteration.', features: ['Dedicated capacity', 'Roadmap planning', 'Priority support'] },
];

const FAQS = [
  { q: 'How quickly can you start?', a: 'Usually within two weeks. Sprint engagements can sometimes start sooner.' },
  { q: 'Do you work with existing codebases?', a: 'Yes. Most of our work is inside systems that already carry real traffic.' },
  { q: 'Who owns the work?', a: 'You do. Code lands in your repository from the first week.' },
  { q: 'Can you work with our designers?', a: 'Yes — we regularly build against a client design team’s output.' },
] as const;

type FormState = 'idle' | 'submitting' | 'success' | 'error';

function SampleBadge({ children }: { children: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        padding: '3px 8px',
        borderRadius: 999,
        background: BRAND.subtle,
        color: BRAND.muted,
        border: `1px solid ${BRAND.border}`,
      }}
    >
      {children}
    </span>
  );
}

export function BusinessWebsite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<FormState>('idle');
  const formId = useId();
  const statusRef = useRef<HTMLParagraphElement>(null);

  // Close the mobile menu on Escape so keyboard users are never trapped.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function validate() {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Please enter your name.';
    if (!form.email.trim()) next.email = 'Please enter your email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.message.trim().length < 10) next.message = 'Please give us at least a sentence.';
    return next;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (state === 'submitting') return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setState('submitting');
    try {
      // Demonstration submit: this template ships without a backend so the
      // preview never sends data anywhere. A customised build wires this to a
      // real endpoint.
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (/^fail@/i.test(form.email.trim())) throw new Error('Simulated failure');
      setState('success');
      setForm({ name: '', email: '', message: '' });
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    if (state === 'success' || state === 'error') statusRef.current?.focus();
  }, [state]);

  const section: React.CSSProperties = { padding: '72px 24px', maxWidth: 1120, margin: '0 auto' };
  const h2: React.CSSProperties = { fontSize: 'clamp(1.6rem, 3.2vw, 2.4rem)', lineHeight: 1.15, letterSpacing: '-0.02em', margin: 0, color: BRAND.ink };
  const lead: React.CSSProperties = { color: BRAND.muted, marginTop: 12, fontSize: 16, lineHeight: 1.6, maxWidth: 620 };
  const card: React.CSSProperties = { border: `1px solid ${BRAND.border}`, borderRadius: 16, padding: 20, background: BRAND.paper };
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: BRAND.accent, color: BRAND.accentInk, border: '1px solid transparent',
    padding: '12px 20px', borderRadius: 999, fontWeight: 650, fontSize: 15, cursor: 'pointer', textDecoration: 'none',
  };
  const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', color: BRAND.ink, border: `1px solid ${BRAND.border}` };
  const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: BRAND.ink, marginBottom: 6 };
  const input: React.CSSProperties = {
    width: '100%', padding: '11px 13px', borderRadius: 10, border: `1px solid ${BRAND.border}`,
    fontSize: 15, color: BRAND.ink, background: BRAND.paper, fontFamily: 'inherit',
  };
  const err: React.CSSProperties = { color: '#b42318', fontSize: 13, marginTop: 6 };

  return (
    <div style={{ background: BRAND.paper, color: BRAND.ink, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif', minHeight: '100%' }}>
      <a
        href="#main"
        style={{ position: 'absolute', left: -9999, top: 8 }}
        onFocus={(e) => { e.currentTarget.style.left = '8px'; e.currentTarget.style.zIndex = '50'; e.currentTarget.style.background = BRAND.paper; e.currentTarget.style.padding = '8px 12px'; e.currentTarget.style.borderRadius = '8px'; e.currentTarget.style.border = `1px solid ${BRAND.border}`; }}
        onBlur={(e) => { e.currentTarget.style.left = '-9999px'; }}
      >
        Skip to content
      </a>

      {/* Navigation */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderBottom: `1px solid ${BRAND.border}` }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 750, letterSpacing: '-0.02em', fontSize: 17 }}>{BRAND.name}</span>
          <nav aria-label="Primary" style={{ marginLeft: 'auto', display: 'none', gap: 4 }} className="nw-desktop-nav">
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} style={{ padding: '8px 12px', borderRadius: 999, color: BRAND.muted, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
                {item.label}
              </a>
            ))}
          </nav>
          <a href="#contact" style={{ ...btn, padding: '9px 16px', fontSize: 14, marginLeft: 'auto' }} className="nw-desktop-cta">
            Book a call
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls={`${formId}-mobile-nav`}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="nw-menu-btn"
            style={{ marginLeft: 'auto', display: 'inline-flex', flexDirection: 'column', gap: 4, background: 'transparent', border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: 10, cursor: 'pointer' }}
          >
            <span style={{ width: 16, height: 2, background: BRAND.ink, display: 'block' }} />
            <span style={{ width: 16, height: 2, background: BRAND.ink, display: 'block' }} />
          </button>
        </div>
        {menuOpen && (
          <nav id={`${formId}-mobile-nav`} aria-label="Mobile" style={{ borderTop: `1px solid ${BRAND.border}`, padding: 12, display: 'grid', gap: 2 }}>
            {NAV.map((item) => (
              <a key={item.id} href={`#${item.id}`} onClick={() => setMenuOpen(false)} style={{ padding: '11px 12px', borderRadius: 10, color: BRAND.ink, textDecoration: 'none', fontWeight: 600 }}>
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main id="main">
        {/* Hero */}
        <section style={{ ...section, paddingTop: 88, paddingBottom: 56 }}>
          <SampleBadge>Sample company</SampleBadge>
          <h1 style={{ fontSize: 'clamp(2.1rem, 6vw, 3.6rem)', lineHeight: 1.05, letterSpacing: '-0.035em', margin: '16px 0 0', maxWidth: 780 }}>
            {BRAND.tagline}
          </h1>
          <p style={{ ...lead, fontSize: 18 }}>
            We design and build software with small teams and short feedback loops. You own the code from week one.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
            <a href="#contact" style={btn}>Book a discovery call</a>
            <a href="#work" style={btnGhost}>See our work</a>
          </div>
        </section>

        {/* Services */}
        <section id="services" style={{ ...section, paddingTop: 32 }} aria-labelledby="nw-services">
          <h2 id="nw-services" style={h2}>What we do</h2>
          <p style={lead}>Four ways teams bring us in.</p>
          <div style={{ display: 'grid', gap: 16, marginTop: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {SERVICES.map((s) => (
              <div key={s.title} style={card}>
                <h3 style={{ margin: 0, fontSize: 17 }}>{s.title}</h3>
                <p style={{ color: BRAND.muted, marginTop: 8, marginBottom: 0, fontSize: 14.5, lineHeight: 1.6 }}>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Work */}
        <section id="work" style={{ ...section, background: BRAND.subtle, maxWidth: 'none' }} aria-labelledby="nw-work">
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <h2 id="nw-work" style={h2}>Selected work</h2>
              <SampleBadge>Sample projects</SampleBadge>
            </div>
            <div style={{ display: 'grid', gap: 16, marginTop: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {WORK.map((w) => (
                <article key={w.title} style={{ ...card, overflow: 'hidden', padding: 0 }}>
                  <div aria-hidden style={{ height: 132, background: `linear-gradient(135deg, ${BRAND.accent}22, ${BRAND.accent}05)`, borderBottom: `1px solid ${BRAND.border}` }} />
                  <div style={{ padding: 18 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.accent, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{w.tag}</span>
                    <h3 style={{ margin: '8px 0 0', fontSize: 16.5 }}>{w.title}</h3>
                    <p style={{ color: BRAND.muted, marginTop: 6, marginBottom: 0, fontSize: 14, lineHeight: 1.6 }}>{w.blurb}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* About + Process */}
        <section id="process" style={section} aria-labelledby="nw-process">
          <h2 id="nw-process" style={h2}>How we work</h2>
          <p style={lead}>
            A small senior team, working in the open. No handoff cliffs, no surprise rewrites.
          </p>
          <ol style={{ display: 'grid', gap: 16, marginTop: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', listStyle: 'none', padding: 0 }}>
            {PROCESS.map((p) => (
              <li key={p.step} style={card}>
                <span style={{ fontSize: 12, fontWeight: 800, color: BRAND.accent }}>{p.step}</span>
                <h3 style={{ margin: '6px 0 0', fontSize: 16.5 }}>{p.title}</h3>
                <p style={{ color: BRAND.muted, marginTop: 6, marginBottom: 0, fontSize: 14, lineHeight: 1.6 }}>{p.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Testimonials */}
        <section style={{ ...section, paddingTop: 8 }} aria-labelledby="nw-testimonials">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 id="nw-testimonials" style={h2}>What clients say</h2>
            <SampleBadge>Sample testimonials</SampleBadge>
          </div>
          <div style={{ display: 'grid', gap: 16, marginTop: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {TESTIMONIALS.map((t, i) => (
              <blockquote key={i} style={{ ...card, margin: 0 }}>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>“{t.quote}”</p>
                <footer style={{ marginTop: 12, color: BRAND.muted, fontSize: 13.5 }}>
                  {t.name} · {t.role}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" style={{ ...section, background: BRAND.subtle, maxWidth: 'none' }} aria-labelledby="nw-pricing">
          <div style={{ maxWidth: 1120, margin: '0 auto' }}>
            <h2 id="nw-pricing" style={h2}>Engagements</h2>
            <p style={lead}>Indicative ranges. Every scope is quoted after discovery.</p>
            <div style={{ display: 'grid', gap: 16, marginTop: 28, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
              {PLANS.map((plan) => (
                <div key={plan.name} style={{ ...card, borderColor: plan.featured ? BRAND.accent : BRAND.border, borderWidth: plan.featured ? 2 : 1 }}>
                  {plan.featured && <SampleBadge>Most chosen</SampleBadge>}
                  <h3 style={{ margin: plan.featured ? '10px 0 0' : 0, fontSize: 17 }}>{plan.name}</h3>
                  <p style={{ fontSize: 22, fontWeight: 750, margin: '8px 0 0', letterSpacing: '-0.02em' }}>{plan.price}</p>
                  <p style={{ color: BRAND.muted, marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>{plan.body}</p>
                  <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ fontSize: 14, color: BRAND.ink, display: 'flex', gap: 8 }}>
                        <span aria-hidden style={{ color: BRAND.accent, fontWeight: 700 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a href="#contact" style={{ ...(plan.featured ? btn : btnGhost), width: '100%', marginTop: 18 }}>Enquire</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={section} aria-labelledby="nw-faq">
          <h2 id="nw-faq" style={h2}>Questions</h2>
          <div style={{ marginTop: 24, display: 'grid', gap: 10, maxWidth: 760 }}>
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 14, overflow: 'hidden', background: BRAND.paper }}>
                  <h3 style={{ margin: 0 }}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                      aria-controls={`${formId}-faq-${i}`}
                      style={{ width: '100%', textAlign: 'left', padding: '15px 17px', background: 'transparent', border: 0, cursor: 'pointer', fontWeight: 650, fontSize: 15.5, color: BRAND.ink, display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: 'inherit' }}
                    >
                      {f.q}
                      <span aria-hidden style={{ color: BRAND.muted, flexShrink: 0 }}>{open ? '−' : '+'}</span>
                    </button>
                  </h3>
                  {open && (
                    <p id={`${formId}-faq-${i}`} style={{ margin: 0, padding: '0 17px 16px', color: BRAND.muted, fontSize: 14.5, lineHeight: 1.65 }}>
                      {f.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Contact */}
        <section id="contact" style={{ ...section, background: BRAND.subtle, maxWidth: 'none' }} aria-labelledby="nw-contact">
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            <h2 id="nw-contact" style={h2}>Start a conversation</h2>
            <p style={lead}>Tell us what you are working on. This demonstration form does not send data anywhere.</p>

            <form onSubmit={onSubmit} noValidate style={{ marginTop: 24, display: 'grid', gap: 16 }}>
              <div>
                <label htmlFor={`${formId}-name`} style={label}>Name</label>
                <input
                  id={`${formId}-name`} value={form.name} style={input}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${formId}-name-err` : undefined}
                />
                {errors.name && <p id={`${formId}-name-err`} style={err}>{errors.name}</p>}
              </div>
              <div>
                <label htmlFor={`${formId}-email`} style={label}>Email</label>
                <input
                  id={`${formId}-email`} type="email" value={form.email} style={input}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? `${formId}-email-err` : undefined}
                />
                {errors.email && <p id={`${formId}-email-err`} style={err}>{errors.email}</p>}
              </div>
              <div>
                <label htmlFor={`${formId}-message`} style={label}>What do you need?</label>
                <textarea
                  id={`${formId}-message`} rows={4} value={form.message} style={{ ...input, resize: 'vertical' }}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? `${formId}-message-err` : undefined}
                />
                {errors.message && <p id={`${formId}-message-err`} style={err}>{errors.message}</p>}
              </div>

              <button type="submit" disabled={state === 'submitting'} style={{ ...btn, opacity: state === 'submitting' ? 0.65 : 1, cursor: state === 'submitting' ? 'not-allowed' : 'pointer' }}>
                {state === 'submitting' ? 'Sending…' : 'Send enquiry'}
              </button>

              <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite" style={{ margin: 0, fontSize: 14, minHeight: 20, color: state === 'error' ? '#b42318' : '#067647', fontWeight: 600 }}>
                {state === 'success' && 'Thanks — your enquiry was captured by the demonstration form.'}
                {state === 'error' && 'Something went wrong. Please try again.'}
              </p>
            </form>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: `1px solid ${BRAND.border}`, padding: '28px 24px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', color: BRAND.muted, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, color: BRAND.ink }}>{BRAND.name}</span>
          <span>Sample company for the Xroga AI Showcase.</span>
          <nav aria-label="Footer" style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
            {NAV.slice(0, 4).map((item) => (
              <a key={item.id} href={`#${item.id}`} style={{ color: BRAND.muted, textDecoration: 'none' }}>{item.label}</a>
            ))}
          </nav>
        </div>
      </footer>

      {/* Responsive nav swap without pulling in the app's Tailwind pipeline. */}
      <style>{`
        .nw-menu-btn { display: inline-flex; }
        .nw-desktop-nav { display: none; }
        .nw-desktop-cta { display: none; }
        @media (min-width: 860px) {
          .nw-menu-btn { display: none; }
          .nw-desktop-nav { display: flex !important; }
          .nw-desktop-cta { display: inline-flex !important; margin-left: 8px !important; }
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>
    </div>
  );
}
