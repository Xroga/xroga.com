'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, Code2, FileText,
  Globe2, Search, ShieldCheck, Workflow
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';

const capabilityModes = [
  {
    label: 'Build software', icon: Code2, index: '01',
    headline: 'From an idea to an inspectable project.',
    body: 'Describe what you want to make. Work within an authorized repository. Review changes, validation and what still needs your decision.',
    tokens: ['Define outcome', 'Inspect project', 'Make changes', 'Review evidence'],
    outcome: 'Working code + a reviewable handoff',
  },
  {
    label: 'Research', icon: Search, index: '02',
    headline: 'Turn questions into grounded understanding.',
    body: 'Explore a problem, compare sources, synthesize findings and keep the evidence separate from the assumptions.',
    tokens: ['Ask', 'Find evidence', 'Compare', 'Synthesize'],
    outcome: 'A sourced, actionable answer',
  },
  {
    label: 'Browser & apps', icon: Globe2, index: '03',
    headline: 'Connect the places where work happens.',
    body: 'With appropriate connections and permission, move across supported tools and websites instead of switching between disconnected tasks.',
    tokens: ['Authorize', 'Navigate', 'Act', 'Verify'],
    outcome: 'A supervised connected workflow',
  },
  {
    label: 'Files & artifacts', icon: FileText, index: '04',
    headline: 'Make useful things, not just messages.',
    body: 'Turn information into documents, structured deliverables and other practical outputs, while keeping ownership and review in human hands.',
    tokens: ['Collect', 'Structure', 'Create', 'Inspect'],
    outcome: 'An editable deliverable',
  },
  {
    label: 'Operations', icon: Workflow, index: '05',
    headline: 'Less switching. More completed work.',
    body: 'Plan multi-step processes across appropriate capabilities, with explicit checkpoints for spending, external effects and approvals.',
    tokens: ['Plan', 'Coordinate', 'Check', 'Deliver'],
    outcome: 'An accountable task trail',
  },
] as const;

type ArtProps = {
  src: string;
  alt?: string;
  className?: string;
  eager?: boolean;
  objectPosition?: string;
};

/** Image sources here already exist in this repository. A matching reference asset can replace each source later. */
function Art({ src, alt = '', className = '', eager = false, objectPosition }: ArtProps) {
  return (
    <div className={'bh-art ' + className} aria-hidden={alt ? undefined : true}>
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        priority={eager}
        sizes="(max-width: 800px) 100vw, 70vw"
        className="bh-art-image"
        style={objectPosition ? { objectPosition } : undefined}
      />
    </div>
  );
}

function Overline({ n, children }: { n: string; children: ReactNode }) {
  return <p className="bh-overline"><span>{n}</span><i aria-hidden="true" />{children}</p>;
}

