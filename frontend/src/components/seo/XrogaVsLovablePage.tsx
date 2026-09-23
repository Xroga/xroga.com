import Link from 'next/link';
import type { ReactNode } from 'react';

import { ABOUT_FOUNDER } from '@/lib/aboutContent';
import {
  buildWebPageJsonLd,
  ORGANIZATION_ID,
  SITE_URL,
} from '@/lib/seo';

import '@/styles/xroga-vs-lovable.css';

export const XROGA_VS_LOVABLE_PATH = '/compare/xroga-vs-lovable';

const COMPARISON_IMAGES = {
  hero: 'https://i.postimg.cc/NMXD1vSr/01-hero-xroga-vs-lovable.png',
  atAGlance: 'https://i.postimg.cc/25q0TZM0/02-at-a-glance.png',
  differentPaths:
    'https://i.postimg.cc/ZnY3sknf/03-same-request-different-paths.png',
  proof:
    'https://i.postimg.cc/kGjSkjtx/04-working-software-proof.png',
  future:
    'https://i.postimg.cc/4xHcSQ4y/05-build-today-go-further.png',
} as const;

export const XROGA_VS_LOVABLE_TITLE =
  'Xroga vs Lovable (2026): Which AI App Builder Fits Your Project?';

export const XROGA_VS_LOVABLE_DESCRIPTION =
  'Compare Xroga vs Lovable in 2026 across existing repositories, GitHub, testing, previews, deployment, code ownership, pricing, and product fit.';

export const XROGA_VS_LOVABLE_OG_IMAGE =
  '/opengraph-image';

const REVIEWED = '2026-09-23';
const PUBLISHED = '2026-09-09';

const LOVABLE_GITHUB = 'https://docs.lovable.dev/integrations/github';
const LOVABLE_PUBLISH = 'https://docs.lovable.dev/features/publish';
const LOVABLE_SECURITY = 'https://docs.lovable.dev/features/security';
const LOVABLE_PLANS =
  'https://docs.lovable.dev/introduction/subscription-plans';
const LOVABLE_PRICING = 'https://lovable.dev/pricing';

const FAQS = [
  {
    question: 'Is Xroga better than Lovable?',
    answer:
      'It depends on the workflow. Lovable is particularly strong for starting new browser-based web apps quickly. Xroga is a stronger fit when work needs to begin from an existing repository, remain reviewable in GitHub, run project-specific checks, or continue through provider accounts the team controls.',
  },
  {
    question: 'Can Lovable import an existing GitHub repository?',
    answer:
      'Not currently. Lovable supports extensive two-way GitHub synchronization after a Lovable project exists, but its official GitHub documentation currently says importing an existing GitHub repository into Lovable is unsupported.',
  },
  {
    question: 'Does Lovable support GitHub?',
    answer:
      'Yes. Lovable supports two-way Git synchronization, branch switching, branch creation, local cloning and pull-request workflows. The important limitation is where the workflow begins: connecting a Lovable project creates a new repository rather than importing an arbitrary existing repository.',
  },
  {
    question: 'Can Xroga work with an existing repository?',
    answer:
      'Yes. Xroga can start from an authorized GitHub repository, inspect existing architecture, make focused changes, run applicable project checks and prepare reviewable repository work.',
  },
  {
    question: 'Does Lovable let you own your code?',
    answer:
      'Yes. Lovable states that customers own the projects and generated code they create. It also supports Git synchronization and codebase download on eligible plans.',
  },
  {
    question: 'Is Lovable good for production apps?',
    answer:
      'Lovable includes hosting, custom domains, Git synchronization and built-in security scanning, so it should not be described as a prototype-only tool. Production fit still depends on the application architecture, permissions, data model, integrations, checks and operational requirements.',
  },
  {
    question: 'Can Lovable publish native iOS or Android apps?',
    answer:
      'Lovable currently publishes web applications to web URLs. Its official publishing documentation says there is no built-in flow that packages and submits a project directly to the Apple App Store or Google Play.',
  },
  {
    question: 'How much does Lovable cost in 2026?',
    answer:
      'Lovable currently lists Pro at $25 per month for 100 monthly credits, with larger credit allocations available. Credit consumption depends on the work performed, so Lovable credits should not be treated as directly equivalent to Xroga actions.',
  },
  {
    question: 'Which is a better fit for an existing SaaS product?',
    answer:
      'Xroga has the more direct documented workflow when the existing repository itself is the starting point. Lovable has strong Git synchronization after a Lovable project exists, but its current documentation does not support importing an arbitrary existing GitHub repository as that starting project.',
  },
];

