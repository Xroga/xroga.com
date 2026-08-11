'use client';

/**
 * Showcase product: Modern Business Website — 2026 redesign.
 *
 * This is a native React reconstruction of the supplied standalone Northwind
 * reference. It remains self-contained so the preview route can be framed by the
 * Xroga Showcase without inheriting the app shell's visual system.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { productReset } from './shared';

const NAV = [
  { id: 'services', label: 'Services' },
  { id: 'work', label: 'Work' },
  { id: 'process', label: 'Process' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
] as const;

const SERVICES = [
  {
    number: '01 / Product',
    title: <>Product<br />design</>,
    body: 'Strategy, user flows, prototypes, interaction design and systems your engineers can actually build from.',
    icon: '⌁',
    tone: 'large',
  },
  {
    number: '02 / Engineering',
    title: 'Web engineering',
    body: 'Fast, accessible front ends and the APIs behind them. Built for real traffic, not a pitch deck.',
    icon: '↗',
    tone: 'lime',
  },
  {
    number: '03 / Platform',
    title: 'Platform work',
    body: 'Migrations, integrations and the invisible plumbing that makes releases feel boring—in the best way.',
    icon: '◎',
    tone: 'sky',
  },
  {
    number: '04 / Retained',
    title: 'Ongoing support',
    body: 'A senior retained team for continuous iteration after launch.',
    icon: '∞',
    tone: 'support',
  },
] as const;

const PROCESS = [
  { number: '01 / DISCOVER', title: 'Frame it.', body: 'Map the problem, constraints, users and the business result that matters.' },
  { number: '02 / DESIGN', title: 'Make it real.', body: 'Flows and interfaces reviewed early with the people who will actually use them.' },
  { number: '03 / BUILD', title: 'Ship weekly.', body: 'Working software in short iterations. Your repository and your infrastructure.' },
  { number: '04 / SUPPORT', title: 'Keep moving.', body: 'Iterate against real usage, remove friction and compound what is working.' },
] as const;

type Plan = {
  name: string;
  price: string;
  suffix?: string;
  body: string;
  features: readonly string[];
  featured?: boolean;
};

const PLANS: readonly Plan[] = [
  {
    name: 'Sprint',
    price: '$6k',
    suffix: '+',
    body: 'Two focused weeks for one clear product problem.',
    features: ['Discovery workshop', 'Design or build', 'Written handover'],
  },
  {
    name: 'Project',
    price: '$24k',
    suffix: '+',
    body: 'End-to-end delivery of a defined product surface.',
    features: ['Full discovery', 'Design + build', 'QA and launch', '30 days support'],
    featured: true,
  },
  {
    name: 'Retained',
    price: 'Monthly',
    body: 'An embedded senior team for continuous iteration.',
    features: ['Dedicated capacity', 'Roadmap planning', 'Priority support'],
  },
];

const FAQS = [
  { question: 'How quickly can you start?', answer: 'Usually within two weeks. Focused sprint engagements can sometimes begin sooner depending on current capacity.' },
  { question: 'Do you work with existing codebases?', answer: 'Yes. Most product work happens inside systems that already carry real users and business logic. We can audit first, then improve incrementally.' },
  { question: 'Who owns the work?', answer: 'You do. Code should land in your repository from the beginning, along with design files and documentation required to maintain it.' },
  { question: 'Can you work with our designers?', answer: 'Absolutely. The engagement can be design-only, engineering-only, or a blended team working directly with your existing product organization.' },
] as const;

function Navbar({ open, menuId, onToggle, onNavigate }: { open: boolean; menuId: string; onToggle: () => void; onNavigate: () => void }) {
  return (
    <div className="mb26-nav-wrap">
      <nav className={`mb26-nav${open ? ' is-open' : ''}`} aria-label="Primary navigation">
        <a href="#top" className="mb26-brand" aria-label="Northwind Studio home" onClick={onNavigate}>
          <span className="mb26-brand-mark" aria-hidden>N</span>
          <span>Northwind®</span>
        </a>
        <div className="mb26-nav-links" id={menuId}>
          {NAV.map((item) => <a key={item.id} href={`#${item.id}`} onClick={onNavigate}>{item.label}</a>)}
        </div>
        <a href="#contact" className="mb26-nav-cta">Book a call ↗</a>
        <button
          type="button"
          className="mb26-menu-btn"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={onToggle}
        >
          <span aria-hidden>{open ? '×' : '☰'}</span>
        </button>
      </nav>
    </div>
  );
}

function SectionHead({ eyebrow, children, description }: { eyebrow: string; children: React.ReactNode; description?: string }) {
  return (
    <div className="mb26-section-head mb26-reveal">
      <div><span className="mb26-eyebrow">{eyebrow}</span><h2>{children}</h2></div>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function Hero() {
  return (
    <section className="mb26-hero">
      <div className="mb26-container mb26-hero-grid">
        <div className="mb26-hero-copy mb26-reveal">
          <div>
            <span className="mb26-eyebrow">Independent digital product studio</span>
            <h1><span>DESIGN.</span><span>BUILD. <em>Ship.</em></span></h1>
          </div>
          <div className="mb26-hero-intro">
            <div className="mb26-small">Small senior teams.<br />Serious product velocity.</div>
            <div>
              <p>We turn ambitious ideas into useful digital products—without the agency theatre, endless handoffs, or six-month reveal.</p>
              <div className="mb26-actions">
                <a className="mb26-btn mb26-btn-primary" href="#contact">Start a project <span aria-hidden>→</span></a>
                <a className="mb26-btn mb26-btn-ghost" href="#work">See selected work</a>
              </div>
            </div>
          </div>
        </div>
        <aside className="mb26-hero-visual mb26-reveal" aria-label="Illustrative project performance visual">
          <div className="mb26-visual-grid" aria-hidden />
          <div className="mb26-visual-top"><span className="mb26-status"><i aria-hidden /> Shipping now</span><span>NWD / 26</span></div>
          <div className="mb26-orb" aria-hidden />
          <div className="mb26-metric mb26-metric-one"><span>Release velocity</span><strong>2.8×</strong><small>Illustrative metric</small></div>
          <div className="mb26-metric mb26-metric-two"><span>Core Web Vitals</span><strong>98.4</strong><small>Sample result</small></div>
          <div className="mb26-visual-bottom"><p>Product design + engineering, from first sketch to stable release.</p><strong>01—04</strong></div>
        </aside>
      </div>
    </section>
  );
}

function Marquee() {
  const labels = ['Product strategy', 'Interface design', 'Web engineering', 'Design systems', 'Platform work', 'AI-enabled products'];
  return <div className="mb26-marquee" aria-hidden><div className="mb26-marquee-track">{[...labels, ...labels].map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div></div>;
}

function Services() {
  return (
    <section className="mb26-section" id="services">
      <div className="mb26-container">
        <SectionHead eyebrow="Capabilities" description="Bring us a fuzzy idea, a stubborn product surface, or an existing platform that needs to move faster.">
          One senior team.<br /><em>Four ways in.</em>
        </SectionHead>
        <div className="mb26-services-grid">
          {SERVICES.map((service) => (
            <article key={service.number} className={`mb26-service-card mb26-service-${service.tone} mb26-reveal`}>
              <span className="mb26-number">{service.number}</span><span className="mb26-service-icon" aria-hidden>{service.icon}</span>
              {service.tone === 'large' ? <div className="mb26-wire" aria-hidden /> : null}
              <h3>{service.title}</h3><p>{service.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductMockup({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`mb26-shot${dark ? ' is-dark' : ''}`} aria-label="Illustrative product interface mockup" role="img">
      <div className="mb26-shot-ui">
        <div className="mb26-shot-bar"><i /><i /><i /></div>
        <div className="mb26-shot-body">
          <div className="mb26-shot-side">{[false, true, false, true].map((short, index) => <span key={index} className={short ? 'is-short' : ''} />)}</div>
          <div className="mb26-shot-main">
            <span className="mb26-shot-kicker">{dark ? 'Patient intake / Step 02' : 'Operations / Live'}</span>
            <strong className="mb26-shot-title">{dark ? 'A calmer path to care.' : 'Fleet overview'}</strong>
            <div className="mb26-chart" aria-hidden />
            <div className="mb26-mini-grid">
              {(dark ? [['02', 'Current step'], ['4m', 'Time remaining'], ['AA', 'WCAG target']] : [['84', 'Active routes'], ['96%', 'On schedule'], ['12m', 'Avg. delay']]).map(([value, label]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Work() {
  const projects = [
    { title: <>Fleet<br />operations.</>, tags: ['Logistics', 'Product design', 'Web app'], body: 'Dispatch, routing and live tracking rebuilt around the decisions operators make every minute.', results: [['−41%', 'dispatch time'], ['+27%', 'on-time loads']], dark: false },
    { title: <>Clinical<br />intake.</>, tags: ['Healthcare', 'UX overhaul', 'Accessibility'], body: 'A nine-step patient intake process reduced to three clear, adaptive screens.', results: [['3.2×', 'faster completion'], ['−63%', 'form abandonment']], dark: true },
  ] as const;
  return (
    <section className="mb26-section" id="work">
      <div className="mb26-container">
        <SectionHead eyebrow="Selected work" description="Illustrative engagements for this Xroga showcase template. Replace with real projects, screenshots and measured outcomes.">
          Less presentation.<br /><em>More proof.</em>
        </SectionHead>
        <div className="mb26-work-stack">
          {projects.map((project, index) => (
            <article key={index} className={`mb26-work-card${project.dark ? ' is-alt' : ''} mb26-reveal`}>
              <div className="mb26-work-info">
                <div><span className="mb26-demo-label">Illustrative demo</span><div className="mb26-tags">{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
                <div><h3>{project.title}</h3><p>{project.body}</p><div className="mb26-results">{project.results.map(([value, label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></div>
              </div>
              <ProductMockup dark={project.dark} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Process() {
  return (
    <section className="mb26-section" id="process"><div className="mb26-container">
      <SectionHead eyebrow="Process" description="Short loops, direct access to the people doing the work, and a working product getting better every week.">Built in the open.<br /><em>No reveal day.</em></SectionHead>
      <ol className="mb26-process-grid mb26-reveal">{PROCESS.map((step) => <li key={step.number}><span className="mb26-step-no">{step.number}</span><span className="mb26-step-arrow" aria-hidden>↘</span><h3>{step.title}</h3><p>{step.body}</p></li>)}</ol>
    </div></section>
  );
}

function Testimonials() {
  return (
    <section className="mb26-section" aria-labelledby="mb26-testimonials"><div className="mb26-container mb26-quote-wrap">
      <div className="mb26-quote-intro mb26-reveal"><span className="mb26-eyebrow">Sample client signal</span><h2 id="mb26-testimonials">Good work<br />gets <em>felt.</em></h2><p>Sample testimonials for the showcase. Replace names and quotes before publishing for a real company.</p></div>
      <div className="mb26-quotes">
        <figure className="mb26-quote-card mb26-reveal"><blockquote>“They shipped the first working version in three weeks—and it already felt like the final product.”</blockquote><figcaption><strong>Sample Reviewer</strong><span>Head of Operations · demo content</span></figcaption></figure>
        <figure className="mb26-quote-card mb26-reveal"><blockquote>“The cleanest outside-team handover we’ve had. No mystery code, no dependency hangover.”</blockquote><figcaption><strong>Sample Reviewer</strong><span>Engineering Lead · demo content</span></figcaption></figure>
      </div>
    </div></section>
  );
}

function Pricing() {
  return (
    <section className="mb26-pricing" id="pricing"><div className="mb26-container">
      <SectionHead eyebrow="Engagements" description="Indicative demo ranges. Every real scope should be quoted after discovery.">Pick a starting point.<br /><em>Not a package trap.</em></SectionHead>
      <div className="mb26-pricing-grid">{PLANS.map((plan) => <article key={plan.name} className={`mb26-price-card${plan.featured ? ' is-featured' : ''} mb26-reveal`}>{plan.featured ? <span className="mb26-popular">Most chosen</span> : null}<span className="mb26-price-name">{plan.name}</span><div className="mb26-price">{plan.price}{plan.suffix ? <small>{plan.suffix}</small> : null}</div><p>{plan.body}</p><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><a className="mb26-btn" href="#contact">{plan.featured ? 'Start a project' : 'Enquire'} →</a></article>)}</div>
    </div></section>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();
  return (
    <section className="mb26-section" id="faq"><div className="mb26-container">
      <SectionHead eyebrow="FAQ">The useful<br /><em>questions.</em></SectionHead>
      <div className="mb26-faq-list mb26-reveal">{FAQS.map((item, index) => {
        const expanded = open === index;
        const panelId = `${baseId}-faq-${index}`;
        return <article key={item.question} className={expanded ? 'is-open' : ''}><button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setOpen(expanded ? null : index)}><span className="mb26-faq-no">{String(index + 1).padStart(2, '0')}</span><span>{item.question}</span><span className="mb26-plus" aria-hidden>+</span></button><div id={panelId} hidden={!expanded}><p>{item.answer}</p></div></article>;
      })}</div>
    </div></section>
  );
}

type ContactState = 'idle' | 'invalid' | 'complete';

function Contact() {
  const [values, setValues] = useState({ name: '', email: '', need: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<ContactState>('idle');
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!values.name.trim()) next.name = 'Please add your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = 'Please add a valid work email.';
    if (values.need.trim().length < 10) next.need = 'Please share a short outline of the problem.';
    setErrors(next);
    setState(Object.keys(next).length ? 'invalid' : 'complete');
  }
  const update = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setState('idle');
  };
  return (
    <section className="mb26-section mb26-contact-section" id="contact"><div className="mb26-container"><div className="mb26-contact-card mb26-reveal">
      <div><span className="mb26-eyebrow">Have a real problem?</span><h2>MAKE IT<br /><em>move.</em></h2><p>Tell us what you are building, what is stuck, and what success needs to look like. This showcase form validates locally and does not transmit data.</p></div>
      <form className="mb26-contact-form" noValidate onSubmit={submit}>
        <div className="mb26-field"><label htmlFor="mb26-name">Name</label><input id="mb26-name" value={values.name} onChange={update('name')} placeholder="Your name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'mb26-name-error' : undefined} />{errors.name ? <small id="mb26-name-error">{errors.name}</small> : null}</div>
        <div className="mb26-field"><label htmlFor="mb26-email">Work email</label><input id="mb26-email" type="email" value={values.email} onChange={update('email')} placeholder="you@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'mb26-email-error' : undefined} />{errors.email ? <small id="mb26-email-error">{errors.email}</small> : null}</div>
        <div className="mb26-field"><label htmlFor="mb26-need">What do you need?</label><textarea id="mb26-need" rows={4} value={values.need} onChange={update('need')} placeholder="A quick outline of the problem…" aria-invalid={Boolean(errors.need)} aria-describedby={errors.need ? 'mb26-need-error' : undefined} />{errors.need ? <small id="mb26-need-error">{errors.need}</small> : null}</div>
        <button className="mb26-btn" type="submit">Send enquiry ↗</button>
        <p className="mb26-form-note" role="status">{state === 'complete' ? 'Demo only — your enquiry was not sent or stored.' : state === 'invalid' ? 'Please review the highlighted fields.' : 'Demo form · no data is transmitted.'}</p>
      </form>
    </div></div></section>
  );
}

function Footer() {
  return <footer className="mb26-footer"><div className="mb26-container mb26-footer-row"><div className="mb26-brand"><span className="mb26-brand-mark" aria-hidden>N</span><span>Northwind® Studio</span></div><div>Sample company for the Xroga AI Showcase · 2026</div><div className="mb26-footer-links"><a href="#services">Services</a><a href="#work">Work</a><a href="#contact">Contact</a></div></div></footer>;
}

export function BusinessWebsite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>('.mb26-reveal')];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        (entry.target as HTMLElement).classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px 80px' });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);

  return (
    <div className="mb26-root" ref={rootRef}>
      <style>{CSS}</style><div className="mb26-noise" aria-hidden />
      <a className="mb26-skip" href="#top">Skip to content</a>
      <Navbar open={menuOpen} menuId={menuId} onToggle={() => setMenuOpen((value) => !value)} onNavigate={() => setMenuOpen(false)} />
      <main id="top"><Hero /><Marquee /><Services /><Work /><Process /><Testimonials /><Pricing /><FAQ /><Contact /></main>
      <Footer />
    </div>
  );
}

const CSS = `
${productReset('.mb26-root')}
.mb26-root{--bg:#0a0b0d;--surface:#111318;--surface-2:#171a20;--ink:#f5f2ea;--muted:#a9adb6;--line:rgba(255,255,255,.12);--lime:#d8ff5a;--sky:#b7dfff;--max:1240px;min-height:100vh;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.5;overflow-x:clip;scroll-behavior:smooth;color-scheme:dark}
.mb26-root *{box-sizing:border-box}.mb26-root a{text-decoration:none}.mb26-root a:not(.mb26-nav-cta):not(.mb26-btn){color:inherit}.mb26-root button,.mb26-root input,.mb26-root textarea{font:inherit}.mb26-root ::selection{background:var(--lime);color:#101110}.mb26-noise{position:fixed;inset:0;pointer-events:none;z-index:9999;opacity:.035;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.85'/%3E%3C/svg%3E")}.mb26-container{width:min(calc(100% - 40px),var(--max));margin-inline:auto}.mb26-section{padding:112px 0}.mb26-root em{font-family:Georgia,"Times New Roman",serif;font-weight:400;font-style:italic;letter-spacing:-.05em}.mb26-skip{position:fixed;left:16px;top:8px;z-index:1200;transform:translateY(-160%);background:var(--lime);color:#101110;padding:10px 14px;border-radius:10px;font-weight:800}.mb26-skip:focus{transform:none}.mb26-root :focus-visible{outline:2px solid var(--lime);outline-offset:3px}
.mb26-eyebrow{display:inline-flex;align-items:center;gap:9px;text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:800;color:#d2d5da}.mb26-eyebrow:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--lime);box-shadow:0 0 18px rgba(216,255,90,.8)}.mb26-section-head{display:flex;justify-content:space-between;gap:48px;align-items:end;margin-bottom:46px}.mb26-section-head h2{font-size:clamp(40px,6vw,76px);letter-spacing:-.055em;line-height:.94;margin:10px 0 0;max-width:800px;font-weight:740}.mb26-section-head p{color:var(--muted);max-width:440px;margin:0;font-size:17px}
.mb26-nav-wrap{position:fixed;top:18px;left:0;right:0;z-index:1000;pointer-events:none}.mb26-nav{position:relative;width:min(calc(100% - 40px),var(--max));margin:auto;background:rgba(14,15,18,.72);border:1px solid rgba(255,255,255,.11);backdrop-filter:blur(18px) saturate(150%);border-radius:18px;display:flex;align-items:center;justify-content:space-between;padding:10px 10px 10px 16px;box-shadow:0 14px 50px rgba(0,0,0,.18);pointer-events:auto}.mb26-brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-.03em}.mb26-brand-mark{width:30px;height:30px;border-radius:10px;background:var(--lime);color:#0e100c;display:grid;place-items:center;font-size:14px;transform:rotate(-4deg);flex:none}.mb26-nav-links{display:flex;align-items:center;gap:6px}.mb26-nav-links a{font-size:14px;color:#c4c7ce;padding:9px 12px;border-radius:11px;transition:background .25s ease,color .25s ease}.mb26-nav-links a:hover{background:rgba(255,255,255,.06);color:white}.mb26-nav-cta,.mb26-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;border-radius:13px;padding:12px 16px;background:var(--ink);color:#0d0e10;font-weight:800;font-size:14px;border:1px solid transparent;cursor:pointer;transition:transform .25s ease,box-shadow .25s ease,background .25s ease}.mb26-nav-cta:hover,.mb26-btn:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(255,255,255,.08)}.mb26-menu-btn{display:none;width:42px;height:42px;border:0;border-radius:12px;background:#1d2026;color:white;font-size:20px;cursor:pointer}
.mb26-hero{padding:172px 0 44px;position:relative;isolation:isolate}.mb26-hero:before{content:"";position:absolute;z-index:-1;width:680px;height:680px;border-radius:50%;background:radial-gradient(circle,rgba(126,200,255,.16),transparent 67%);top:-170px;right:-170px;filter:blur(10px)}.mb26-hero-grid{display:grid;grid-template-columns:minmax(0,1.13fr) minmax(380px,.87fr);gap:28px;align-items:stretch}.mb26-hero-copy{min-height:650px;padding:34px 0 20px;display:flex;flex-direction:column;justify-content:space-between}.mb26-hero h1{font-size:clamp(64px,8.6vw,124px);line-height:.8;letter-spacing:-.075em;margin:26px 0 28px;font-weight:760;max-width:920px}.mb26-hero h1>span{display:block}.mb26-hero h1 em{color:var(--lime);display:inline-block;transform:rotate(-2deg)}.mb26-hero-intro{display:grid;grid-template-columns:1fr 1.15fr;gap:38px;align-items:end;border-top:1px solid var(--line);padding-top:24px}.mb26-small{color:#7f848e;font-size:13px;text-transform:uppercase;letter-spacing:.11em;font-weight:700}.mb26-hero-intro p{margin:0;color:#c1c4cb;font-size:18px;max-width:520px}.mb26-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.mb26-btn-primary{background:var(--lime);color:#0e100c;padding:15px 20px}.mb26-btn-ghost{background:transparent;color:var(--ink);border-color:var(--line);padding:14px 20px}
.mb26-hero-visual{border-radius:34px;overflow:hidden;position:relative;background:linear-gradient(155deg,#1a1d24,#0c0e12 66%);border:1px solid var(--line);min-height:650px;box-shadow:0 24px 80px rgba(0,0,0,.28)}.mb26-visual-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(to bottom,black,transparent 94%)}.mb26-visual-top{position:absolute;top:26px;left:26px;right:26px;display:flex;justify-content:space-between;align-items:center;z-index:2;font-size:12px;color:#7f848e}.mb26-status{font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:8px 11px;border:1px solid var(--line);border-radius:999px;background:rgba(10,11,13,.5);color:var(--ink)}.mb26-status i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--lime);margin-right:7px;box-shadow:0 0 12px rgba(216,255,90,.8)}.mb26-orb{position:absolute;width:350px;height:350px;border-radius:50%;top:115px;left:50%;transform:translateX(-50%);background:radial-gradient(circle at 35% 30%,#fff7d2 0 4%,#d8ff5a 7%,#69a832 33%,#1b4a21 58%,#0c1112 74%);box-shadow:0 0 100px rgba(216,255,90,.22),inset -42px -40px 70px rgba(0,0,0,.5);animation:mb26-float 6s ease-in-out infinite}.mb26-orb:after{content:"";position:absolute;inset:-28px;border-radius:50%;border:1px solid rgba(216,255,90,.24);transform:rotateX(72deg);box-shadow:0 0 50px rgba(216,255,90,.1)}@keyframes mb26-float{50%{transform:translateX(-50%) translateY(-14px) rotate(3deg)}}.mb26-metric{position:absolute;z-index:3;background:rgba(18,20,25,.72);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:17px 18px;box-shadow:0 20px 50px rgba(0,0,0,.28)}.mb26-metric-one{right:25px;top:280px;width:170px}.mb26-metric-two{left:25px;top:420px;width:186px}.mb26-metric span{font-size:11px;color:#989da7;text-transform:uppercase;letter-spacing:.1em;font-weight:800}.mb26-metric strong{display:block;font-size:30px;letter-spacing:-.05em;margin-top:5px}.mb26-metric small{color:var(--lime);font-weight:700}.mb26-visual-bottom{position:absolute;left:26px;right:26px;bottom:26px;border-top:1px solid var(--line);padding-top:20px;display:flex;justify-content:space-between;gap:20px;align-items:end}.mb26-visual-bottom p{margin:0;color:#b8bcc5;font-size:13px;max-width:250px}.mb26-visual-bottom strong{font-size:40px;letter-spacing:-.06em}
.mb26-marquee{border-block:1px solid var(--line);overflow:hidden;background:#0d0f12}.mb26-marquee-track{display:flex;gap:46px;width:max-content;padding:16px 0;animation:mb26-marquee 25s linear infinite;color:#b9bdc5;text-transform:uppercase;font-weight:800;letter-spacing:.12em;font-size:12px}.mb26-marquee-track span:after{content:"✦";color:var(--lime);margin-left:46px}@keyframes mb26-marquee{to{transform:translateX(-50%)}}
.mb26-services-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:16px}.mb26-service-card{min-height:350px;border:1px solid var(--line);border-radius:28px;padding:30px;background:var(--surface);position:relative;overflow:hidden;transition:transform .35s ease,border-color .35s ease}.mb26-service-card:hover{transform:translateY(-5px);border-color:rgba(216,255,90,.35)}.mb26-service-large{grid-row:span 2;min-height:716px;background:linear-gradient(160deg,#171a20,#0d0f12)}.mb26-service-lime{background:var(--lime);color:#11130e;border-color:transparent}.mb26-service-sky{background:var(--sky);color:#111316;border-color:transparent}.mb26-number{font-size:12px;font-weight:900;letter-spacing:.11em;opacity:.55}.mb26-service-card h3{font-size:clamp(30px,4vw,52px);letter-spacing:-.055em;line-height:.98;margin:115px 0 14px}.mb26-service-large h3{font-size:clamp(52px,6vw,84px);margin-top:260px}.mb26-service-support h3{margin-top:100px}.mb26-service-card p{max-width:440px;margin:0;opacity:.7;font-size:16px}.mb26-service-icon{position:absolute;right:24px;top:24px;width:58px;height:58px;border-radius:18px;border:1px solid currentColor;opacity:.7;display:grid;place-items:center;font-size:28px}.mb26-wire{position:absolute;inset:85px -80px auto auto;width:330px;height:330px;border:1px solid rgba(255,255,255,.14);border-radius:50%;box-shadow:0 0 0 42px rgba(255,255,255,.025),0 0 0 84px rgba(255,255,255,.018)}
.mb26-work-stack{display:grid;gap:18px}.mb26-work-card{min-height:560px;border:1px solid var(--line);border-radius:32px;overflow:hidden;display:grid;grid-template-columns:.8fr 1.2fr;background:#111318}.mb26-work-info{padding:36px;display:flex;flex-direction:column;justify-content:space-between}.mb26-demo-label{display:inline-block;margin-bottom:12px;color:var(--lime);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.mb26-tags{display:flex;gap:7px;flex-wrap:wrap}.mb26-tags span{padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.07);font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;color:#c6cad1}.mb26-work-info h3{font-size:clamp(42px,5vw,70px);line-height:.92;letter-spacing:-.06em;margin:0 0 18px}.mb26-work-info p{color:#aeb2ba;max-width:390px;margin:0}.mb26-results{display:flex;gap:34px;margin-top:34px}.mb26-results strong{font-size:28px;display:block;letter-spacing:-.04em}.mb26-results span{font-size:11px;color:#8f949f;text-transform:uppercase;letter-spacing:.08em}.mb26-shot{margin:22px 22px 22px 0;border-radius:23px;overflow:hidden;position:relative;background:#eef1e9;color:#131513;min-height:516px}.mb26-shot-ui{position:absolute;inset:34px;border-radius:18px;background:#fff;box-shadow:0 30px 80px rgba(17,22,18,.15);overflow:hidden;border:1px solid rgba(20,30,20,.08)}.mb26-shot-bar{height:48px;border-bottom:1px solid #e7e9e3;display:flex;align-items:center;gap:7px;padding:0 16px}.mb26-shot-bar i{width:8px;height:8px;border-radius:50%;background:#d6d9d2}.mb26-shot-body{display:grid;grid-template-columns:130px 1fr;height:calc(100% - 48px)}.mb26-shot-side{background:#f6f7f3;border-right:1px solid #e7e9e3;padding:18px 12px}.mb26-shot-side span{display:block;height:9px;background:#e4e7df;border-radius:99px;margin-bottom:12px}.mb26-shot-side .is-short{width:65%}.mb26-shot-main{padding:28px}.mb26-shot-kicker{font-size:11px;color:#6f756b;text-transform:uppercase;letter-spacing:.12em}.mb26-shot-title{display:block;font-size:32px;font-weight:800;letter-spacing:-.06em;margin:8px 0 20px}.mb26-chart{height:180px;border-radius:14px;background:linear-gradient(180deg,#f1ffd1,#fff);position:relative;overflow:hidden}.mb26-chart:before{content:"";position:absolute;inset:35px 10px 20px;background:linear-gradient(150deg,transparent 0 36%,#87a61d 37% 39%,transparent 40% 52%,#87a61d 53% 55%,transparent 56%);opacity:.75}.mb26-mini-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}.mb26-mini-grid>div{height:82px;border:1px solid #e4e8de;border-radius:12px;padding:12px}.mb26-mini-grid b{font-size:20px}.mb26-mini-grid span{display:block;font-size:10px;color:#777d72}.mb26-shot.is-dark{background:#171e32}.mb26-shot.is-dark .mb26-shot-ui{background:#0f1422;border-color:#27304b;color:#fff}.mb26-shot.is-dark .mb26-shot-bar,.mb26-shot.is-dark .mb26-shot-side{border-color:#28304b}.mb26-shot.is-dark .mb26-shot-side{background:#121827}.mb26-shot.is-dark .mb26-shot-side span{background:#27304b}.mb26-shot.is-dark .mb26-chart{background:linear-gradient(180deg,#272e55,#111525)}.mb26-shot.is-dark .mb26-chart:before{filter:hue-rotate(140deg)}.mb26-shot.is-dark .mb26-mini-grid>div{border-color:#28304b}.mb26-shot.is-dark .mb26-shot-kicker,.mb26-shot.is-dark .mb26-mini-grid span{color:#8e98bb}
.mb26-process-grid{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);margin:0;padding:0;list-style:none}.mb26-process-grid li{padding:28px 22px 20px 0;border-right:1px solid var(--line);min-height:300px;position:relative}.mb26-process-grid li:not(:first-child){padding-left:22px}.mb26-process-grid li:last-child{border-right:0}.mb26-step-no{font-size:11px;letter-spacing:.13em;font-weight:900;color:#818691}.mb26-process-grid h3{font-size:31px;letter-spacing:-.05em;margin:130px 0 11px}.mb26-process-grid p{margin:0;color:#969ba5;font-size:14px;max-width:240px}.mb26-step-arrow{position:absolute;top:27px;right:22px;font-size:20px;color:var(--lime)}
.mb26-quote-wrap{display:grid;grid-template-columns:.74fr 1.26fr;gap:18px}.mb26-quote-intro{border-radius:30px;padding:34px;background:var(--lime);color:#11140d;min-height:520px;display:flex;flex-direction:column;justify-content:space-between}.mb26-quote-intro .mb26-eyebrow{color:#11130f}.mb26-quote-intro h2{font-size:clamp(48px,6vw,80px);line-height:.92;letter-spacing:-.065em;margin:0}.mb26-quote-intro p{max-width:340px}.mb26-quotes{display:grid;grid-template-rows:1fr 1fr;gap:18px}.mb26-quote-card{border:1px solid var(--line);border-radius:30px;padding:34px;display:flex;flex-direction:column;justify-content:space-between;min-height:251px;background:var(--surface);margin:0}.mb26-quote-card blockquote{margin:0;font-size:clamp(24px,3vw,38px);line-height:1.08;letter-spacing:-.04em;max-width:720px}.mb26-quote-card figcaption{display:flex;justify-content:space-between;color:#989da6;font-size:13px;margin-top:30px;gap:18px}.mb26-quote-card figcaption strong{color:#f0f1f2}
.mb26-pricing{background:#f0ede4;color:#111310;border-radius:44px;margin:0 16px;padding:94px 0}.mb26-pricing .mb26-eyebrow{color:#333930}.mb26-pricing .mb26-section-head p{color:#5f655d}.mb26-pricing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.mb26-price-card{background:#fff;border:1px solid #dcded6;border-radius:25px;padding:26px;min-height:455px;display:flex;flex-direction:column;position:relative}.mb26-price-card.is-featured{background:#11130f;color:#f5f2ea;border-color:#11130f;transform:translateY(-12px)}.mb26-popular{position:absolute;top:20px;right:20px;background:var(--lime);color:#11130f;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.mb26-price-name{font-size:14px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}.mb26-price{font-size:55px;letter-spacing:-.07em;line-height:1;margin:28px 0 10px}.mb26-price small{font-size:16px;letter-spacing:0}.mb26-price-card:last-child .mb26-price{font-size:48px}.mb26-price-card p{color:#6d726a;margin:0 0 30px;min-height:48px}.mb26-price-card.is-featured p{color:#a7aca2}.mb26-price-card ul{list-style:none;padding:0;margin:0 0 30px;display:grid;gap:11px}.mb26-price-card li:before{content:"↳";margin-right:9px;color:#879100}.mb26-price-card.is-featured li:before{color:var(--lime)}.mb26-price-card .mb26-btn{margin-top:auto;background:#11130f;color:#fff}.mb26-price-card.is-featured .mb26-btn{background:var(--lime);color:#11130f}
.mb26-faq-list{border-top:1px solid var(--line)}.mb26-faq-list article{border-bottom:1px solid var(--line)}.mb26-faq-list button{width:100%;border:0;background:none;color:var(--ink);cursor:pointer;display:grid;grid-template-columns:54px 1fr 40px;align-items:center;padding:28px 0;font-size:25px;letter-spacing:-.035em;text-align:left}.mb26-faq-no{font-size:11px;color:#7f848e;letter-spacing:.1em}.mb26-plus{font-size:24px;transition:transform .25s ease;text-align:right;color:var(--lime)}.mb26-faq-list .is-open .mb26-plus{transform:rotate(45deg)}.mb26-faq-list article>div p{color:#9ea3ad;max-width:720px;margin:0 0 30px 54px;font-size:16px}
.mb26-contact-section{padding-top:40px}.mb26-contact-card{border-radius:36px;padding:54px;background:linear-gradient(135deg,#d8ff5a,#f5ffce 58%,#cdefff);color:#11130f;display:grid;grid-template-columns:1fr .8fr;gap:50px;align-items:end;position:relative;overflow:hidden}.mb26-contact-card:after{content:"";position:absolute;width:330px;height:330px;border:1px solid rgba(17,19,15,.13);border-radius:50%;right:-80px;top:-120px;box-shadow:0 0 0 40px rgba(17,19,15,.04),0 0 0 80px rgba(17,19,15,.025)}.mb26-contact-card h2{font-size:clamp(55px,8vw,104px);line-height:.82;letter-spacing:-.075em;margin:16px 0 0;position:relative;z-index:1}.mb26-contact-card p{max-width:500px;position:relative;z-index:1}.mb26-contact-card .mb26-eyebrow{color:#11130f}.mb26-contact-form{position:relative;z-index:2;background:rgba(255,255,255,.7);border:1px solid rgba(17,19,15,.12);border-radius:24px;padding:22px;backdrop-filter:blur(12px)}.mb26-field{display:grid;gap:7px;margin-bottom:12px}.mb26-field label{font-size:11px;text-transform:uppercase;letter-spacing:.09em;font-weight:850;color:#5f6657}.mb26-field input,.mb26-field textarea{width:100%;border:1px solid rgba(17,19,15,.13);background:rgba(255,255,255,.68);border-radius:13px;padding:12px 14px;outline:none;color:#11130f;resize:vertical}.mb26-field input:focus,.mb26-field textarea:focus{border-color:#11130f;box-shadow:0 0 0 3px rgba(17,19,15,.12)}.mb26-field [aria-invalid=true]{border-color:#a51e1e}.mb26-field small{color:#8a1515;font-size:11px}.mb26-contact-form .mb26-btn{width:100%;background:#11130f;color:#fff;padding:14px}.mb26-form-note{margin:10px 2px 0;font-size:11px;color:#596250;min-height:16px}
.mb26-footer{padding:34px 0 48px}.mb26-footer-row{border-top:1px solid var(--line);padding-top:28px;display:flex;justify-content:space-between;gap:20px;align-items:center;color:#858a94;font-size:12px}.mb26-footer-links{display:flex;gap:18px}.mb26-footer-links a:hover{color:white}
.mb26-reveal{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1)}.mb26-reveal.is-visible{opacity:1;transform:none}
@media(max-width:980px){.mb26-nav-links{display:none}.mb26-menu-btn{display:block}.mb26-nav.is-open .mb26-nav-links{display:flex;position:absolute;top:62px;left:0;right:0;background:#121419;border:1px solid var(--line);border-radius:16px;padding:10px;flex-direction:column;align-items:stretch}.mb26-nav.is-open .mb26-nav-links a{padding:12px}.mb26-nav-cta{display:none}.mb26-hero-grid{grid-template-columns:1fr}.mb26-hero-copy{min-height:auto}.mb26-hero-visual{min-height:620px}.mb26-hero-intro{grid-template-columns:1fr}.mb26-section{padding:86px 0}.mb26-section-head{align-items:start;flex-direction:column;gap:18px}.mb26-services-grid{grid-template-columns:1fr}.mb26-service-large{grid-row:auto;min-height:500px}.mb26-service-large h3{margin-top:220px}.mb26-work-card{grid-template-columns:1fr}.mb26-shot{margin:0 22px 22px;min-height:470px}.mb26-process-grid{grid-template-columns:1fr 1fr}.mb26-process-grid li:nth-child(2){border-right:0}.mb26-process-grid li{border-bottom:1px solid var(--line)}.mb26-quote-wrap{grid-template-columns:1fr}.mb26-pricing-grid{grid-template-columns:1fr}.mb26-price-card.is-featured{transform:none}.mb26-contact-card{grid-template-columns:1fr}.mb26-pricing{margin:0 8px}}
@media(max-width:620px){.mb26-container,.mb26-nav{width:min(calc(100% - 24px),var(--max))}.mb26-nav-wrap{top:10px}.mb26-hero{padding-top:124px}.mb26-hero h1{font-size:clamp(58px,18vw,92px)}.mb26-hero-intro p{font-size:16px}.mb26-hero-visual{min-height:520px}.mb26-orb{width:270px;height:270px;top:110px}.mb26-metric-two{top:360px}.mb26-metric-one{top:230px}.mb26-visual-bottom strong{font-size:31px}.mb26-section{padding:68px 0}.mb26-section-head h2{font-size:48px}.mb26-service-card{min-height:320px;padding:24px}.mb26-service-card h3{margin-top:100px}.mb26-service-large{min-height:440px}.mb26-service-large h3{margin-top:190px}.mb26-work-card{min-height:auto}.mb26-work-info{padding:26px}.mb26-shot{min-height:390px;margin:0 12px 12px}.mb26-shot-ui{inset:18px}.mb26-shot-body{grid-template-columns:92px 1fr}.mb26-shot-main{padding:18px}.mb26-shot-title{font-size:24px}.mb26-mini-grid{grid-template-columns:1fr}.mb26-mini-grid>div:nth-child(n+2){display:none}.mb26-process-grid{grid-template-columns:1fr}.mb26-process-grid li{border-right:0!important;padding:24px 0!important;min-height:220px}.mb26-process-grid h3{margin-top:85px}.mb26-quote-intro,.mb26-quote-card{padding:26px}.mb26-quote-card figcaption{flex-direction:column}.mb26-pricing{border-radius:28px;padding:68px 0}.mb26-contact-card{padding:28px;border-radius:28px}.mb26-contact-card h2{font-size:59px}.mb26-faq-list button{grid-template-columns:38px 1fr 30px;font-size:20px}.mb26-faq-list article>div p{margin-left:38px}.mb26-footer-row{align-items:flex-start;flex-direction:column}.mb26-results{gap:20px;flex-wrap:wrap}}
@media(prefers-reduced-motion:reduce){.mb26-root{scroll-behavior:auto}.mb26-root *,.mb26-root *:before,.mb26-root *:after{animation:none!important;transition:none!important}.mb26-reveal{opacity:1;transform:none}.mb26-service-card:hover,.mb26-btn:hover{transform:none}}
`;