export function BlackHoleExperience() {
  const root = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [capabilityIndex, setCapabilityIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const capability = capabilityModes[capabilityIndex];

  useEffect(() => {
    const parent = root.current;
    if (!parent || typeof IntersectionObserver === 'undefined') return;
    const sections = [...parent.querySelectorAll<HTMLElement>('[data-chapter]')];
    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-revealed', 'true');
          }
        }
      },
      { rootMargin: '-12% 0px -30% 0px', threshold: [0, 0.2, 0.45] }
    );
    sections.forEach(section => io.observe(section));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let scheduled = false;
    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        setProgress(Math.min(100, Math.round((window.scrollY / total) * 100)));
        scheduled = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const onHeroMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'touch' || !hero.current) return;
    const rect = hero.current.getBoundingClientRect();
    hero.current.style.setProperty('--bh-x', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
    hero.current.style.setProperty('--bh-y', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
  };

  return (
    <div className="bh-page" ref={root}>
      <a className="bh-skip" href="#main-story">Skip to main content</a>
      <div className="bh-grain" aria-hidden="true" />
      <div className="bh-progress" role="presentation"><span style={{ width: progress + '%' }} /></div>

      <main id="main-story">
        <section className="bh-hero bh-chapter" id="encounter" ref={hero} onPointerMove={onHeroMove} data-chapter data-revealed="true">
          <Art src="/black-hole/particle-wave.svg" className="bh-hero-wave" eager />
          <div className="bh-hero-wave-shade" aria-hidden="true" />
          <div className="bh-hero-metadata" aria-hidden="true"><span>XROGA / BLACK HOLE</span><span>MODEL EXPERIENCE · V INFINITY</span></div>
          <div className="bh-wrap bh-hero-content">
            <Overline n="XROGA / 001">AN INTELLIGENCE IN EVOLUTION</Overline>
            <h1>BLACK HOLE <em>V</em><br/><span>INFINITY</span><span className="bh-title-period">.</span></h1>
            <p className="bh-hero-lead">Beyond a single prompt.<br/><strong>Built to work with humanity.</strong></p>
            <p className="bh-copy bh-hero-copy">One continuously evolving intelligence experience, designed to help turn human intention into meaningful, verifiable work.</p>
            <div className="bh-actions">
              <a href="#question" className="bh-button bh-button-light">Explore the vision <ArrowDown size={17}/></a>
              <Link href="/auth/signup" className="bh-button bh-button-ghost">Enter XROGA <ArrowUpRight size={16}/></Link>
            </div>
          </div>
          <div className="bh-hero-bottom bh-wrap"><span>HUMAN-DIRECTED / OUTCOME-FOCUSED</span><a href="#question" aria-label="Scroll to the question">SCROLL TO EXPLORE <ArrowDown size={16}/></a><span>01 / 12</span></div>
        </section>

        <section className="bh-chapter bh-question" id="question" data-chapter>
          <div className="bh-question-silver" aria-hidden="true"/>
          <Art src="/black-hole/references/code-consciousness.webp" className="bh-question-art" />
          <div className="bh-wrap bh-question-layout">
            <div className="bh-intro-column">
              <Overline n="02 / THE QUESTION">THE WORLD IS CHANGING</Overline>
              <h2>If intelligence can do more,<br/><em>what happens to us?</em></h2>
              <p className="bh-copy">People are right to wonder what AI will change about work. Some tasks and jobs will change profoundly. Our answer is not to remove humanity from the process.</p>
              <p className="bh-feature-line">The future should happen <strong>with people.</strong> Not without them.</p>
            </div>
            <div className="bh-visual-statement"><div className="bh-visual-noise" aria-hidden="true"/><span>HUMAN<br/>POTENTIAL</span><i aria-hidden="true">≠</i><strong>OBSOLETE</strong></div>
          </div>
        </section>

        <section className="bh-chapter bh-partnership" id="partnership" data-chapter>
          <div className="bh-wrap">
            <Overline n="03 / THE CONNECTION">TWO DIFFERENT STRENGTHS</Overline>
            <h2>HUMAN PURPOSE.<br/><span>MACHINE CAPABILITY.</span></h2>
            <p className="bh-copy bh-narrow">Humans bring intention, values, imagination and judgment. Intelligence provides tools, reasoning support and execution. The strongest work happens when each plays its proper part.</p>
            <div className="bh-touch-scene" aria-label="An artistic representation of human and machine collaboration" role="img">
              <Art src="/black-hole/references/human-machine.webp" className="bh-touch-art"/>
              <svg className="bh-touch-orbit" viewBox="0 0 900 330" aria-hidden="true">
                <defs><radialGradient id="bhglow"><stop offset="0" stopColor="#d8edff" stopOpacity=".9"/><stop offset="1" stopColor="#d8edff" stopOpacity="0"/></radialGradient></defs>
                <ellipse cx="450" cy="160" rx="180" ry="75" fill="none" stroke="white" strokeOpacity=".23" strokeWidth=".8"/>
                <ellipse cx="450" cy="160" rx="280" ry="123" fill="none" stroke="white" strokeOpacity=".08" strokeWidth=".8" transform="rotate(17 450 160)"/>
                <circle cx="450" cy="160" r="48" fill="url(#bhglow)"/>
                <path d="M112 240 C228 240 279 175 423 160" stroke="#d9e9f7" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <path d="M784 78 C681 99 578 143 477 160" stroke="#d9e9f7" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <circle cx="450" cy="160" r="4" fill="white"/>
                <circle cx="450" cy="160" r="18" fill="none" stroke="white" strokeOpacity=".3"/>
              </svg>
              <span className="bh-touch-caption bh-touch-caption--left">HUMAN<br/><b>THE WHY</b></span>
              <span className="bh-touch-caption bh-touch-caption--right">INTELLIGENCE<br/><b>THE HOW</b></span>
            </div>
            <div className="bh-partnership-bottom"><span>THE HUMAN DECIDES WHAT MATTERS.</span><span>THE SYSTEM HELPS MAKE IT HAPPEN.</span></div>
          </div>
        </section>

        <section className="bh-chapter bh-origin" id="origin" data-chapter>
          <Art src="/black-hole/references/human-code.webp" className="bh-origin-back"/>
          <div className="bh-wrap bh-origin-grid">
            <div className="bh-origin-visual"><div className="bh-origin-mask" aria-hidden="true"/><div className="bh-origin-counter">0<span>→</span>1<small>ORIGIN OF AN IDEA</small></div></div>
            <div className="bh-origin-copy">
              <Overline n="04 / THE ORIGIN">WHY THIS EXISTS</Overline>
              <h2>WITHOUT AI,<br/>XROGA WOULD<br/><em>NOT EXIST.</em></h2>
              <p className="bh-copy">For our founder, that is not a slogan. AI made it possible to attempt work, develop software and bring ideas to life that previously felt beyond reach.</p>
              <p className="bh-copy">Things that used to demand far more time and expertise can now be approached differently. The greatest advantage belongs to people who learn to work thoughtfully with these tools.</p>
              <blockquote>“AI did not take away our reason to build. It gave us a way to begin.”</blockquote>
              <Link className="bh-text-link" href="/about">Read the founder&apos;s story <ArrowUpRight size={17}/></Link>
            </div>
          </div>
        </section>

        <section className="bh-chapter bh-work" id="work" data-chapter>
          <Art src="/black-hole/references/code-black-hole.webp" className="bh-work-background"/>
          <div className="bh-wrap bh-work-layout">
            <div className="bh-work-copy">
              <Overline n="05 / FROM INTENT TO OUTCOME">LET THE WORK SPEAK</Overline>
              <h2>DON&apos;T JUST ASK.<br/><em>MAKE SOMETHING REAL.</em></h2>
              <p className="bh-copy">Describe an objective. Connect tools you trust. Follow the work. Review evidence. Decide what ships.</p>
              <Link href="/auth/signup" className="bh-button bh-button-light">Start building <ArrowUpRight size={16}/></Link>
            </div>
            <div className="bh-orbit-console" aria-label="Illustrative outcome workflow">
              <div className="bh-console-top"><span>ILLUSTRATIVE WORKFLOW</span><span>VIEW / 001</span></div>
              <div className="bh-console-main"><div className="bh-console-head">Make a useful product from an idea<span className="bh-console-cursor">_</span></div>
                <div className="bh-console-line"><Check size={14}/> Understand the goal</div>
                <div className="bh-console-line"><Check size={14}/> Plan the work</div>
                <div className="bh-console-line"><Check size={14}/> Inspect and change the project</div>
                <div className="bh-console-line"><ShieldCheck size={14}/> Verify and request review</div>
              </div>
              <div className="bh-console-bottom"><span><i/> HUMAN APPROVAL</span><span>REQUIRED FOR CONSEQUENTIAL ACTIONS</span></div>
            </div>
          </div>
        </section>

        <section className="bh-chapter bh-capabilities" id="capabilities" data-chapter>
          <div className="bh-wrap">
            <div className="bh-section-split-heading"><div><Overline n="06 / MANY FORMS OF WORK">CONNECTED CAPABILITIES</Overline><h2>THE WORK DOESN&apos;T<br/><em>FIT IN ONE BOX.</em></h2></div><p className="bh-copy">Software. Research. Browser tasks. Files. Operations. XROGA is being built to bring the capabilities needed for a goal into one work experience.</p></div>
            <div className="bh-capability-explorer">
              <div className="bh-capability-nav" aria-label="Choose a capability">
                {capabilityModes.map((mode, i) => {
                  const Icon = mode.icon;
                  return <button key={mode.label} type="button" aria-pressed={capabilityIndex === i} className={capabilityIndex === i ? 'is-active' : ''} onClick={() => setCapabilityIndex(i)}><span>{mode.index}</span><Icon size={19} aria-hidden="true"/><b>{mode.label}</b><ArrowUpRight size={17} aria-hidden="true"/></button>;
                })}
              </div>
              <div className="bh-capability-detail" aria-live="polite">
                <div className="bh-capability-detail-top"><span>XROGA / CAPABILITY {capability.index}</span><span>HUMAN-DIRECTED</span></div>
                <div className="bh-diagram" aria-hidden="true"><span className="bh-diagram-rings"/><span className="bh-diagram-node bh-diagram-node--a">INTENT</span><span className="bh-diagram-node bh-diagram-node--b">TOOLS</span><span className="bh-diagram-node bh-diagram-node--c">OUTCOME</span><i className="bh-diagram-beam"/></div>
                <h3>{capability.headline}</h3><p>{capability.body}</p>
                <div className="bh-token-list">{capability.tokens.map((step,i)=><span key={step}>{String(i+1).padStart(2, '0')} / {step}</span>)}</div>
                <div className="bh-capability-outcome"><span>DESIRED RESULT</span><strong>{capability.outcome}</strong></div>
              </div>
            </div>
            <p className="bh-explorer-note">These are product directions and supported-work examples, not a guarantee that every task or integration is available today. Actual execution depends on the connected tools and verified capabilities.</p>
          </div>
        </section>

        <section className="bh-chapter bh-trust" id="trust" data-chapter>
          <div className="bh-wrap bh-trust-grid">
            <div>
              <Overline n="07 / THE CONTROL LAYER">RELIABILITY OVER HYPE</Overline>
              <h2>POWERFUL WORK.<br/><em>HUMAN CONTROL.</em></h2>
              <p className="bh-copy">Trust is not a glowing answer on a screen. It means clear permissions, visible work, independent evidence, and meaningful control over what happens next.</p>
            </div>
            <div className="bh-trust-system">
              <div className="bh-system-heading"><span>EXECUTION CONTRACT / CONCEPTUAL</span><ShieldCheck size={19}/></div>
              <div className="bh-workflow-rail">
                {['Intent','Plan','Act','Verify','Review'].map((step,i)=><div className="bh-workflow-node" key={step}><span>{String(i+1).padStart(2,'0')}</span><strong>{step}</strong><i/></div>)}
              </div>
              <div className="bh-system-output"><span>THE IMPORTANT PART</span><p>Nothing consequential should be hidden behind the word <em>done.</em></p></div>
              <div className="bh-verified-signals"><span>PERMISSIONS</span><span>EVIDENCE</span><span>APPROVALS</span><span>TRACEABILITY</span></div>
            </div>
          </div>
        </section>

        <section className="bh-chapter bh-evolution" id="evolution" data-chapter>
          <Art src="/black-hole/references/stellar-hands.webp" className="bh-evolution-back"/>
          <div className="bh-wrap">
            <Overline n="08 / THE NAME">WHY INFINITY?</Overline>
            <h2>ONE NAME.<br/><em>CONTINUOUS EVOLUTION.</em></h2>
            <p className="bh-copy bh-narrow">Infinity is our direction, not a claim of literal infinite power. Rather than continually discarding one identity for another, we believe in one evolving intelligence experience that grows through careful, verified improvements.</p>
            <div className="bh-evolution-chain"><div><span>01</span><strong>ONE IDENTITY</strong><p>A recognizable, lasting product.</p></div><i aria-hidden="true"/><div><span>02</span><strong>CONTINUOUS IMPROVEMENT</strong><p>Every release should earn its place.</p></div><i aria-hidden="true"/><div><span>03</span><strong>GREATER POSSIBILITY</strong><p>New depth without starting over.</p></div></div>
            <p className="bh-evolution-note">Behind the single public name, engineering releases remain versioned, auditable and reversible.</p>
          </div>
        </section>

        <section className="bh-chapter bh-consistency" id="consistency" data-chapter>
          <div className="bh-consistency-ring" aria-hidden="true"><div/><div/><div/></div>
          <div className="bh-wrap bh-consistency-copy">
            <Overline n="09 / THE LONG VIEW">THE POWER OF RETURNING</Overline>
            <h2>CONSISTENCY<br/><em>IS A FORM OF STRENGTH.</em></h2>
            <p className="bh-copy">One verified improvement. Then another. Less noise. More meaningful progress. This is the discipline we want to bring to XROGA.</p>
            <p className="bh-small-quote">“The most beloved deeds to Allah are those done regularly, even if they are few.”<span>— Sahih al-Bukhari 6464, translated meaning</span></p>
          </div>
        </section>

        <section className="bh-chapter bh-perspective" id="perspective" data-chapter>
          <Art src="/black-hole/references/astronaut.webp" className="bh-perspective-earth"/>
          <div className="bh-space-grid" aria-hidden="true"/>
          <div className="bh-wrap bh-perspective-content">
            <Overline n="10 / THE PERSPECTIVE">YOU ARE HERE</Overline>
            <h2>WE CAN BUILD<br/>EXTRAORDINARY THINGS.<br/><em>WE ARE STILL SMALL.</em></h2>
            <p className="bh-copy">Our systems may become more capable. Our reach may grow. Yet intelligence is not immortality, and progress should never be mistaken for ultimate power.</p>
            <div className="bh-perspective-marker"><span aria-hidden="true">◉</span> ONE LIFE. REAL PURPOSE.</div>
          </div>
        </section>

        <section className="bh-chapter bh-purpose" id="purpose" data-chapter>
          <div className="bh-purpose-quiet-light" aria-hidden="true"/>
          <div className="bh-wrap bh-purpose-content">
            <Overline n="11 / WHAT WE BELIEVE">AN INTELLIGENCE WITH PERSPECTIVE</Overline>
            <h2>NO INTELLIGENCE<br/>IS ABOVE <em>ALLAH.</em></h2>
            <p className="bh-copy">Our founder believes that human life is temporary, that we will return to Allah, and that we are accountable for what we do. Technology is a tool. It is never the purpose of existence.</p>
            <blockquote lang="en">“Did you think that We created you without purpose, and that you would not be returned to Us?”<cite>QUR&apos;AN 23:115 — TRANSLATED MEANING</cite></blockquote>
            <p className="bh-copy bh-purpose-footnote">No model, no company, and no created intelligence is literally infinite. Allah alone is without limit. We build with ambition and remain humble about what we are.</p>
          </div>
        </section>

        <section className="bh-chapter bh-finale" id="begin" data-chapter>
          <Art src="/black-hole/particle-wave.svg" className="bh-finale-photo"/>
          <div className="bh-finale-light" aria-hidden="true"/>
          <div className="bh-wrap bh-finale-content">
            <Overline n="12 / THE INVITATION">THE FUTURE IS HUMAN-DIRECTED</Overline>
            <h2>IMAGINE WHAT<br/><em>YOU COULD BUILD.</em></h2>
            <p className="bh-copy">A bigger idea. An unfinished project. Work that once felt impossible. Intelligence is useful when it helps someone do something that matters.</p>
            <div className="bh-actions bh-actions-center"><Link href="/auth/signup" className="bh-button bh-button-light">Enter XROGA <ArrowUpRight size={18}/></Link><Link href="/" className="bh-button bh-button-ghost">Explore the platform <ArrowRight size={17}/></Link></div>
            <p className="bh-finale-micro">BLACK HOLE V INFINITY / BUILT TO EVOLVE. GROUNDED IN PURPOSE.</p>
          </div>
        </section>
      </main>
      <footer className="bh-footer"><div className="bh-wrap bh-footer-inner"><Link href="/" className="bh-wordmark">XROGA<span className="bh-logo-point">.</span></Link><span>BLACK HOLE V INFINITY</span><nav aria-label="Footer"><a href="#encounter">Back to top <ArrowUpRight size={13}/></a><Link href="/about">Our story</Link><Link href="/privacy">Privacy</Link><Link href="/contact">Contact</Link></nav><small>© {new Date().getFullYear()} XROGA</small></div></footer>
    </div>
  );
}