const SOURCES = [
  {
    label: 'Lovable — GitHub Git sync',
    href: LOVABLE_GITHUB,
  },
  {
    label: 'Lovable — Publish a project',
    href: LOVABLE_PUBLISH,
  },
  {
    label: 'Lovable — Security overview',
    href: LOVABLE_SECURITY,
  },
  {
    label: 'Lovable — Subscription plans',
    href: LOVABLE_PLANS,
  },
  {
    label: 'Lovable — Pricing and code ownership',
    href: LOVABLE_PRICING,
  },
  {
    label: 'Xroga — AI App Builder',
    href: '/ai-app-builder',
  },
  {
    label: 'Xroga — AI Coding Agent',
    href: '/ai-coding-agent',
  },
  {
    label: 'Xroga — Security',
    href: '/security',
  },
  {
    label: 'Xroga — Pricing',
    href: '/pricing',
  },
];

const TOC = [
  ['quick-comparison', 'Xroga vs Lovable at a glance'],
  ['lovable-strengths', 'What Lovable does well'],
  ['starting-point', 'Where the workflows diverge'],
  ['github', 'GitHub and existing repositories'],
  ['verification', 'Testing, security and “done”'],
  ['preview-deployment', 'Preview, publishing and deployment'],
  ['ownership-pricing', 'Ownership and pricing'],
  ['which-to-choose', 'Which one should you choose?'],
  ['faq', 'Frequently asked questions'],
] as const;

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

function Source({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      className="xvl-source-link"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <span aria-hidden="true"> ↗</span>
    </a>
  );
}

