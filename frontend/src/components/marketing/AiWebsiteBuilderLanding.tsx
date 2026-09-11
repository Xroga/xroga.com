import Link from 'next/link';
import {
  Accessibility,
  ArrowRight,
  CheckCircle2,
  Code2,
  FileCode2,
  Gauge,
  GitBranch,
  Globe2,
  Layers3,
  MonitorSmartphone,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { PageJsonLd } from '@/components/seo/PageJsonLd';
import type { CapabilityPageData } from '@/lib/capabilityPages';

import { AiWebsiteBuilderAtmosphere } from './AiWebsiteBuilderAtmosphere';
import { AiWebsiteBuilderPrompt } from './AiWebsiteBuilderPrompt';

import '@/styles/ai-website-builder-landing.css';

const HERO_ONLY_CSS = `
  /*
   * FINAL HERO-ONLY REDESIGN
   * Scope: only /ai-website-builder hero.
   * All sections after the hero keep their existing JSX + existing stylesheet.
   */

  .xwb-page {
    --xwb-ref-outer: #444954;
    --xwb-ref-stage: #050607;
    --xwb-ref-stage-2: #0a0c10;
    --xwb-ref-ink: #f7f8fa;
    --xwb-ref-muted: rgba(247, 248, 250, .54);
    --xwb-ref-line: rgba(255, 255, 255, .13);
    --xwb-ref-dot: rgba(255, 255, 255, .42);
    --xwb-ref-dot-soft: rgba(255, 255, 255, .14);
    --xwb-ref-composer: #2b2e36;
    --xwb-ref-composer-2: #24272e;
  }

  body.theme-white .xwb-page {
    --xwb-ref-outer: #444954;
    --xwb-ref-stage: #050607;
    --xwb-ref-stage-2: #0a0c10;
    --xwb-ref-ink: #f7f8fa;
    --xwb-ref-muted: rgba(247, 248, 250, .54);
    --xwb-ref-line: rgba(255, 255, 255, .13);
    --xwb-ref-dot: rgba(255, 255, 255, .42);
    --xwb-ref-dot-soft: rgba(255, 255, 255, .14);
    --xwb-ref-composer: #2b2e36;
    --xwb-ref-composer-2: #24272e;
  }

  body.theme-black .xwb-page {
    --xwb-ref-outer: #060709;
    --xwb-ref-stage: #020304;
    --xwb-ref-stage-2: #08090d;
    --xwb-ref-ink: #f8f8f7;
    --xwb-ref-muted: rgba(248, 248, 247, .54);
    --xwb-ref-line: rgba(255, 255, 255, .14);
    --xwb-ref-dot: rgba(255, 255, 255, .48);
    --xwb-ref-dot-soft: rgba(255, 255, 255, .16);
    --xwb-ref-composer: #24272e;
    --xwb-ref-composer-2: #1c1f25;
  }

  body.theme-gray .xwb-page {
    --xwb-ref-outer: #3e424a;
    --xwb-ref-stage: #090a0c;
    --xwb-ref-stage-2: #111318;
    --xwb-ref-ink: #ffffff;
    --xwb-ref-muted: rgba(255, 255, 255, .56);
    --xwb-ref-line: rgba(255, 255, 255, .14);
    --xwb-ref-dot: rgba(255, 255, 255, .45);
    --xwb-ref-dot-soft: rgba(255, 255, 255, .14);
    --xwb-ref-composer: #33363d;
    --xwb-ref-composer-2: #292c32;
  }

  body.theme-beige .xwb-page {
    --xwb-ref-outer: #d8cdbd;
    --xwb-ref-stage: #090806;
    --xwb-ref-stage-2: #11100d;
    --xwb-ref-ink: #fffaf2;
    --xwb-ref-muted: rgba(255, 250, 242, .54);
    --xwb-ref-line: rgba(255, 250, 242, .14);
    --xwb-ref-dot: rgba(255, 250, 242, .44);
    --xwb-ref-dot-soft: rgba(255, 250, 242, .14);
    --xwb-ref-composer: #34312d;
    --xwb-ref-composer-2: #2a2824;
  }

  /* OUTER AREA — no rounded card treatment. */
  .xwb-page .xwb-hero--reference {
    min-height: auto;
    padding:
      clamp(50px, 6.2vw, 86px)
      clamp(20px, 4vw, 46px);

    display: flex;
    align-items: center;
    justify-content: center;

    overflow: hidden;

    background: var(--xwb-ref-outer);
  }

  .xwb-page .xwb-hero--reference::before,
  .xwb-page .xwb-hero--reference::after {
    content: '';
    position: absolute;
    pointer-events: none;
  }

  /* Silver vertical atmosphere around the dark hero, based on the supplied dot-grid reference. */
  .xwb-page .xwb-hero--reference::before {
    z-index: 0;
    left: 0;
    right: 0;
    bottom: -5%;
    height: 46%;

    background:
      repeating-linear-gradient(
        90deg,
        transparent 0 9px,
        color-mix(in srgb, var(--xwb-ref-ink) 5%, transparent) 10px,
        transparent 11px 18px
      ),
      radial-gradient(
        ellipse 58% 80% at 50% 100%,
        color-mix(in srgb, var(--xwb-ref-ink) 13%, transparent),
        transparent 70%
      );

    opacity: .36;
    filter: blur(.25px);
    mask-image:
      linear-gradient(
        180deg,
        transparent 0%,
        rgba(0,0,0,.5) 34%,
        #000 100%
      );
  }

  .xwb-page .xwb-hero--reference::after {
    z-index: 0;
    inset: 0;

    background:
      radial-gradient(
        ellipse 75% 80% at 50% 46%,
        transparent 0 48%,
        color-mix(in srgb, var(--xwb-ref-outer) 42%, transparent) 100%
      );
  }

  /* BLACK HERO PLANE — deliberately rectangular, not a rounded marketing card. */
  .xwb-page .xwb-hero--reference .xwb-hero__stage {
    position: relative;
    z-index: 2;
    isolation: isolate;

    width: min(1040px, 92vw);
    height: clamp(550px, 57vw, 650px);
    min-height: 0;

    overflow: hidden;

    display: block;

    border: 1px solid rgba(255, 255, 255, .055);
    border-radius: 0;

    background:
      linear-gradient(
        180deg,
        var(--xwb-ref-stage) 0%,
        var(--xwb-ref-stage) 67%,
        var(--xwb-ref-stage-2) 100%
      );

    color: var(--xwb-ref-ink);

    box-shadow:
      0 28px 65px rgba(0, 0, 0, .13),
      inset 0 1px 0 rgba(255,255,255,.018);

    backdrop-filter: none;
  }

  .xwb-page .xwb-hero--reference .xwb-hero__stage::before,
  .xwb-page .xwb-hero--reference .xwb-hero__stage::after {
    display: none;
  }

  /* ----------------------------------------------------------------------
     DOT-MATRIX BACKGROUND
     Inspired by the supplied Mercury-style reference:
     - fixed dot lattice
     - luminous center wave
     - slowly drifting secondary field
     - vertical scan rails
     ---------------------------------------------------------------------- */

  .xwb-page .xwb-hero__matrix {
    position: absolute;
    inset: 0;
    z-index: 0;

    overflow: hidden;

    pointer-events: none;
  }

  .xwb-page .xwb-hero__matrix-base,
  .xwb-page .xwb-hero__matrix-wave,
  .xwb-page .xwb-hero__matrix-halo {
    position: absolute;
    inset: 0;
    display: block;
  }

  .xwb-page .xwb-hero__matrix-base {
    background-image:
      radial-gradient(
        circle,
        var(--xwb-ref-dot-soft) 0 1px,
        transparent 1.2px
      );

    background-size: 14px 14px;
    background-position: 0 0;

    opacity: .30;

    mask-image:
      radial-gradient(
        ellipse 78% 72% at 50% 43%,
        #000 0%,
        rgba(0,0,0,.88) 46%,
        rgba(0,0,0,.20) 78%,
        transparent 100%
      );

    animation: xwb-matrix-drift 18s linear infinite;
  }

  .xwb-page .xwb-hero__matrix-wave {
    left: 8%;
    right: 8%;
    top: 7%;
    bottom: 10%;

    background-image:
      radial-gradient(
        circle,
        var(--xwb-ref-dot) 0 1.15px,
        transparent 1.35px
      );

    background-size: 13px 13px;

    opacity: .66;

    /*
     * This mask creates the soft bright "curtain" / wave of dots
     * visible in the third supplied reference instead of a flat grid.
     */
    mask-image:
      radial-gradient(
        ellipse 48% 32% at 50% 42%,
        #000 0 15%,
        rgba(0,0,0,.86) 29%,
        rgba(0,0,0,.35) 54%,
        transparent 76%
      ),
      linear-gradient(
        90deg,
        transparent 0%,
        #000 18%,
        #000 82%,
        transparent 100%
      );

    filter:
      drop-shadow(0 0 8px rgba(255,255,255,.08));

    transform-origin: 50% 46%;

    animation:
      xwb-matrix-breathe 7s ease-in-out infinite alternate,
      xwb-matrix-slide 21s linear infinite;
  }

  .xwb-page .xwb-hero__matrix-halo {
    background:
      radial-gradient(
        ellipse 52% 38% at 50% 43%,
        rgba(255,255,255,.052) 0%,
        rgba(255,255,255,.018) 38%,
        transparent 72%
      ),
      radial-gradient(
        ellipse 56% 26% at 50% 100%,
        rgba(108,126,168,.13),
        transparent 76%
      );
  }

  .xwb-page .xwb-hero__rail {
    position: absolute;
    top: -24%;
    z-index: 1;

    width: 1px;
    height: 35%;

    display: block;

    background:
      linear-gradient(
        180deg,
        transparent,
        rgba(255,255,255,.22),
        rgba(255,255,255,.045),
        transparent
      );

    opacity: .24;

    animation: xwb-hero-rail 8.5s linear infinite;
  }

  .xwb-page .xwb-hero__rail--1 {
    left: 43%;
    animation-delay: -1s;
  }

  .xwb-page .xwb-hero__rail--2 {
    left: 47.5%;
    height: 25%;
    opacity: .16;
    animation-delay: -4.8s;
  }

  .xwb-page .xwb-hero__rail--3 {
    left: 52.5%;
    height: 28%;
    opacity: .20;
    animation-delay: -2.8s;
  }

  .xwb-page .xwb-hero__rail--4 {
    left: 57%;
    height: 22%;
    opacity: .14;
    animation-delay: -6.4s;
  }

  /* ----------------------------------------------------------------------
     CONTENT GEOMETRY — sized to match the reference composition.
     ---------------------------------------------------------------------- */

  .xwb-page .xwb-hero--reference .xwb-hero__content {
    position: relative;
    z-index: 3;

    width: min(670px, calc(100% - 40px));
    height: 100%;
    margin-inline: auto;

    display: flex;
    flex-direction: column;
    align-items: center;

    padding-top: clamp(74px, 8vw, 96px);
    padding-bottom: 42px;

    color: var(--xwb-ref-ink);
    text-align: center;
  }

  .xwb-page .xwb-hero--reference .xwb-pill {
    min-height: 24px;
    padding: 0 10px;
    gap: 5px;

    border: 1px solid rgba(255,255,255,.25);
    border-radius: 999px;

    background: rgba(7,8,10,.62);
    color: rgba(255,255,255,.68);

    box-shadow:
      inset 0 0 0 1px rgba(255,255,255,.02),
      0 4px 18px rgba(0,0,0,.20);

    font-size: 8px;
    font-weight: 760;
    letter-spacing: .025em;
    text-transform: none;
  }

  .xwb-page .xwb-hero--reference .xwb-pill svg {
    width: 9px;
    height: 9px;
    color: rgba(255,255,255,.90);
  }

  /* OUR WORDING, not the reference wording. */
  .xwb-page .xwb-hero--reference h1 {
    max-width: 650px;
    margin: 20px 0 0;

    color: var(--xwb-ref-ink);

    font-size: clamp(28px, 3.2vw, 40px);
    font-weight: 510;
    line-height: 1.10;
    letter-spacing: -.043em;
  }

  .xwb-page .xwb-hero--reference h1 span {
    display: block;
    margin-top: 3px;

    color: rgba(247,248,250,.93);

    font-size: 1em;
    font-weight: inherit;
    line-height: inherit;
    letter-spacing: inherit;
  }

  /*
   * PROMPT / "CHAT BAR"
   * Smaller and flatter than the previous build.
   * It should read as a tool embedded in the hero, not a giant card.
   */
  .xwb-page .xwb-hero--reference .xwb-prompt-wrap {
    width: min(510px, 100%);
    margin-top: 25px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt {
    overflow: hidden;

    border: 1px solid rgba(255,255,255,.28);
    border-radius: 12px;

    background:
      linear-gradient(
        180deg,
        var(--xwb-ref-composer),
        var(--xwb-ref-composer-2)
      );

    box-shadow:
      0 15px 34px rgba(0,0,0,.28),
      inset 0 1px 0 rgba(255,255,255,.035);

    backdrop-filter: blur(8px);
  }

  .xwb-page .xwb-hero--reference .xwb-prompt textarea {
    min-height: 61px;
    padding: 13px 13px 6px;

    color: #f4f5f7;

    font-size: 10px;
    line-height: 1.45;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt textarea::placeholder {
    color: rgba(255,255,255,.67);
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__bar {
    padding: 5px 8px 8px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__tools {
    gap: 5px;

    color: rgba(255,255,255,.54);

    font-size: 8px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__tools span {
    width: 20px;
    height: 20px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__tools svg {
    width: 10px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__tools i {
    margin-left: 4px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__tools i::before {
    width: 4px;
    height: 4px;
    margin-right: 4px;

    background: #b8c3ec;
    box-shadow: 0 0 9px rgba(144,167,255,.46);
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__bar > button {
    width: 27px;
    height: 27px;

    border-radius: 50%;

    background: #f6f7f9;
    color: #0a0b0e;

    box-shadow:
      0 4px 11px rgba(0,0,0,.28),
      inset 0 -1px 0 rgba(0,0,0,.10);
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__bar > button svg {
    width: 13px;
  }

  /* Small suggestion buttons, like the compact pills in the supplied hero. */
  .xwb-page .xwb-hero--reference .xwb-quick-starts {
    gap: 5px;
    margin-top: 10px;
  }

  .xwb-page .xwb-hero--reference .xwb-quick-starts button {
    padding: 5px 9px;

    border: 1px solid rgba(255,255,255,.13);
    border-radius: 999px;

    background: rgba(5,6,8,.74);
    color: rgba(255,255,255,.58);

    font-size: 8px;
  }

  .xwb-page .xwb-hero--reference .xwb-quick-starts button:hover {
    border-color: rgba(255,255,255,.28);
    background: rgba(18,20,24,.90);
    color: #fff;
  }

  /*
   * Bottom informational paragraph.
   * Uses Xroga's existing data.intro wording and is deliberately separated
   * from the headline/prompt to match the reference composition.
   */
  .xwb-page .xwb-hero--reference .xwb-hero__intro {
    max-width: 690px;
    margin: auto 0 0;

    color: var(--xwb-ref-muted);

    font-size: clamp(11px, 1.08vw, 13px);
    line-height: 1.62;
  }

  .xwb-page .xwb-hero__trustline {
    margin: 13px 0 0;

    color: rgba(255,255,255,.28);

    font-size: 7px;
    font-weight: 780;
    letter-spacing: .17em;
    text-transform: uppercase;
  }

  @keyframes xwb-matrix-drift {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 28px 14px;
    }
  }

  @keyframes xwb-matrix-slide {
    from {
      background-position: 0 0;
    }
    to {
      background-position: 52px 13px;
    }
  }

  @keyframes xwb-matrix-breathe {
    0% {
      opacity: .42;
      transform: scale(.985, .96);
      filter: blur(.10px);
    }
    100% {
      opacity: .72;
      transform: scale(1.025, 1.04);
      filter: blur(0);
    }
  }

  @keyframes xwb-hero-rail {
    0% {
      transform: translateY(-12%);
      opacity: 0;
    }
    15% {
      opacity: .25;
    }
    74% {
      opacity: .17;
    }
    100% {
      transform: translateY(440%);
      opacity: 0;
    }
  }

  @media (max-width: 760px) {
    .xwb-page .xwb-hero--reference {
      padding: 24px 12px 38px;
    }

    .xwb-page .xwb-hero--reference .xwb-hero__stage {
      width: 100%;
      height: 660px;
    }

    .xwb-page .xwb-hero--reference .xwb-hero__content {
      width: min(100% - 28px, 620px);
      padding-top: 64px;
      padding-bottom: 34px;
    }

    .xwb-page .xwb-hero--reference h1 {
      font-size: clamp(29px, 8.8vw, 38px);
    }

    .xwb-page .xwb-hero--reference .xwb-prompt-wrap {
      width: min(480px, 100%);
      margin-top: 25px;
    }

    .xwb-page .xwb-hero--reference .xwb-hero__intro {
      max-width: 520px;
      font-size: 11px;
    }

    .xwb-page .xwb-hero__matrix-wave {
      left: -8%;
      right: -8%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .xwb-page .xwb-hero__matrix-base,
    .xwb-page .xwb-hero__matrix-wave,
    .xwb-page .xwb-hero__rail {
      animation: none !important;
    }
  }
`;

const CAPABILITIES = [
  {
    icon: MonitorSmartphone,
    kicker: 'Responsive by design',
    title: 'One system. Every screen.',
    body:
      'Build adaptive layouts, navigation, and content structures that remain coherent across desktop, tablet, and mobile.',
  },
  {
    icon: Accessibility,
    kicker: 'Accessible structure',
    title: 'Interfaces people can use.',
    body:
      'Semantic structure, keyboard-aware controls, readable hierarchy, and accessible navigation belong in the implementation rather than a final polish pass.',
  },
  {
    icon: Search,
    kicker: 'Search foundations',
    title: 'Metadata is part of the build.',
    body:
      'Structured metadata, sitemap and robots rules, and crawlable page architecture can live beside the website code.',
  },
  {
    icon: GitBranch,
    kicker: 'Repository ownership',
    title: 'The website stays inspectable.',
    body:
      'Xroga builds maintainable project files in a repository instead of hiding the result inside a closed visual editor.',
  },
  {
    icon: Gauge,
    kicker: 'Build evidence',
    title: 'A build is a real gate.',
    body:
      'Production framework builds and applicable checks determine whether the current repository state is actually ready to publish.',
  },
  {
    icon: Rocket,
    kicker: 'Authorized publishing',
    title: 'Deploy the state you verified.',
    body:
      'When Vercel is configured and authorized, publishing can stay connected to the exact repository state and build evidence.',
  },
] as const;

const WORKFLOW = [
  {
    number: '01',
    label: 'Read the system',
    title: 'Start from what already exists.',
    body:
      'Inspect reusable components, typography, themes, layout rules, and project constraints before introducing new UI.',
  },
  {
    number: '02',
    label: 'Build the real interface',
    title: 'Turn the brief into connected pages.',
    body:
      'Create structured sections, responsive navigation, working controls, content, metadata, and the code paths required by the website.',
  },
  {
    number: '03',
    label: 'Verify the project',
    title: 'Build before calling it done.',
    body:
      'Run the production framework build and applicable validation so failures remain visible and repairable.',
  },
  {
    number: '04',
    label: 'Publish with evidence',
    title: 'Keep deployment tied to source.',
    body:
      'When provider access exists, deploy the verified repository state instead of treating a visual preview as production completion.',
  },
] as const;

const FAQS = [
  {
    q: 'Can Xroga build more than a single landing page?',
    a:
      'Yes. The current website-builder capability covers landing pages, multi-page marketing sites, authenticated product interfaces, responsive navigation, metadata, sitemap rules, and deployment checks when those systems are in scope.',
  },
  {
    q: 'Do I keep the website code?',
    a:
      'The page is designed around repository-owned work. The generated website remains inspectable as project code rather than disappearing into a closed visual editor.',
  },
  {
    q: 'Can it follow an existing design system?',
    a:
      'That is part of the intended workflow: inspect reusable components, typography, themes, and layouts first, then extend the project without replacing unrelated design decisions.',
  },
  {
    q: 'Does Xroga guarantee SEO rankings or traffic?',
    a:
      'No. Xroga can implement technical foundations such as metadata, sitemap and robots rules, but rankings, indexing, traffic, and conversions depend on search engines, competition, users, and time.',
  },
] as const;

export function AiWebsiteBuilderLanding({
  data,
}: {
  data: CapabilityPageData;
}) {
  return (
    <main className="xwb-page">
      <style>{HERO_ONLY_CSS}</style>

      <PageJsonLd
        path={`/${data.slug}`}
        name={data.title}
        description={data.description}
      />

      <section className="xwb-hero xwb-hero--reference">
        <div className="xwb-hero__stage">
          <div className="xwb-hero__matrix" aria-hidden="true">
            <span className="xwb-hero__matrix-base" />
            <span className="xwb-hero__matrix-wave" />
            <span className="xwb-hero__matrix-halo" />

            <i className="xwb-hero__rail xwb-hero__rail--1" />
            <i className="xwb-hero__rail xwb-hero__rail--2" />
            <i className="xwb-hero__rail xwb-hero__rail--3" />
            <i className="xwb-hero__rail xwb-hero__rail--4" />
          </div>

          <div className="xwb-hero__content">
            <p className="xwb-pill">
              <Sparkles aria-hidden="true" />
              AI website builder · code you own
            </p>

            <h1>
              AI-Powered Website Builder
              <span>for real product work.</span>
            </h1>

            <AiWebsiteBuilderPrompt />

            <p className="xwb-hero__intro">
              {data.intro}
            </p>

            <p className="xwb-hero__trustline">
              Responsive · repository-owned · production-ready workflow
            </p>
          </div>
        </div>
      </section>

      <section className="xwb-manifesto">
        <div className="xwb-shell xwb-manifesto__grid">
          <div>
            <p className="xwb-kicker">Built beyond templates</p>

            <h2>
              Create with
              <em> no limitations.</em>
            </h2>
          </div>

          <div className="xwb-manifesto__copy">
            <p>
              A website should not stop at a pretty first screen. Xroga treats
              the brief as a real project: design system, content structure,
              responsive behavior, controls, metadata, build state, and
              publishing evidence.
            </p>

            <Link href="/auth/signup">
              Start with your brief
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="xwb-dot-orbit" aria-hidden="true">
          <div className="xwb-dot-orbit__core" />
          <span className="xwb-dot-orbit__ring xwb-dot-orbit__ring--one" />
          <span className="xwb-dot-orbit__ring xwb-dot-orbit__ring--two" />
          <span className="xwb-dot-orbit__ring xwb-dot-orbit__ring--three" />
        </div>
      </section>

      <section className="xwb-capabilities">
        <div className="xwb-shell">
          <div className="xwb-section-head">
            <p className="xwb-kicker">What the website builder covers</p>

            <h2>
              A visual idea becomes
              <span> a maintainable system.</span>
            </h2>

            <p>
              The goal is not a screenshot of a website. It is a real project
              that can be read, changed, checked, and published.
            </p>
          </div>

          <div className="xwb-capability-grid">
            {CAPABILITIES.map(({ icon: Icon, kicker, title, body }) => (
              <article key={title}>
                <Icon aria-hidden="true" />
                <p>{kicker}</p>
                <h3>{title}</h3>
                <span>{body}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="xwb-project">
        <div className="xwb-shell">
          <div className="xwb-project__head">
            <p className="xwb-kicker">PROJECT.EXE</p>

            <h2>
              From direction
              <span> to deployable website.</span>
            </h2>
          </div>

          <div className="xwb-project__scene" aria-hidden="true">
            <div className="xwb-pixel-hand xwb-pixel-hand--left">
              <i /><i /><i /><i />
            </div>

            <div className="xwb-retro-window">
              <div className="xwb-retro-window__bar">
                <strong>WEBSITE.EXE</strong>
                <span>_</span>
                <span>□</span>
                <span>×</span>
              </div>

              <div className="xwb-retro-window__body">
                <Code2 />
                <p>design → code → build → publish</p>
              </div>
            </div>

            <div className="xwb-pixel-hand xwb-pixel-hand--right">
              <i /><i /><i /><i />
            </div>
          </div>

          <div className="xwb-workflow-grid">
            {WORKFLOW.map((step) => (
              <article key={step.number}>
                <span>{step.number}</span>
                <p>{step.label}</p>
                <h3>{step.title}</h3>
                <div>{step.body}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="xwb-outcomes">
        <div className="xwb-shell">
          <div className="xwb-outcomes__intro">
            <p className="xwb-kicker">What you can build</p>

            <h2>
              From a focused landing page
              <em> to a complete website system.</em>
            </h2>
          </div>

          <div className="xwb-outcomes__list">
            {data.outcomes.map((outcome, index) => (
              <div key={outcome}>
                <span>0{index + 1}</span>
                <p>{outcome}</p>
                <CheckCircle2 aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="xwb-proof">
        <div className="xwb-proof__glow" aria-hidden="true" />

        <div className="xwb-shell xwb-proof__grid">
          <div>
            <p className="xwb-kicker">Code, not a dead mockup</p>

            <h2>
              Built for the
              <em> thinkers.</em>
            </h2>

            <p>
              Keep the project understandable after generation. Source,
              structure, controls, metadata, and build evidence stay part of
              the same website workflow.
            </p>
          </div>

          <div className="xwb-proof__stack">
            <div>
              <Layers3 />
              <span>
                <b>Design system aware</b>
                <small>Reuse project patterns before inventing new ones.</small>
              </span>
            </div>

            <div>
              <FileCode2 />
              <span>
                <b>Repository owned</b>
                <small>Inspect and continue the code after generation.</small>
              </span>
            </div>

            <div>
              <ShieldCheck />
              <span>
                <b>Truthful controls</b>
                <small>
                  Actions connect to real operations or expose blockers.
                </small>
              </span>
            </div>

            <div>
              <Globe2 />
              <span>
                <b>Publish with evidence</b>
                <small>
                  Keep provider deployment separate from visual preview.
                </small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="xwb-faq">
        <div className="xwb-shell xwb-faq__grid">
          <div>
            <p className="xwb-kicker">Questions before you build</p>

            <h2>
              More than
              <em> “generate website.”</em>
            </h2>

            <p>{data.limits}</p>
          </div>

          <div className="xwb-faq__items">
            {FAQS.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="xwb-final">
        <AiWebsiteBuilderAtmosphere className="xwb-final__atmosphere" />

        <div className="xwb-final__content">
          <p className="xwb-kicker">Your brief. Your repository.</p>

          <h2>
            Build the website
            <em> you can keep building.</em>
          </h2>

          <p>
            Start from an outcome, keep ownership of the implementation, and
            move from design direction to a verified project state.
          </p>

          <div>
            <Link className="xwb-primary-button" href="/auth/signup">
              Start building
              <ArrowRight aria-hidden="true" />
            </Link>

            <Link className="xwb-secondary-link" href="/showcase">
              See what people build
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
