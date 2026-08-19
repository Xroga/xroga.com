"use client";

import {
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import styles from "./cybersecurity.module.css";

type IconProps = {
  size?: number;
  className?: string;
};

type Capability = {
  number: string;
  title: string;
  description: string;
  icon: "radar" | "shield" | "network" | "pulse" | "layers" | "spark";
};

const capabilities: Capability[] = [
  {
    number: "01",
    title: "Threat reasoning",
    description:
      "Turn fragmented security signals into structured context that helps teams understand what matters, why it matters, and what to investigate next.",
    icon: "radar",
  },
  {
    number: "02",
    title: "Security posture",
    description:
      "Build a clearer picture of exposure, controls, gaps, and operational risk across the environments a security team is responsible for.",
    icon: "shield",
  },
  {
    number: "03",
    title: "Attack-surface context",
    description:
      "Connect assets, identities, vulnerabilities, events, and external intelligence into one continuously reasoned security picture.",
    icon: "network",
  },
  {
    number: "04",
    title: "Incident intelligence",
    description:
      "Support faster investigation with AI-assisted timelines, evidence synthesis, prioritization, and response-oriented context.",
    icon: "pulse",
  },
  {
    number: "05",
    title: "Standards mapping",
    description:
      "Translate technical posture into language that can be mapped to security frameworks, control families, and governance requirements.",
    icon: "layers",
  },
  {
    number: "06",
    title: "AI-native workflows",
    description:
      "Explore agentic security workflows where humans remain in control while AI handles repetitive analysis, correlation, and preparation.",
    icon: "spark",
  },
];

const flow = [
  {
    number: "01",
    label: "SIGNAL",
    copy: "Telemetry, findings, identity, assets, vulnerabilities, events and external intelligence.",
  },
  {
    number: "02",
    label: "CONTEXT",
    copy: "Xroga's planned intelligence layer connects relationships and strips away unnecessary noise.",
  },
  {
    number: "03",
    label: "REASON",
    copy: "AI-assisted analysis evaluates importance, likely impact, uncertainty and the next useful question.",
  },
  {
    number: "04",
    label: "RESPOND",
    copy: "Security teams receive clearer decisions, investigation paths and response-ready context.",
  },
];

const iconMap = {
  radar: RadarIcon,
  shield: ShieldIcon,
  network: NetworkIcon,
  pulse: PulseIcon,
  layers: LayersIcon,
  spark: SparkIcon,
};

export default function CybersecurityLanding() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoValue, setDemoValue] = useState("");
  const [demoMessage, setDemoMessage] = useState("");

  const pixels = useMemo(
    () =>
      Array.from({ length: 192 }, (_, index) => {
        const column = index % 16;
        const row = Math.floor(index / 16);
        const seed = (index * 37 + row * 13 + column * 17) % 100;
        const intensity = 0.08 + (seed / 100) * 0.62;
        const duration = 7 + (index % 9) * 0.73;
        const delay = -((index % 17) * 0.41);
        return {
          index,
          intensity,
          duration,
          delay,
          bright: seed > 74,
        };
      }),
    [],
  );

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const drawingContext = canvasElement.getContext("2d");
    if (!drawingContext) return;

    // Preserve non-null types inside nested callbacks such as resize() and draw().
    const canvas: HTMLCanvasElement = canvasElement;
    const context: CanvasRenderingContext2D = drawingContext;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let previous = 0;
    let time = 0;
    let mouseX = window.innerWidth * 0.5;
    let mouseY = window.innerHeight * 0.33;
    let currentX = mouseX;
    let currentY = mouseY;

    const particles = Array.from({ length: 44 }, (_, index) => ({
      x: ((index * 47) % 101) / 100,
      y: ((index * 31 + 17) % 103) / 102,
      r: 0.6 + ((index * 13) % 12) / 10,
      drift: 0.04 + ((index * 7) % 10) / 240,
      phase: (index * 0.83) % (Math.PI * 2),
    }));

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(timestamp: number) {
      if (!previous) previous = timestamp;
      const delta = Math.min((timestamp - previous) / 1000, 0.05);
      previous = timestamp;
      time += delta;

      currentX += (mouseX - currentX) * 0.035;
      currentY += (mouseY - currentY) * 0.035;

      context.clearRect(0, 0, width, height);

      const glow = context.createRadialGradient(
        currentX,
        currentY,
        0,
        currentX,
        currentY,
        Math.max(width, height) * 0.56,
      );
      glow.addColorStop(0, "rgba(105, 57, 255, 0.15)");
      glow.addColorStop(0.42, "rgba(44, 92, 255, 0.07)");
      glow.addColorStop(1, "rgba(2, 0, 20, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      particles.forEach((particle, index) => {
        const px = particle.x * width + Math.sin(time * particle.drift * 5 + particle.phase) * 24;
        const wrappedY = (particle.y * height + time * (8 + index * 0.07)) % (height + 120) - 60;
        const alpha = 0.12 + Math.sin(time * 0.7 + particle.phase) * 0.06;
        context.beginPath();
        context.arc(px, wrappedY, particle.r, 0, Math.PI * 2);
        context.fillStyle = `rgba(151, 132, 255, ${Math.max(alpha, 0.03)})`;
        context.fill();
      });

      const lineCount = Math.max(8, Math.floor(width / 170));
      context.lineWidth = 1;
      for (let index = 0; index < lineCount; index += 1) {
        const x = ((index + 0.5) / lineCount) * width;
        const pulse = 0.018 + (Math.sin(time * 0.2 + index) + 1) * 0.006;
        context.strokeStyle = `rgba(137, 109, 255, ${pulse})`;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      if (!reduceMotion) raf = requestAnimationFrame(draw);
    }

    function onPointerMove(event: PointerEvent) {
      mouseX = event.clientX;
      mouseY = event.clientY;
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    if (reduceMotion) {
      draw(0);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );

    if (!nodes.length) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      nodes.forEach((node) => node.setAttribute("data-visible", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.13, rootMargin: "0px 0px -8% 0px" },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  function handleHeroPointerMove(event: ReactMouseEvent<HTMLElement>) {
    const element = heroRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    element.style.setProperty("--hero-x", `${x}%`);
    element.style.setProperty("--hero-y", `${y}%`);
  }

  function handleConceptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = demoValue.trim();
    setDemoMessage(
      value
        ? "Concept interface only — Xroga Cybersecurity is in development for 2027."
        : "Enter a security question to preview the planned interaction model.",
    );
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <main className={styles.pageShell}>
      <canvas
        ref={canvasRef}
        className={styles.ambientCanvas}
        aria-hidden="true"
      />
      <div className={styles.noise} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />

      <header className={styles.siteHeader}>
        <Link className={styles.brand} href="/" aria-label="Xroga home">
          <XrogaMark />
          <span>XROGA</span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Cybersecurity navigation">
          <a href="#vision">Vision</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#architecture">Architecture</a>
          <a href="#roadmap">2027</a>
        </nav>

        <div className={styles.headerActions}>
          <Link className={styles.backLink} href="/">
            Main site
            <ArrowUpRightIcon size={14} />
          </Link>
          <button
            className={styles.menuButton}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>

        <div
          id="mobile-nav"
          className={`${styles.mobileNav} ${menuOpen ? styles.mobileNavOpen : ""}`}
        >
          <a href="#vision" onClick={closeMenu}>Vision</a>
          <a href="#capabilities" onClick={closeMenu}>Capabilities</a>
          <a href="#architecture" onClick={closeMenu}>Architecture</a>
          <a href="#roadmap" onClick={closeMenu}>2027</a>
          <Link href="/" onClick={closeMenu}>Main Xroga site</Link>
        </div>
      </header>

      <section
        ref={heroRef}
        className={styles.hero}
        onMouseMove={handleHeroPointerMove}
      >
        <div className={styles.heroEyebrow} data-reveal>
          <span className={styles.liveDot} />
          <span>XROGA AI / CYBERSECURITY R&amp;D</span>
          <span className={styles.eyebrowDivider} />
          <span>COMING 2027</span>
        </div>

        <div className={styles.heroWatermark} aria-hidden="true">
          <span>CYBER</span>
          <span>SECURITY</span>
        </div>

        <div className={styles.heroFrame}>
          <div className={styles.frameChrome}>
            <div className={styles.frameBrand}>
              <span className={styles.miniMark} />
              XROGA CYBER
            </div>
            <div className={styles.frameLinks}>
              <span>INTELLIGENCE</span>
              <span>SECURITY</span>
              <span>2027</span>
            </div>
            <div className={styles.frameStatus}>R&amp;D / ACTIVE</div>
          </div>

          <div className={styles.pixelField} aria-hidden="true">
            {pixels.map((pixel) => (
              <span
                key={pixel.index}
                className={`${styles.pixel} ${pixel.bright ? styles.pixelBright : ""}`}
                style={
                  {
                    "--pixel-alpha": pixel.intensity,
                    "--pixel-duration": `${pixel.duration}s`,
                    "--pixel-delay": `${pixel.delay}s`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroGrid} aria-hidden="true" />

          <div className={styles.heroContent}>
            <div className={styles.heroCopy} data-reveal>
              <p className={styles.kicker}>THE NEXT XROGA FRONTIER</p>
              <h1>
                Security intelligence,
                <span> re-engineered for the AI era.</span>
              </h1>
              <p className={styles.heroDescription}>
                Xroga is developing a new AI-native cybersecurity initiative for
                2027 — built around better context, faster reasoning, and
                human-controlled response.
              </p>
            </div>

            <div className={styles.consoleWrap} data-reveal>
              <div className={styles.conceptLabel}>
                <span>CONCEPT INTERFACE</span>
                <span>NOT YET LIVE</span>
              </div>
              <form className={styles.askBar} onSubmit={handleConceptSubmit}>
                <label className={styles.srOnly} htmlFor="cyber-question">
                  Ask a conceptual cybersecurity question
                </label>
                <input
                  id="cyber-question"
                  type="text"
                  value={demoValue}
                  onChange={(event) => setDemoValue(event.target.value)}
                  placeholder="Ask Xroga security intelligence..."
                  autoComplete="off"
                />
                <button type="submit" aria-label="Preview concept interaction">
                  <ArrowRightIcon />
                </button>
              </form>
              <div className={styles.consoleChips}>
                <button type="button" onClick={() => setDemoValue("Analyze current risk posture")}> 
                  <ShieldIcon size={13} /> Risk posture
                </button>
                <button type="button" onClick={() => setDemoValue("Explain this threat signal")}> 
                  <RadarIcon size={13} /> Threat context
                </button>
                <button type="button" onClick={() => setDemoValue("Map controls to a security framework")}> 
                  <LayersIcon size={13} /> Standards
                </button>
                <button type="button" onClick={() => setDemoValue("Prepare an incident investigation path")}> 
                  <PulseIcon size={13} /> Incident
                </button>
              </div>
              {demoMessage ? (
                <p className={styles.demoMessage} role="status">
                  {demoMessage}
                </p>
              ) : null}
            </div>
          </div>

          <div className={`${styles.floatingCard} ${styles.cardLeft}`} data-reveal>
            <span className={styles.cardIndex}>01 / VISION</span>
            <strong>AI-native</strong>
            <p>Built for a security world where speed and context matter more than dashboards.</p>
          </div>

          <div className={`${styles.floatingCard} ${styles.cardRight}`} data-reveal>
            <span className={styles.cardIndex}>02 / TARGET</span>
            <strong>2027</strong>
            <p>Public direction today. Product research and development underway.</p>
          </div>

          <div className={styles.frameFooter}>
            <span>XROGA / RESEARCH DIRECTION</span>
            <span>AI + HUMAN CONTROL</span>
            <span>BUILDING TOWARD 2027</span>
          </div>
        </div>

        <a className={styles.scrollCue} href="#vision" aria-label="Scroll to vision">
          <span>EXPLORE</span>
          <span className={styles.scrollLine} />
        </a>
      </section>

      <section id="vision" className={styles.visionSection}>
        <div className={styles.sectionNumber}>01</div>
        <div className={styles.sectionIntro} data-reveal>
          <p className={styles.sectionLabel}>WHY CYBERSECURITY</p>
          <h2>
            The attack surface is expanding.
            <br />
            Security intelligence has to evolve with it.
          </h2>
        </div>

        <div className={styles.visionGrid}>
          <div className={styles.visionStatement} data-reveal>
            <p>
              Security teams already have alerts, tools and telemetry. The harder
              problem is turning all of that into reliable context quickly enough
              to make the right decision.
            </p>
            <p>
              Xroga Cybersecurity is being explored around that problem: using AI
              to connect signals, reason over risk, prepare investigations and
              make complex security information easier to act on — without
              removing human control.
            </p>
          </div>

          <div className={styles.principles}>
            <article data-reveal>
              <span>01</span>
              <strong>Context over noise</strong>
              <p>More alerts are not the goal. Better understanding is.</p>
            </article>
            <article data-reveal>
              <span>02</span>
              <strong>Speed with judgment</strong>
              <p>AI can accelerate analysis. Critical security decisions stay accountable.</p>
            </article>
            <article data-reveal>
              <span>03</span>
              <strong>Designed for uncertainty</strong>
              <p>Security intelligence should expose confidence, evidence and unknowns.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="capabilities" className={styles.capabilitiesSection}>
        <div className={styles.sectionHeader} data-reveal>
          <div>
            <p className={styles.sectionLabel}>PLANNED CAPABILITY AREAS</p>
            <h2>What Xroga is exploring.</h2>
          </div>
          <p className={styles.sectionNote}>
            These are R&amp;D directions, not claims of currently released product
            functionality.
          </p>
        </div>

        <div className={styles.capabilityGrid}>
          {capabilities.map((capability) => {
            const Icon = iconMap[capability.icon];
            return (
              <article className={styles.capabilityCard} key={capability.number} data-reveal>
                <div className={styles.capabilityTop}>
                  <span>{capability.number}</span>
                  <div className={styles.capabilityIcon}><Icon size={22} /></div>
                </div>
                <h3>{capability.title}</h3>
                <p>{capability.description}</p>
                <div className={styles.capabilityStatus}>
                  <span /> IN R&amp;D
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="architecture" className={styles.architectureSection}>
        <div className={styles.architectureBackdrop} aria-hidden="true">
          <span>SEE</span>
          <span>REASON</span>
          <span>RESPOND</span>
        </div>

        <div className={styles.sectionHeader} data-reveal>
          <div>
            <p className={styles.sectionLabel}>CONCEPT ARCHITECTURE</p>
            <h2>From raw signal to useful action.</h2>
          </div>
          <p className={styles.sectionNote}>
            A conceptual operating model for how an AI-native security layer could
            assist modern security teams.
          </p>
        </div>

        <div className={styles.flowGrid}>
          {flow.map((item, index) => (
            <article className={styles.flowCard} key={item.number} data-reveal>
              <div className={styles.flowTop}>
                <span>{item.number}</span>
                {index < flow.length - 1 ? <ArrowRightIcon /> : <SparkIcon size={20} />}
              </div>
              <strong>{item.label}</strong>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>

        <div className={styles.systemPanel} data-reveal>
          <div className={styles.systemPanelHeader}>
            <span>XROGA SECURITY INTELLIGENCE / CONCEPT</span>
            <span>ARCHITECTURE STUDY 2026 → 2027</span>
          </div>
          <div className={styles.systemDiagram}>
            <div className={styles.diagramSources}>
              <span>ASSETS</span>
              <span>IDENTITIES</span>
              <span>EVENTS</span>
              <span>FINDINGS</span>
              <span>INTEL</span>
            </div>
            <div className={styles.diagramCore}>
              <div className={styles.coreOrb}>
                <XrogaMark />
              </div>
              <div>
                <span>XROGA AI</span>
                <strong>SECURITY REASONING LAYER</strong>
                <small>Correlation · Context · Prioritization · Investigation</small>
              </div>
            </div>
            <div className={styles.diagramOutputs}>
              <span>UNDERSTAND</span>
              <span>PRIORITIZE</span>
              <span>INVESTIGATE</span>
              <span>RESPOND</span>
            </div>
          </div>
        </div>
      </section>

      <section id="roadmap" className={styles.roadmapSection}>
        <div className={styles.roadmapYear} aria-hidden="true">2027</div>
        <div className={styles.roadmapContent}>
          <div className={styles.roadmapCopy} data-reveal>
            <p className={styles.sectionLabel}>THE ROAD AHEAD</p>
            <h2>We are building toward 2027.</h2>
            <p>
              This page is a statement of direction. Xroga is actively exploring
              the cybersecurity space and the role AI can play in making security
              operations more understandable, connected and responsive.
            </p>
            <p>
              The final product shape may evolve as research, engineering and
              security requirements develop.
            </p>
          </div>

          <div className={styles.roadmapTimeline} data-reveal>
            <div>
              <span>NOW</span>
              <strong>Research + architecture</strong>
              <p>Problem definition, technical exploration and security-domain design.</p>
            </div>
            <div>
              <span>NEXT</span>
              <strong>Prototype + validation</strong>
              <p>Testing workflows, intelligence models and real-world operator needs.</p>
            </div>
            <div>
              <span>2027</span>
              <strong>Target launch window</strong>
              <p>Planned introduction of Xroga&apos;s cybersecurity initiative.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.ctaGlow} aria-hidden="true" />
        <div className={styles.ctaPixelGrid} aria-hidden="true" />
        <div className={styles.ctaContent} data-reveal>
          <p>XROGA / CYBERSECURITY</p>
          <h2>
            The future of security will not be
            <span> another dashboard.</span>
          </h2>
          <div className={styles.ctaBottom}>
            <p>
              It will be intelligence that can understand context, reason with
              evidence and help humans move faster.
            </p>
            <div className={styles.ctaActions}>
              <Link className={styles.primaryButton} href="/">
                Explore Xroga <ArrowUpRightIcon size={16} />
              </Link>
              <a className={styles.secondaryButton} href="#vision">
                Read the vision
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link className={styles.footerBrand} href="/">
          <XrogaMark />
          <span>XROGA</span>
        </Link>
        <p>AI-native cybersecurity direction · Target 2027</p>
        <p>© {new Date().getFullYear()} Xroga. All rights reserved.</p>
      </footer>
    </main>
  );
}

function XrogaMark({ size = 22, className = "" }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 4L12 11L19 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 20L12 13L19 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 5L11 12L4 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20 5L13 12L20 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12H19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUpRightIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 17L17 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8 7H17V16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3L19 6V11C19 15.6 16.4 19 12 21C7.6 19 5 15.6 5 11V6L12 3Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 12L11 14L15.5 9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RadarIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.45" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.45" opacity="0.65" />
      <path d="M12 12L17.6 6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="10" r="1.2" fill="currentColor" />
    </svg>
  );
}

function NetworkIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="6" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="18" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="17" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7L16 6.2M7.4 9L6.6 15M9 16.8L15 18M17.8 8L17.2 16" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.2 8.3L15.5 16.2" stroke="currentColor" strokeWidth="1.1" opacity="0.6" />
    </svg>
  );
}

function PulseIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12H7L9.3 7L13 17L15.5 11H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LayersIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4L20 8L12 12L4 8L12 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 12L12 16L20 12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 16L12 20L20 16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon({ size = 18, className = "" }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3L13.7 8.3L19 10L13.7 11.7L12 17L10.3 11.7L5 10L10.3 8.3L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18.5 15L19.2 17.1L21.3 17.8L19.2 18.5L18.5 20.6L17.8 18.5L15.7 17.8L17.8 17.1L18.5 15Z" fill="currentColor" />
    </svg>
  );
}
