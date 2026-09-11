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
      <PageJsonLd
        path={`/${data.slug}`}
        name={data.title}
        description={data.description}
      />

      <section className="xwb-hero">
        <AiWebsiteBuilderAtmosphere className="xwb-hero__atmosphere" />

        <div className="xwb-hero__stage">
          <div className="xwb-hero__content">
            <p className="xwb-pill">
              <Sparkles aria-hidden="true" />
              AI website builder · code you own
            </p>

            <h1>
              AI-Powered Website Builder
              <span>for real product work.</span>
            </h1>

            <p className="xwb-hero__intro">
              {data.intro}
            </p>

            <AiWebsiteBuilderPrompt />

            <p className="xwb-hero__note">
              Responsive pages, maintainable code, metadata, validation,
              and authorized publishing in one repository-aware workflow.
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
                <small>Actions connect to real operations or expose blockers.</small>
              </span>
            </div>

            <div>
              <Globe2 />
              <span>
                <b>Publish with evidence</b>
                <small>Keep provider deployment separate from visual preview.</small>
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