function Figure({
  src,
  alt,
  caption,
  priority = false,
}: {
  src: string;
  alt: string;
  caption: string;
  priority?: boolean;
}) {
  return (
    <figure className="xvl-figure">
      <img
        src={src}
        alt={alt}
        width="1600"
        height="900"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
      />

      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function XrogaVsLovablePage() {
  const url = `${SITE_URL}${XROGA_VS_LOVABLE_PATH}`;
  const absoluteHero = `${SITE_URL}${XROGA_VS_LOVABLE_OG_IMAGE}`;

  const webPageSchema = buildWebPageJsonLd({
    path: XROGA_VS_LOVABLE_PATH,
    name: XROGA_VS_LOVABLE_TITLE,
    description: XROGA_VS_LOVABLE_DESCRIPTION,
  });

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: XROGA_VS_LOVABLE_TITLE,
    description: XROGA_VS_LOVABLE_DESCRIPTION,
    url,
    image: absoluteHero,
    datePublished: PUBLISHED,
    dateModified: REVIEWED,
    author: {
      '@type': 'Person',
      name: ABOUT_FOUNDER.name,
      url: `${SITE_URL}/about#founder`,
    },
    publisher: {
      '@id': ORGANIZATION_ID,
    },
    mainEntityOfPage: {
      '@id': `${url}#webpage`,
    },
    articleSection: [
      'AI app builders',
      'Product comparisons',
      'GitHub workflows',
      'AI software development',
    ],
    about: [
      {
        '@type': 'SoftwareApplication',
        name: 'Xroga',
        url: SITE_URL,
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Lovable',
        url: 'https://lovable.dev',
      },
    ],
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Compare',
        item: `${SITE_URL}/compare`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Xroga vs Lovable',
        item: url,
      },
    ],
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <main className="xvl-page">
      <JsonLd data={webPageSchema} />
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />

      <div className="xvl-shell">
        <nav className="xvl-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/compare">Compare</Link>
          <span aria-hidden="true">/</span>
          <span>Xroga vs Lovable</span>
        </nav>

        <article>
          <header className="xvl-hero">
            <p className="xvl-eyebrow">AI app builder comparison · 2026</p>

            <h1>
              Xroga vs Lovable (2026): Which AI App Builder Fits Your Project?
            </h1>

            <p className="xvl-hero-dek">
              Building the first version of an app with AI is becoming easier.
              The more important question is what happens after the first
              prompt. We compare Xroga and Lovable across new app creation,
              existing repositories, GitHub, validation, previews, publishing,
              code ownership and the work that follows version one.
            </p>

            <div className="xvl-hero-meta">
              <span>Updated September 23, 2026</span>
              <span aria-hidden="true">·</span>
              <span>12 min read</span>
              <span aria-hidden="true">·</span>
              <span>Official sources linked</span>
            </div>

            <div className="xvl-hero-actions">
              <Link className="xvl-primary-button" href="/auth/signup">
                Start building free
              </Link>

              <Link className="xvl-secondary-button" href="/ai-app-builder">
                See how Xroga works
              </Link>
            </div>
          </header>

          <aside className="xvl-disclosure">
            <strong>Editorial disclosure</strong>

            <p>
              This comparison is published by Xroga. Lovable capabilities are
              checked against Lovable&apos;s official documentation. We
              distinguish documented capabilities from our interpretation and
              do not present an unrun performance benchmark as fact.
            </p>
          </aside>

          <Figure
  src={COMPARISON_IMAGES.hero}
  alt="Xroga versus Lovable AI app builder comparison showing two different ways to turn an idea into software"
  caption="Two ways to turn an idea into software. The real difference becomes clearer after generation."
  priority
/>

          <section className="xvl-direct-answer" aria-labelledby="short-answer">
            <p className="xvl-kicker">The 30-second answer</p>

            <h2 id="short-answer">The first prompt is only the beginning.</h2>

            <p>
              <strong>Lovable</strong> is especially compelling when the job
              starts with “I have an idea — build me a web app.” Its
              browser-first workflow compresses generation, preview, iteration
              and publishing into one approachable environment.
            </p>

            <p>
              <strong>Xroga</strong> becomes more differentiated when the job
              is “build this product — and keep working with the software after
              the first version.” Xroga can start from a prompt or an existing
              repository, reuse project architecture, run applicable checks,
              expose preview and review evidence, and work through accounts you
              authorize.
            </p>

            <p className="xvl-direct-answer__bottom">
              The useful decision is not simply which AI generates code. It is
              where your project begins, where the code lives, and what must
              happen after generation.
            </p>
          </section>

          <div className="xvl-layout">
            <aside className="xvl-toc" aria-label="On this page">
              <strong>On this page</strong>

              {TOC.map(([id, label]) => (
                <a key={id} href={`#${id}`}>
                  {label}
                </a>
              ))}
            </aside>

            <div className="xvl-content">
              <section id="quick-comparison">
                <p className="xvl-section-label">01 · Quick comparison</p>

                <h2>Xroga vs Lovable at a glance</h2>

                <p>
                  Both products can turn natural-language requirements into
                  working software. Their biggest differences are the starting
                  point, the relationship with the repository, how validation
                  is surfaced, and how publishing fits into the workflow.
                </p>

                <div className="xvl-table-wrap">
                  <table>
                    <caption>
                      Current documented workflow comparison · reviewed
                      September 23, 2026
                    </caption>

                    <thead>
                      <tr>
                        <th scope="col">Decision</th>
                        <th scope="col">Xroga</th>
                        <th scope="col">Lovable</th>
                        <th scope="col">Why it matters</th>
                      </tr>
                    </thead>

                    <tbody>
                      <tr>
                        <th scope="row">Starting point</th>
                        <td>New idea or existing repository</td>
                        <td>New Lovable project</td>
                        <td>
                          Matters when software already exists before the AI
                          task starts.
                        </td>
                      </tr>

                      <tr>
                        <th scope="row">Interaction</th>
                        <td>Natural-language outcome</td>
                        <td>Natural-language app creation</td>
                        <td>Both reduce the need to start from raw code.</td>
                      </tr>

                      <tr>
                        <th scope="row">Existing external repo</th>
                        <td>Supported starting point</td>
                        <td>
                          Existing GitHub repo import is currently unsupported
                        </td>
                        <td>
                          One of the clearest differences for established
                          projects.
                        </td>
                      </tr>

                      <tr>
                        <th scope="row">GitHub</th>
                        <td>
                          Repository-aware work, branches and reviewable
                          changes
                        </td>
                        <td>
                          Two-way Git sync, branches, local cloning and PR
                          workflows
                        </td>
                        <td>Both support GitHub, but they enter it differently.</td>
                      </tr>

                      <tr>
                        <th scope="row">Validation</th>
                        <td>Applicable project checks and visible blockers</td>
                        <td>Built-in security scans and project checks</td>
                        <td>
                          “Generated” and “verified” should not be treated as
                          the same state.
                        </td>
                      </tr>

                      <tr>
                        <th scope="row">Preview</th>
                        <td>Preview attached to project/build state</td>
                        <td>Integrated browser preview and iteration</td>
                        <td>Both shorten the feedback loop.</td>
                      </tr>

                      <tr>
                        <th scope="row">Publishing</th>
                        <td>Authorized provider accounts when configured</td>
                        <td>Built-in Lovable publishing and hosting</td>
                        <td>
                          Different trade-offs between convenience and provider
                          ownership.
                        </td>
                      </tr>

                      <tr>
                        <th scope="row">Code ownership</th>
                        <td>Inspectable repository/source</td>
                        <td>Lovable states that users own generated code</td>
                        <td>
                          The bigger distinction is workflow, not whether code
                          can be owned.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p>
                  Lovable deserves an important clarification here: it is not a
                  “no GitHub” product. Lovable currently supports two-way Git
                  synchronization, branch operations, cloning and pull-request
                  workflows. Its documented limitation is more specific:
                  importing an existing GitHub repository into Lovable is
                  currently unsupported, and connecting a project creates a
                  new repository.{' '}
                  <Source href={LOVABLE_GITHUB}>
                    Lovable GitHub documentation
                  </Source>
                </p>

                <Figure
  src={COMPARISON_IMAGES.atAGlance}
  alt="At a glance comparison of Xroga and Lovable across starting point, codebase, validation, preview, deployment and ownership"
  caption="Both products can move from a description toward working software. Their starting points and relationship with the codebase differ."
/>
              </section>

              <section id="lovable-strengths">
                <p className="xvl-section-label">02 · Lovable&apos;s strengths</p>

                <h2>What Lovable genuinely does well</h2>

                <p>
                  Competitor comparison pages become hard to trust when every
                  paragraph exists to make the other product look weak.
                  Lovable became popular for a legitimate reason: it makes the
                  first mile of web-app creation unusually approachable.
                </p>

                <p>
                  A user can describe an application, iterate inside the
                  browser, see the result quickly and publish without first
                  building a traditional local development environment.
                  Lovable&apos;s current publishing documentation describes a
                  two-click first-publish flow, a suggested{' '}
                  <code>lovable.app</code> address and a Basic security scan in
                  the publishing dialog. Paid plans can add custom domains.{' '}
                  <Source href={LOVABLE_PUBLISH}>
                    Lovable publishing documentation
                  </Source>
                </p>

                <div className="xvl-callout-grid">
                  <article>
                    <span>01</span>
                    <h3>Fast browser start</h3>
                    <p>
                      Describe a new application and begin building without
                      first setting up a local project.
                    </p>
                  </article>

                  <article>
                    <span>02</span>
                    <h3>Integrated preview</h3>
                    <p>
                      The generation and visual feedback loop happens inside
                      the same product.
                    </p>
                  </article>

                  <article>
                    <span>03</span>
                    <h3>Built-in publishing</h3>
                    <p>
                      A hosted URL and publishing workflow are already part of
                      the product.
                    </p>
                  </article>
                </div>

                <p>
                  Lovable is also much more portable than an old-fashioned
                  closed no-code platform. Its Git integration lets users keep
                  a GitHub copy, collaborate through branches and pull
                  requests, clone locally and continue in another IDE.
                  Lovable&apos;s pricing page also explicitly states that users
                  own their generated projects and code.{' '}
                  <Source href={LOVABLE_PRICING}>
                    Lovable pricing and ownership
                  </Source>
                </p>

                <p>
                  That means Xroga should not be positioned as “the product
                  that finally gives you code.” Lovable already gives users
                  code. The more interesting difference appears when the code
                  already exists before the AI task starts.
                </p>
              </section>

              <section id="starting-point">
                <p className="xvl-section-label">03 · Starting point</p>

                <h2>Where the workflows begin to diverge</h2>

                <p>
                  Imagine that your product already has authentication,
                  billing, an API, a database schema, tests, customers and an
                  established visual system.
                </p>

                <blockquote className="xvl-request">
                  “Add subscription management to our existing customer
                  portal. Use the billing system already in the project,
                  preserve the current design and run the relevant checks.”
                </blockquote>

                <p>
                  With Xroga, that task can begin with the repository that
                  already contains the product. The current Xroga app-builder
                  and coding-agent workflows are designed to inspect existing
                  architecture, reuse conventions and tests, make focused
                  changes and preserve the project as the continuing source of
                  truth.
                </p>

                <p>
                  Lovable&apos;s Git support becomes powerful after a Lovable
                  project exists, but its current official documentation says
                  an arbitrary existing GitHub repository cannot be imported
                  into Lovable as the starting project. Connecting GitHub to a
                  Lovable project creates a new repository and starts
                  synchronization.{' '}
                  <Source href={LOVABLE_GITHUB}>
                    Lovable Git sync limitations
                  </Source>
                </p>

                <div className="xvl-rule">
                  <strong>Simple decision rule</strong>

                  <div>
                    <p>
                      <b>Starting something new?</b>
                      <br />
                      Both products are viable.
                    </p>

                    <p>
                      <b>Continuing software that already exists?</b>
                      <br />
                      Xroga has the more direct documented starting workflow.
                    </p>
                  </div>
                </div>

                <Figure
  src={COMPARISON_IMAGES.differentPaths}
  alt="The same customer portal request taking different workflow paths in Xroga and Lovable"
  caption="Same request, different starting points. This difference becomes more important as a product accumulates architecture, history and users."
/>

                <h3>Same prompt. Different relationship with the project.</h3>

                <p>
                  Lovable&apos;s model can be summarized as{' '}
                  <strong>
                    describe → generate → preview → iterate → publish
                  </strong>
                  .
                </p>

                <p>
                  Xroga&apos;s repository-centered model can be summarized as{' '}
                  <strong>
                    describe or connect → implement in project context → verify
                    → preview and review → ship
                  </strong>
                  .
                </p>

                <p>
                  The difference looks small in a diagram. It becomes larger
                  over time. Applications accumulate dependencies, data,
                  permissions, customer requests, migrations and release
                  processes. Eventually the question stops being “Can AI
                  generate this screen?” and becomes “Can the team keep
                  changing this product confidently?”
                </p>
              </section>

              <section id="github">
                <p className="xvl-section-label">04 · GitHub</p>

                <h2>Both support GitHub. They do not use it in the same way.</h2>

                <h3>How Lovable approaches GitHub</h3>

                <p>
                  Lovable&apos;s current GitHub integration supports two-way
                  synchronization. Changes made in Lovable can sync to GitHub,
                  and changes pushed to the active synced branch can flow back
                  into Lovable. Users can switch branches, create branches,
                  clone locally and use pull-request workflows.{' '}
                  <Source href={LOVABLE_GITHUB}>
                    Official GitHub integration
                  </Source>
                </p>

                <p>
                  The key boundary is the beginning of the workflow. Lovable
                  states that project code is initially stored and managed in
                  Lovable. When a project is connected to GitHub, Lovable
                  creates a new repository. Its limitation section currently
                  says existing GitHub repositories cannot be imported into
                  Lovable.
                </p>

                <h3>How Xroga approaches GitHub</h3>

                <p>
                  Xroga treats the connected repository as part of the working
                  project state. A request can target the existing codebase,
                  retrieve relevant context, follow current patterns, apply
                  focused edits, run applicable checks and prepare reviewable
                  GitHub work.
                </p>

                <p>
                  The meaningful comparison is therefore not{' '}
                  <strong>GitHub versus no GitHub</strong>. It is{' '}
                  <strong>
                    GitHub as a project that can be exported and synchronized
                    versus GitHub as part of the project&apos;s starting and
                    continuing state
                  </strong>
                  .
                </p>

                <p>
                  For a brand-new MVP, the distinction may be small. For a
                  six-month-old SaaS with customers, migrations and an
                  established architecture, it can become one of the biggest
                  factors in the decision.
                </p>
              </section>

              <section id="verification">
                <p className="xvl-section-label">05 · Verification</p>

                <h2>What does “done” actually mean?</h2>

                <p>
                  One of the most dangerous phrases in AI software marketing
                  is “your app is ready.” Ready to preview, ready for a demo,
                  ready for production traffic and ready to process payments
                  are very different claims.
                </p>

                <p>
                  Xroga separates implementation from evidence. Applicable
                  project-defined type checks, tests, builds, runtime checks
                  and preview evidence can determine status. If required
                  provider access or configuration is missing, that should
                  remain a blocker rather than being turned into a success
                  message.
                </p>

                <p>
                  Lovable has also invested significantly in validation and
                  security. Its current security system includes a Basic scan
                  and Deep scan. The Basic scan covers areas such as RLS policy
                  linting, database schema/access review and dependency
                  vulnerabilities. Deep scan adds an agentic review of the
                  application code and additional security patterns. Lovable
                  correctly notes that these tools do not replace a thorough
                  security review.{' '}
                  <Source href={LOVABLE_SECURITY}>
                    Lovable security documentation
                  </Source>
                </p>

                <p>
                  So the accurate comparison is not “Xroga tests and Lovable
                  does not.” Lovable provides real platform security scanning.
                  Xroga&apos;s differentiation is that completion can remain
                  attached to the real checks and evidence produced by the
                  connected project.
                </p>

               <Figure
  src={COMPARISON_IMAGES.proof}
  alt="Xroga implementation workflow showing built changes, passed checks, preview evidence and reviewable files"
  caption="Generation is the beginning. The useful question is whether the result can be inspected, checked and continued."
/>

                <h3>Proof is more useful than a finished message.</h3>

                <p>
                  For a real implementation request, useful evidence answers
                  concrete questions: what changed, which checks ran, what
                  passed, what failed, what remains blocked, whether the result
                  can be previewed, and which repository contains the work.
                </p>

                <p>
                  That is the part of Xroga&apos;s product story that should do
                  the persuasion. The page does not need a “winner” badge when
                  the reader can see what a repository-centered verification
                  workflow is designed to preserve.
                </p>
              </section>

              <section id="preview-deployment">
                <p className="xvl-section-label">06 · Preview and deployment</p>

                <h2>Both understand the value of seeing the result quickly.</h2>

                <p>
                  Lovable&apos;s browser-first model makes preview and iteration
                  feel especially native: generate the application, inspect it,
                  keep prompting and publish from the same environment.
                </p>

                <p>
                  Lovable&apos;s built-in publishing is a genuine convenience
                  advantage. Its documentation describes a two-click first
                  publish, a <code>lovable.app</code> address, automatic Basic
                  security scanning in the publish dialog and custom domains
                  on paid plans.{' '}
                  <Source href={LOVABLE_PUBLISH}>
                    Lovable publish workflow
                  </Source>
                </p>

                <p>
                  Xroga keeps preview and deployment as separate pieces of
                  evidence. A visible preview can demonstrate that the
                  application renders in a configured environment; it does not
                  automatically prove that authentication, billing webhooks,
                  migrations, DNS, production environment variables or
                  rollback behavior are correct.
                </p>

                <div className="xvl-two-up">
                  <article>
                    <p className="xvl-mini-label">Lovable optimizes for</p>
                    <h3>Publishing convenience</h3>
                    <p>
                      Browser-first generation, integrated preview and a
                      managed route to a hosted result.
                    </p>
                  </article>

                  <article>
                    <p className="xvl-mini-label">Xroga optimizes for</p>
                    <h3>Visible delivery state</h3>
                    <p>
                      Keep code, checks, review state and authorized deployment
                      operations visibly separated.
                    </p>
                  </article>
                </div>

                <p>
                  Neither trade-off is universally better. Someone validating a
                  new idea may value the shortest possible route to a public
                  URL. A team operating an established product may care more
                  about knowing exactly which code and provider state produced
                  that release.
                </p>
              </section>

              <section id="ownership-pricing">
                <p className="xvl-section-label">07 · Ownership and pricing</p>

                <h2>Code ownership is not a Lovable weakness.</h2>

                <p>
                  Outdated comparison copy often describes browser builders as
                  if users cannot obtain their source code. That would be
                  inaccurate here.
                </p>

                <p>
                  Lovable&apos;s current pricing page says users own the
                  projects and code they create. Its Git workflow can keep an
                  external repository synchronized, and eligible paid users can
                  download their codebase directly.{' '}
                  <Source href={LOVABLE_PRICING}>
                    Lovable ownership statement
                  </Source>
                </p>

                <p>
                  Xroga also makes ownership central. Generated and modified
                  work remains inspectable in a repository, while provider
                  operations happen through accounts the user authorizes.
                </p>

                <p>
                  The more useful question is therefore not “Can I legally own
                  my generated files?” It is “Where does my code live during
                  normal work, and can the next task continue from the project
                  state I already have?”
                </p>

                <h3>Xroga vs Lovable pricing in 2026</h3>

                <div className="xvl-pricing-grid">
                  <article>
                    <p className="xvl-mini-label">Xroga</p>
                    <strong>$0 Free</strong>
                    <strong>$25/month Pro</strong>
                    <p>
                      Xroga&apos;s current public product contract uses Free and
                      Xroga Pro. Capacity is measured in Xroga usage/actions,
                      not Lovable credits.
                    </p>
                    <Link href="/pricing">View Xroga pricing →</Link>
                  </article>

                  <article>
                    <p className="xvl-mini-label">Lovable</p>
                    <strong>Free plan</strong>
                    <strong>$25/month Pro · 100 credits</strong>
                    <p>
                      Lovable offers higher credit tiers as well. Credit usage
                      varies by work performed and should not be mapped
                      one-for-one to Xroga actions.
                    </p>
                    <Source href={LOVABLE_PLANS}>
                      View Lovable subscription plans
                    </Source>
                  </article>
                </div>

                <p>
                  “100 credits” and “1,500 actions” are not standardized units.
                  A useful buying test is to run a representative workflow and
                  observe how much real work the included capacity completes
                  rather than manufacturing a value-per-credit winner.
                </p>

                <h3>What about native mobile apps?</h3>

                <p>
                  Lovable&apos;s official publishing documentation currently
                  says Lovable publishes web applications to web URLs and does
                  not have a built-in flow that packages and submits a project
                  directly to the Apple App Store or Google Play.{' '}
                  <Source href={LOVABLE_PUBLISH}>
                    Lovable native app publishing FAQ
                  </Source>
                </p>

                <p>
                  Xroga lists mobile applications among supported product
                  categories, but native release work can still require
                  project-specific tooling, credentials and store processes.
                  Neither product should imply that a complex store release is
                  automatically complete because a mobile interface was
                  generated.
                </p>
              </section>

              <section id="which-to-choose">
                <p className="xvl-section-label">08 · Decision</p>

                <h2>Which should you choose?</h2>

                <div className="xvl-choice-grid">
                  <article>
                    <p className="xvl-mini-label">Consider Lovable when</p>

                    <h3>The browser-first path is the product advantage.</h3>

                    <ul>
                      <li>You are starting a new web application.</li>
                      <li>You want very little setup before seeing a result.</li>
                      <li>Integrated browser preview is central to your loop.</li>
                      <li>
                        Built-in hosting and publishing are more important than
                        provider-level control.
                      </li>
                      <li>
                        Lovable&apos;s supported web stack fits your product.
                      </li>
                    </ul>
                  </article>

                  <article className="xvl-choice-grid__xroga">
                    <p className="xvl-mini-label">Consider Xroga when</p>

                    <h3>The software has a life after generation.</h3>

                    <ul>
                      <li>You already have a repository or application.</li>
                      <li>
                        Existing architecture and project conventions should be
                        preserved.
                      </li>
                      <li>
                        Your team wants project-defined checks and visible
                        blockers.
                      </li>
                      <li>Changes should remain reviewable in GitHub.</li>
                      <li>
                        Deployment should stay attached to accounts your team
                        controls.
                      </li>
                    </ul>
                  </article>
                </div>

                <Figure
  src={COMPARISON_IMAGES.future}
  alt="Xroga long-term workflow from starting an idea through existing repository work, verification and deployment"
  caption="Start simple. Keep going when the product gets serious."
/>

                <h3>The first prompt is only the beginning.</h3>

                <p>
                  A product rarely stays a prompt. The first version attracts
                  users. Users create requirements. Requirements create
                  changes. Changes create regressions. Teams create review
                  processes. Growth creates operational constraints.
                </p>

                <p>
                  Eventually, “Can AI generate this?” becomes a less important
                  question than “Can AI help us keep building it?”
                </p>

                <div className="xvl-final-verdict">
                  <p className="xvl-kicker">Our conclusion</p>

                  <h3>
                    Lovable shortens the distance from idea to first web app.
                    Xroga is designed to keep shortening the distance after
                    that.
                  </h3>

                  <p>
                    Choose Lovable when browser-first creation and integrated
                    publishing are the highest priorities. Consider Xroga when
                    you want the same natural-language starting point but need
                    the work to remain connected to an existing or inspectable
                    repository, project-defined checks, reviewable source
                    changes and provider accounts you control.
                  </p>

                  <p>
                    For a prototype you may discard next week, the distinction
                    might not matter. For software you expect to maintain next
                    year, it increasingly can.
                  </p>

                  <div className="xvl-hero-actions">
                    <Link className="xvl-primary-button" href="/auth/signup">
                      Build something you can keep building
                    </Link>

                    <Link
                      className="xvl-secondary-button"
                      href="/ai-coding-agent"
                    >
                      Explore the coding agent
                    </Link>
                  </div>
                </div>
              </section>

              <section id="faq">
                <p className="xvl-section-label">09 · FAQ</p>

                <h2>Questions people ask about Xroga vs Lovable</h2>

                <p>
                  These answers cover the search questions that usually matter
                  once someone moves beyond a generic “which is better?”
                  comparison.
                </p>

                <div className="xvl-faq">
                  {FAQS.map((faq) => (
                    <details key={faq.question}>
                      <summary>{faq.question}</summary>
                      <p>{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <section className="xvl-methodology">
            <p className="xvl-section-label">Methodology</p>

            <h2>How this comparison was researched</h2>

            <p>
              This page was reviewed against current public product
              documentation on September 23, 2026. Lovable claims are sourced
              primarily from Lovable&apos;s official GitHub, publishing,
              security, subscription and pricing documentation. Xroga claims
              are tied to current Xroga product pages, source configuration and
              verified public capability contracts.
            </p>

            <p>
              We did not run a controlled speed, code-quality or reliability
              benchmark for this article. A future benchmark should give both
              products the same task, acceptance criteria and project context,
              then publish the methodology and observed results alongside the
              conclusions.
            </p>
          </section>

          <section
            className="xvl-sources"
            aria-labelledby="xvl-source-heading"
          >
            <p className="xvl-section-label">Primary sources</p>

            <h2 id="xvl-source-heading">Verify the product facts yourself</h2>

            <p>
              AI software products change quickly. These are the primary pages
              used for the comparison and should be checked again when making
              a purchasing decision.
            </p>

            <ul>
              {SOURCES.map((source) => (
                <li key={source.href}>
                  {source.href.startsWith('/') ? (
                    <Link href={source.href}>{source.label}</Link>
                  ) : (
                    <a
                      href={source.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section
            className="xvl-related"
            aria-labelledby="xvl-related-heading"
          >
            <p className="xvl-section-label">Continue your evaluation</p>

            <h2 id="xvl-related-heading">
              Go deeper before you choose a platform
            </h2>

            <div className="xvl-related-grid">
              <Link href="/alternatives/lovable-alternative">
                <span>Lovable alternatives</span>
                <small>Compare other workflows →</small>
              </Link>

              <Link href="/migrate/lovable-to-xroga">
                <span>Move from Lovable to Xroga</span>
                <small>Migration guide →</small>
              </Link>

              <Link href="/ai-app-builder">
                <span>Xroga AI App Builder</span>
                <small>Start from a product outcome →</small>
              </Link>

              <Link href="/ai-coding-agent">
                <span>Xroga AI Coding Agent</span>
                <small>Work in an existing repository →</small>
              </Link>

              <Link href="/security">
                <span>Security and evidence</span>
                <small>See the boundaries →</small>
              </Link>

              <Link href="/learn/production-readiness-checklist">
                <span>Production-readiness checklist</span>
                <small>Check before shipping →</small>
              </Link>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}
