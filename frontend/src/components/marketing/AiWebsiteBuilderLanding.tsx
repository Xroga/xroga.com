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
   * HERO-ONLY OVERRIDES
   * This changes only /ai-website-builder's hero.
   * Every section below the hero continues using the existing stylesheet.
   */

  .xwb-page {
    --xwb-hero-outer: #454a55;
  }

  body.theme-white .xwb-page {
    --xwb-hero-outer: #454a55;
  }

  body.theme-black .xwb-page {
    --xwb-hero-outer: #07080a;
  }

  body.theme-gray .xwb-page {
    --xwb-hero-outer: #3f434c;
  }

  body.theme-beige .xwb-page {
    --xwb-hero-outer: #d8cdbd;
  }

  .xwb-page .xwb-hero--reference {
    min-height: auto;
    padding:
      clamp(44px, 6vw, 82px)
      clamp(18px, 4vw, 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--xwb-hero-outer);
  }

  .xwb-page .xwb-hero--reference::after {
    display: none;
  }

  .xwb-page .xwb-hero--reference .xwb-hero__stage {
    position: relative;
    isolation: isolate;
    width: min(1180px, 100%);
    min-height: clamp(570px, 61vw, 720px);
    overflow: hidden;

    display: grid;
    place-items: center;

    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 2px;

    background:
      linear-gradient(180deg, #050607 0%, #050607 68%, #090b0f 100%);

    color: #f7f8fa;

    box-shadow:
      0 28px 85px rgba(0, 0, 0, 0.24),
      inset 0 1px 0 rgba(255, 255, 255, 0.035);

    backdrop-filter: none;
  }

  .xwb-page .xwb-hero--reference .xwb-hero__stage::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    width: auto;
    height: auto;
    pointer-events: none;
    filter: none;

    background:
      radial-gradient(
        ellipse 58% 36% at 50% 101%,
        rgba(79, 91, 122, 0.27) 0%,
        rgba(40, 46, 61, 0.13) 36%,
        transparent 72%
      ),
      radial-gradient(
        ellipse 28% 42% at 94% 14%,
        rgba(75, 85, 108, 0.11) 0%,
        transparent 76%
      );
  }

  .xwb-page .xwb-hero--reference .xwb-hero__stage::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
    width: auto;
    height: auto;
    pointer-events: none;
    filter: none;

    background:
      linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.018) 49.9%,
        rgba(255, 255, 255, 0.018) 50.1%,
        transparent 100%
      );
  }

  .xwb-page .xwb-hero__ambient {
    position: absolute;
    inset: 0;
    z-index: 1;
    overflow: hidden;
    pointer-events: none;
  }

  .xwb-page .xwb-hero__ambient::before {
    content: '';
    position: absolute;
    inset: 0;

    background-image:
      radial-gradient(circle, rgba(255, 255, 255, 0.24) 0 0.7px, transparent 0.9px),
      radial-gradient(circle, rgba(255, 255, 255, 0.13) 0 0.6px, transparent 0.8px);
    background-position:
      0 0,
      13px 17px;
    background-size:
      31px 31px,
      43px 43px;

    opacity: 0.22;
    mask-image:
      radial-gradient(
        ellipse 78% 76% at 50% 48%,
        #000 0%,
        rgba(0, 0, 0, 0.72) 42%,
        transparent 86%
      );
  }

  .xwb-page .xwb-hero__ambient::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 12%;
    width: 1px;
    height: 69%;
    transform: translateX(-50%);

    background:
      linear-gradient(
        180deg,
        transparent,
        rgba(255, 255, 255, 0.10) 20%,
        rgba(255, 255, 255, 0.028) 66%,
        transparent
      );
  }

  .xwb-page .xwb-hero__ambient i {
    position: absolute;
    top: -16%;
    width: 1px;
    height: 33%;
    display: block;

    background:
      linear-gradient(
        180deg,
        transparent,
        rgba(255, 255, 255, 0.20),
        rgba(255, 255, 255, 0.04),
        transparent
      );

    opacity: 0.32;
    animation: xwb-reference-rail 8s linear infinite;
  }

  .xwb-page .xwb-hero__ambient i:nth-child(1) {
    left: 43.5%;
    animation-delay: -1.4s;
  }

  .xwb-page .xwb-hero__ambient i:nth-child(2) {
    left: 47%;
    height: 25%;
    opacity: 0.19;
    animation-delay: -5.2s;
  }

  .xwb-page .xwb-hero__ambient i:nth-child(3) {
    left: 53%;
    height: 29%;
    opacity: 0.22;
    animation-delay: -3.1s;
  }

  .xwb-page .xwb-hero__ambient i:nth-child(4) {
    left: 56.5%;
    height: 21%;
    opacity: 0.16;
    animation-delay: -6.5s;
  }

  .xwb-page .xwb-hero--reference .xwb-hero__content {
    position: relative;
    z-index: 3;

    width: min(760px, calc(100% - 34px));

    display: flex;
    flex-direction: column;
    align-items: center;

    padding:
      clamp(74px, 8vw, 112px)
      0
      clamp(62px, 7vw, 96px);

    color: #f7f8fa;
    text-align: center;
  }

  .xwb-page .xwb-hero--reference .xwb-pill {
    min-height: 26px;
    padding: 0 10px;
    gap: 6px;

    border: 1px solid rgba(255, 255, 255, 0.24);
    border-radius: 999px;

    background: rgba(5, 6, 7, 0.58);
    color: rgba(255, 255, 255, 0.72);

    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.025),
      0 6px 24px rgba(0, 0, 0, 0.18);

    font-size: 9px;
    letter-spacing: 0.055em;
    text-transform: none;
  }

  .xwb-page .xwb-hero--reference .xwb-pill svg {
    width: 10px;
    height: 10px;
    color: rgba(255, 255, 255, 0.90);
  }

  .xwb-page .xwb-hero--reference h1 {
    max-width: 760px;
    margin: 24px 0 0;

    color: #f7f8fa;

    font-size: clamp(32px, 4vw, 54px);
    font-weight: 470;
    line-height: 1.08;
    letter-spacing: -0.045em;
  }

  .xwb-page .xwb-hero--reference h1 span {
    display: block;
    margin-top: 4px;

    color: rgba(247, 248, 250, 0.94);

    font-size: 1em;
    font-weight: 470;
    line-height: inherit;
    letter-spacing: inherit;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt-wrap {
    width: min(640px, 100%);
    margin-top: 34px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt {
    overflow: hidden;

    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 14px;

    background:
      linear-gradient(
        180deg,
        rgba(47, 50, 58, 0.97),
        rgba(38, 41, 48, 0.97)
      );

    box-shadow:
      0 20px 55px rgba(0, 0, 0, 0.34),
      inset 0 1px 0 rgba(255, 255, 255, 0.045);

    backdrop-filter: blur(12px);
  }

  .xwb-page .xwb-hero--reference .xwb-prompt textarea {
    min-height: 76px;
    padding: 17px 17px 10px;

    color: #f5f6f8;

    font-size: 12px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt textarea::placeholder {
    color: rgba(255, 255, 255, 0.68);
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__bar {
    padding: 7px 10px 10px;
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__tools {
    color: rgba(255, 255, 255, 0.55);
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__tools i::before {
    background: rgba(215, 224, 255, 0.86);
    box-shadow: 0 0 12px rgba(132, 161, 255, 0.42);
  }

  .xwb-page .xwb-hero--reference .xwb-prompt__bar > button {
    width: 32px;
    height: 32px;

    background: #f7f8fa;
    color: #090a0d;

    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.30),
      inset 0 -1px 0 rgba(0, 0, 0, 0.10);
  }

  .xwb-page .xwb-hero--reference .xwb-quick-starts {
    gap: 6px;
    margin-top: 12px;
  }

  .xwb-page .xwb-hero--reference .xwb-quick-starts button {
    padding: 6px 10px;

    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 999px;

    background: rgba(7, 8, 10, 0.70);
    color: rgba(255, 255, 255, 0.64);

    font-size: 9px;
  }

  .xwb-page .xwb-hero--reference .xwb-quick-starts button:hover {
    border-color: rgba(255, 255, 255, 0.30);
    color: #ffffff;
    background: rgba(20, 22, 27, 0.88);
  }

  .xwb-page .xwb-hero--reference .xwb-hero__intro {
    max-width: 780px;
    margin: clamp(60px, 8vw, 94px) 0 0;

    color: rgba(255, 255, 255, 0.49);

    font-size: clamp(12px, 1.25vw, 15px);
    line-height: 1.62;
  }

  @keyframes xwb-reference-rail {
    0% {
      transform: translateY(-15%);
      opacity: 0;
    }

    16% {
      opacity: 0.28;
    }

    76% {
      opacity: 0.20;
    }

    100% {
      transform: translateY(430%);
      opacity: 0;
    }
  }

  @media (max-width: 760px) {
    .xwb-page .xwb-hero--reference {
      padding: 24px 14px 40px;
    }

    .xwb-page .xwb-hero--reference .xwb-hero__stage {
      min-height: 650px;
    }

    .xwb-page .xwb-hero--reference .xwb-hero__content {
      width: min(100% - 26px, 700px);
      padding: 72px 0 62px;
    }

    .xwb-page .xwb-hero--reference h1 {
      font-size: clamp(31px, 10vw, 44px);
    }

    .xwb-page .xwb-hero--reference .xwb-prompt-wrap {
      margin-top: 30px;
    }

    .xwb-page .xwb-hero--reference .xwb-hero__intro {
      margin-top: 58px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .xwb-page .xwb-hero__ambient i {
      animation: none;
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
          <div className="xwb-hero__ambient" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>

          <div className="xwb-hero__content">
            <p className="xwb-pill">
              <Sparkles aria-hidden="true" />
              Most powerful AI website builder
            </p>

            <h1>
              AI-Powered Website Builder For
              <span>React.js and Tailwind CSS</span>
            </h1>

            <AiWebsiteBuilderPrompt />

            <p className="xwb-hero__intro">
              {data.intro}
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
