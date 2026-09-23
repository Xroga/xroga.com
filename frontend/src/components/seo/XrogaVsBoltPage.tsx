import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ABOUT_FOUNDER } from '@/lib/aboutContent';
import {
  buildWebPageJsonLd,
  ORGANIZATION_ID,
  SITE_URL,
} from '@/lib/seo';

import '@/styles/xroga-vs-bolt.css';


export const XROGA_VS_BOLT_PATH =
  '/compare/xroga-vs-bolt';

export const XROGA_VS_BOLT_TITLE =
  'Xroga vs Bolt.new (2026): Which AI App Builder Fits Your Project?';

export const XROGA_VS_BOLT_DESCRIPTION =
  'Compare Xroga vs Bolt.new in 2026 across AI app building, GitHub, existing repositories, web research, testing, mobile use, databases, integrations, deployment, pricing, and code ownership.';

export const XROGA_VS_BOLT_OG_IMAGE =
  '/compare/xroga-vs-bolt/01-xroga-vs-bolt-hero.webp';


const REVIEWED =
  '2026-09-23';

const PUBLISHED =
  '2026-09-23';


const BOLT = {
  home:
    'https://bolt.new/',

  pricing:
    'https://bolt.new/pricing',

  github:
    'https://bolt.new/blog/github-hackathon',

  connectors:
    'https://bolt.new/blog/introducing-connectors',

  v2:
    'https://bolt.new/blog/introducing-bolt-v2',

  technologies:
    'https://support.bolt.new/building/using-bolt/browser-support',

  designSystem:
    'https://bolt.new/blog/bolt-design-system-agents',
} as const;


const COMPOSIO_TOOLKITS =
  'https://docs.composio.dev/toolkits';


const IMAGES = {
  hero:
    '/compare/xroga-vs-bolt/01-xroga-vs-bolt-hero.webp',

  workflow:
    '/compare/xroga-vs-bolt/02-same-request-different-path.webp',

  strengths:
    '/compare/xroga-vs-bolt/03-xroga-bolt-strength-map.webp',

  proof:
    '/compare/xroga-vs-bolt/04-xroga-proof-before-done.webp',

  audience:
    '/compare/xroga-vs-bolt/05-xroga-for-every-builder.webp',
} as const;


type ComparisonTone =
  | 'shared'
  | 'xroga'
  | 'bolt'
  | 'limited';


type ComparisonRow = {
  capability: string;
  xroga: string;
  bolt: string;
  note: string;
  xrogaTone: ComparisonTone;
  boltTone: ComparisonTone;
};


const COMPARISON_ROWS:
  ComparisonRow[] = [

  {
    capability:
      'Build from plain language',

    xroga:
      'Yes',

    bolt:
      'Yes',

    note:
      'Both products are designed around natural-language software creation.',

    xrogaTone:
      'shared',

    boltTone:
      'shared',
  },

  {
    capability:
      'Browser-based workspace',

    xroga:
      'Yes',

    bolt:
      'Yes — a major strength',

    note:
      'Bolt is especially strong at running a JavaScript application directly inside its browser development environment.',

    xrogaTone:
      'shared',

    boltTone:
      'bolt',
  },

  {
    capability:
      'Existing GitHub repositories',

    xroga:
      'Yes',

    bolt:
      'Yes',

    note:
      'Bolt now supports importing existing GitHub repositories, so this is a shared capability.',

    xrogaTone:
      'shared',

    boltTone:
      'shared',
  },

  {
    capability:
      'GitHub branch / sync workflow',

    xroga:
      'Repository-aware branches and reviewable work',

    bolt:
      'Two-way Git sync',

    note:
      'Bolt has a particularly polished documented two-way GitHub synchronization flow.',

    xrogaTone:
      'shared',

    boltTone:
      'bolt',
  },

  {
    capability:
      'Current web research during product work',

    xroga:
      'Built into the workflow',

    bolt:
      'No equivalent first-class research workflow found in the reviewed Bolt product docs',

    note:
      'Xroga can use current public sources and API/provider research as implementation context.',

    xrogaTone:
      'xroga',

    boltTone:
      'limited',
  },

  {
    capability:
      'Backend language breadth',

    xroga:
      'Repository-oriented across multiple supported stacks',

    bolt:
      'JavaScript / Node.js backend focus',

    note:
      'Bolt currently says PHP and Python backends are not compatible with its builder.',

    xrogaTone:
      'xroga',

    boltTone:
      'limited',
  },

  {
    capability:
      'Builder on mobile browsers',

    xroga:
      'Responsive desktop, tablet and phone workspace',

    bolt:
      'Mobile browsers not fully supported',

    note:
      'Bolt currently recommends desktop Chromium-based browsers for building.',

    xrogaTone:
      'xroga',

    boltTone:
      'limited',
  },

  {
    capability:
      'Mobile application projects',

    xroga:
      'Supported project workflows',

    bolt:
      'Expo-compatible projects',

    note:
      'Both can participate in mobile-app project creation.',

    xrogaTone:
      'shared',

    boltTone:
      'shared',
  },

  {
    capability:
      'Database and authentication',

    xroga:
      'Supported provider/project workflows',

    bolt:
      'Bolt Cloud + external provider options',

    note:
      'Bolt has the more integrated first-party cloud experience here.',

    xrogaTone:
      'shared',

    boltTone:
      'bolt',
  },

  {
    capability:
      'Built-in hosting',

    xroga:
      'Deploy through supported authorised providers',

    bolt:
      'Bolt Cloud',

    note:
      'Bolt has the stronger all-in-one native hosting story.',

    xrogaTone:
      'limited',

    boltTone:
      'bolt',
  },

  {
    capability:
      'Browser/runtime verification',

    xroga:
      'Explicit checks, evidence and blockers',

    bolt:
      'Runs, tests, debugs and iterates',

    note:
      'Both go beyond static code generation; Xroga makes generated, validated and deployed states especially explicit.',

    xrogaTone:
      'xroga',

    boltTone:
      'shared',
  },

  {
    capability:
      'External services',

    xroga:
      'Xroga Connect',

    bolt:
      'Bolt Connectors',

    note:
      'Both support connected services. Xroga additionally emphasizes permission boundaries around consequential actions.',

    xrogaTone:
      'xroga',

    boltTone:
      'shared',
  },

  {
    capability:
      'Browser extensions',

    xroga:
      'Dedicated workflow',

    bolt:
      'Not documented as a first-class output in the reviewed product pages',

    note:
      'Xroga exposes browser-extension work as a distinct product path.',

    xrogaTone:
      'xroga',

    boltTone:
      'limited',
  },

  {
    capability:
      'Desktop software',

    xroga:
      'Electron-oriented workflow',

    bolt:
      'Not documented as a first-class output in the reviewed product pages',

    note:
      'Xroga explicitly supports desktop-software project workflows.',

    xrogaTone:
      'xroga',

    boltTone:
      'limited',
  },

  {
    capability:
      'Dedicated design-system product',

    xroga:
      'Uses repository/project design patterns',

    bolt:
      'Design System Agents',

    note:
      'Bolt has the clearer dedicated design-system ingestion product today.',

    xrogaTone:
      'limited',

    boltTone:
      'bolt',
  },

  {
    capability:
      'Team / enterprise administration',

    xroga:
      'Not the strongest current self-serve area',

    bolt:
      'Teams and enterprise controls',

    note:
      'Bolt currently has the stronger documented administration story.',

    xrogaTone:
      'limited',

    boltTone:
      'bolt',
  },
];


const FAQS = [
  {
    question:
      'Is Xroga better than Bolt.new?',

    answer:
      'Not for every project. Bolt is particularly strong for fast JavaScript-first application development in a browser with integrated Bolt Cloud infrastructure. Xroga is a stronger fit when the project benefits from repository-centred engineering, current web research, broader software outputs, explicit verification evidence, responsive workspace access, and deployments through provider accounts the user controls.',
  },

  {
    question:
      'What is the best Bolt.new alternative?',

    answer:
      'That depends on what you want to replace. Xroga is especially relevant when you need existing-repository work, current-source research, broader project types, visible validation and blockers, responsive workspace access, or provider-owned deployment instead of a tightly integrated hosted runtime.',
  },

  {
    question:
      'Can Bolt.new import an existing GitHub repository?',

    answer:
      'Yes. Bolt documents importing existing GitHub repositories, connecting Bolt projects to new private repositories, branch workflows, auto-pushing edits that pass runtime checks, and pulling GitHub changes back into Bolt.',
  },

  {
    question:
      'Can Xroga work with an existing repository?',

    answer:
      'Yes. Existing-repository work is a core Xroga workflow. Xroga can inspect the connected project, make focused changes, run applicable checks, and keep the repository and release state visible.',
  },

  {
    question:
      'Can Bolt.new work on mobile browsers?',

    answer:
      'Bolt currently says mobile browsers are not fully supported and recommends Chrome or another Chromium-based desktop browser for building.',
  },

  {
    question:
      'Can Xroga work on mobile?',

    answer:
      'Xroga uses responsive web layouts across desktop, tablet, and phone. Complex code review is naturally easier on a larger screen, but the workspace is designed to remain accessible across device sizes.',
  },

  {
    question:
      'Can Bolt build Python or PHP backends?',

    answer:
      'Bolt currently documents a JavaScript-based backend environment using Node.js and says PHP and Python backends are not compatible with its builder.',
  },

  {
    question:
      'Can Bolt build mobile apps?',

    answer:
      'Yes. Bolt documents Expo-compatible mobile application projects.',
  },

  {
    question:
      'Does Bolt support GitHub?',

    answer:
      'Yes. Bolt has a two-way GitHub integration that supports imports, branches, automatic pushes after runtime checks, and pulling external GitHub changes back into Bolt.',
  },

  {
    question:
      'Does Bolt include hosting?',

    answer:
      'Yes. Bolt Cloud includes website hosting, and Bolt currently includes hosting and databases in its plans.',
  },

  {
    question:
      'Does Xroga include hosting?',

    answer:
      'Xroga emphasizes publishing through supported provider accounts the user authorizes rather than making Xroga itself the hosting destination. For supported Vercel workflows, Xroga treats a successful production build and provider-backed deployment evidence as separate requirements.',
  },

  {
    question:
      'What is Xroga Connect?',

    answer:
      'Xroga Connect is the customer-facing integration layer for supported external tools and services. Some connections can use third-party integration infrastructure such as Composio. Availability depends on provider support, credentials, permissions, and Xroga controls.',
  },

  {
    question:
      'Does Xroga search the web while building?',

    answer:
      'Yes. Xroga AI Chat can use current public web search and source-backed research when the task depends on fresh external information, and that research can become implementation context for the connected project.',
  },

  {
    question:
      'How much does Bolt.new cost in 2026?',

    answer:
      'Bolt currently lists Free at $0 and Pro starting at $25 per month. Free includes a 300,000-token daily limit and 1 million tokens per month. Pro starts at 10 million monthly tokens with no daily token limit.',
  },

  {
    question:
      'How much does Xroga cost?',

    answer:
      'Xroga currently offers Free at $0 with no card required and Xroga Pro at $25 per month. Xroga describes customer usage as plan capacity rather than publishing a fixed customer-facing prompt, action, or model-token allowance.',
  },

  {
    question:
      'What is Xroga Full Access?',

    answer:
      'Full Access is a Pro pacing option that can make remaining working capacity for the current billing cycle available earlier instead of waiting for later progressive availability. It accelerates existing capacity; it does not create extra monthly capacity.',
  },
] as const;


const TOC = [
  ['quick-answer', 'The 30-second answer'],
  ['comparison', 'Xroga vs Bolt at a glance'],
  ['bolt-strengths', 'What Bolt genuinely does well'],
  ['xroga-advantage', 'Where Xroga goes further'],
  ['workflow', 'Same request, different path'],
  ['repositories', 'Repositories and language breadth'],
  ['mobile', 'Browser workspace and mobile access'],
  ['research-connect', 'Research and connected tools'],
  ['verification', 'Testing, validation and proof'],
  ['infrastructure', 'Database, hosting and ownership'],
  ['outputs', 'What Xroga can build'],
  ['pricing', 'Pricing and usage'],
  ['audience', 'Who each product fits'],
  ['decision', 'Which should you choose?'],
  ['faq', 'Frequently asked questions'],
  ['methodology', 'Methodology and sources'],
] as const;


function JsonLd({
  data,
}: {
  data: unknown;
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html:
          JSON.stringify(
            data,
          ).replace(
            /</g,
            '\\u003c',
          ),
      }}
    />
  );
}


function SourceLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      className="xvb-source"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
      <span aria-hidden="true">
        {' '}↗
      </span>
    </a>
  );
}


function InternalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      className="xvb-source"
      href={href}
    >
      {children}
      <span aria-hidden="true">
        {' '}→
      </span>
    </Link>
  );
}


function ComparisonImage({
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
    <figure className="xvb-figure">
      <Image
        src={src}
        alt={alt}
        width={1672}
        height={941}
        priority={priority}
        sizes="(max-width: 760px) 100vw, (max-width: 1200px) calc(100vw - 48px), 1120px"
      />

      <figcaption>
        {caption}
      </figcaption>
    </figure>
  );
}


function Tone({
  tone,
  children,
}: {
  tone: ComparisonTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`xvb-tone xvb-tone--${tone}`}
    >
      {children}
    </span>
  );
}


export function XrogaVsBoltPage() {
  const url =
    `${SITE_URL}${XROGA_VS_BOLT_PATH}`;

  const absoluteHero =
    `${SITE_URL}${XROGA_VS_BOLT_OG_IMAGE}`;


  const webPageSchema =
    buildWebPageJsonLd({
      path:
        XROGA_VS_BOLT_PATH,

      name:
        XROGA_VS_BOLT_TITLE,

      description:
        XROGA_VS_BOLT_DESCRIPTION,
    });


  const articleSchema = {
    '@context':
      'https://schema.org',

    '@type':
      'Article',

    '@id':
      `${url}#article`,

    headline:
      XROGA_VS_BOLT_TITLE,

    description:
      XROGA_VS_BOLT_DESCRIPTION,

    url,

    image: [
      absoluteHero,
      `${SITE_URL}${IMAGES.workflow}`,
      `${SITE_URL}${IMAGES.strengths}`,
      `${SITE_URL}${IMAGES.proof}`,
      `${SITE_URL}${IMAGES.audience}`,
    ],

    datePublished:
      PUBLISHED,

    dateModified:
      REVIEWED,

    author: {
      '@type':
        'Person',

      name:
        ABOUT_FOUNDER.name,

      url:
        `${SITE_URL}/about#founder`,
    },

    publisher: {
      '@id':
        ORGANIZATION_ID,
    },

    mainEntityOfPage: {
      '@id':
        `${url}#webpage`,
    },

    articleSection: [
      'AI app builders',
      'Bolt.new alternatives',
      'AI coding agents',
      'Vibe coding',
      'GitHub workflows',
      'Software development',
    ],

    about: [
      {
        '@type':
          'SoftwareApplication',

        name:
          'Xroga',

        url:
          SITE_URL,
      },

      {
        '@type':
          'SoftwareApplication',

        name:
          'Bolt.new',

        url:
          BOLT.home,
      },
    ],
  };


  const breadcrumbSchema = {
    '@context':
      'https://schema.org',

    '@type':
      'BreadcrumbList',

    itemListElement: [
      {
        '@type':
          'ListItem',

        position:
          1,

        name:
          'Home',

        item:
          `${SITE_URL}/`,
      },

      {
        '@type':
          'ListItem',

        position:
          2,

        name:
          'Compare',

        item:
          `${SITE_URL}/compare`,
      },

      {
        '@type':
          'ListItem',

        position:
          3,

        name:
          'Xroga vs Bolt.new',

        item:
          url,
      },
    ],
  };


  const faqSchema = {
    '@context':
      'https://schema.org',

    '@type':
      'FAQPage',

    '@id':
      `${url}#faq`,

    mainEntity:
      FAQS.map(
        (faq) => ({
          '@type':
            'Question',

          name:
            faq.question,

          acceptedAnswer: {
            '@type':
              'Answer',

            text:
              faq.answer,
          },
        }),
      ),
  };


  return (
    <main className="xvb-page">
      <JsonLd
        data={
          webPageSchema
        }
      />

      <JsonLd
        data={
          articleSchema
        }
      />

      <JsonLd
        data={
          breadcrumbSchema
        }
      />

      <JsonLd
        data={
          faqSchema
        }
      />


      <div className="xvb-shell">

        <nav
          className="xvb-breadcrumbs"
          aria-label="Breadcrumb"
        >
          <Link href="/">
            Home
          </Link>

          <span aria-hidden="true">
            /
          </span>

          <Link href="/compare">
            Compare
          </Link>

          <span aria-hidden="true">
            /
          </span>

          <span>
            Xroga vs Bolt.new
          </span>
        </nav>


        <article>

          <header className="xvb-hero">
            <p className="xvb-eyebrow">
              AI APP BUILDER COMPARISON · 2026
            </p>

            <h1>
              Xroga vs Bolt.new:
              {' '}
              <span>
                Which AI Builder Should Take Your Idea Further?
              </span>
            </h1>

            <p className="xvb-hero-copy">
              Both products can turn plain-language ideas into software.
              The more useful comparison is what happens after the first
              code appears: research, repository work, testing, connected
              tools, infrastructure, ownership, and the evidence behind
              a release.
            </p>

            <div className="xvb-hero-meta">
              <span>
                Updated September 23, 2026
              </span>

              <span aria-hidden="true">
                ·
              </span>

              <span>
                Official vendor sources linked
              </span>

              <span aria-hidden="true">
                ·
              </span>

              <span>
                No fabricated benchmark scores
              </span>
            </div>

            <div className="xvb-actions">
              <Link
                className="xvb-primary-button"
                href="/auth/signup"
              >
                Start building with Xroga
              </Link>

              <Link
                className="xvb-secondary-button"
                href="/pricing"
              >
                Compare Xroga plans
              </Link>
            </div>
          </header>


          <aside className="xvb-disclosure">
            <strong>
              Editorial disclosure
            </strong>

            <p>
              This comparison is published by Xroga. Bolt capabilities
              are checked against Bolt&apos;s current official product,
              pricing, support, and release pages. When both products
              support something, we say both. When Bolt has the clearer
              strength, we say so. When Xroga has a broader documented
              path, we explain the exact difference.
            </p>
          </aside>


          <ComparisonImage
            src={IMAGES.hero}
            alt="Xroga vs Bolt.new 2026 AI app builder comparison"
            caption="Two browser-based AI software products with different product philosophies: Bolt emphasizes an integrated browser build environment, while Xroga emphasizes the broader workflow around research, repositories, verification, connected tools, and provider-backed shipping."
            priority
          />


          <section
            id="quick-answer"
            className="xvb-direct-answer"
          >
            <p className="xvb-kicker">
              The 30-second answer
            </p>

            <h2>
              Bolt is excellent at the browser-first build loop.
              Xroga is designed to keep more of the product journey connected.
            </h2>

            <p>
              <strong>Bolt.new</strong> is a strong choice when you want a
              JavaScript-first application environment that lives almost
              entirely in the browser. Bolt combines code generation with
              a live runtime, GitHub synchronization, databases,
              authentication, hosting, domains, connectors, and other
              infrastructure through Bolt Cloud.
              {' '}
              <SourceLink href={BOLT.v2}>
                Bolt v2
              </SourceLink>
            </p>

            <p>
              <strong>Xroga</strong> is designed for projects where the work
              extends beyond the initial generation loop: current web
              research, an existing repository, broader project types,
              explicit validation, repair, connected external tools,
              responsive workspace access, GitHub ownership, and
              deployment evidence through providers the user authorizes.
            </p>

            <p className="xvb-direct-answer__bottom">
              If the integrated browser runtime is the main product you are
              choosing, Bolt is compelling. If the workflow around the
              software matters just as much as generation, Xroga has the
              broader fit.
            </p>
          </section>


          <div className="xvb-layout">

            <aside
              className="xvb-toc"
              aria-label="On this page"
            >
              <strong>
                On this page
              </strong>

              {
                TOC.map(
                  ([id, label]) => (
                    <a
                      key={id}
                      href={`#${id}`}
                    >
                      {label}
                    </a>
                  ),
                )
              }
            </aside>


            <div className="xvb-content">

              <section id="comparison">
                <p className="xvb-section-label">
                  01 · SIDE BY SIDE
                </p>

                <h2>
                  Xroga vs Bolt.new at a glance
                </h2>

                <p>
                  This table does not use a fake winner badge. A shared
                  capability is shown as shared. A Bolt strength stays a
                  Bolt strength. An Xroga advantage is called out only where
                  there is a concrete workflow difference.
                </p>

                <div className="xvb-table-wrap">
                  <table>
                    <caption>
                      Documented product comparison · reviewed September 23, 2026
                    </caption>

                    <thead>
                      <tr>
                        <th scope="col">
                          Capability
                        </th>

                        <th scope="col">
                          Xroga
                        </th>

                        <th scope="col">
                          Bolt.new
                        </th>

                        <th scope="col">
                          Why it matters
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {
                        COMPARISON_ROWS.map(
                          (row) => (
                            <tr
                              key={
                                row.capability
                              }
                            >
                              <th scope="row">
                                {
                                  row.capability
                                }
                              </th>

                              <td>
                                <Tone
                                  tone={
                                    row.xrogaTone
                                  }
                                >
                                  {
                                    row.xroga
                                  }
                                </Tone>
                              </td>

                              <td>
                                <Tone
                                  tone={
                                    row.boltTone
                                  }
                                >
                                  {
                                    row.bolt
                                  }
                                </Tone>
                              </td>

                              <td>
                                {
                                  row.note
                                }
                              </td>
                            </tr>
                          ),
                        )
                      }
                    </tbody>
                  </table>
                </div>

                <p className="xvb-note">
                  Bolt&apos;s current support documentation explicitly says
                  mobile browsers are not fully supported and that Bolt only
                  supports JavaScript-based backends such as Node.js; PHP and
                  Python backends are not compatible with the builder.
                  {' '}
                  <SourceLink href={BOLT.technologies}>
                    Bolt supported technologies
                  </SourceLink>
                </p>
              </section>


              <section id="bolt-strengths">
                <p className="xvb-section-label">
                  02 · BOLT&apos;S STRENGTHS
                </p>

                <h2>
                  What Bolt genuinely does well
                </h2>

                <p>
                  Bolt should not be reduced to a prototype generator. Its
                  current product is considerably more mature: Bolt v2 combines
                  browser-based AI coding with hosting, databases,
                  authentication, payments, security tooling, SEO features,
                  GitHub workflows, and team capabilities.
                  {' '}
                  <SourceLink href={BOLT.v2}>
                    Bolt v2 product overview
                  </SourceLink>
                </p>

                <div className="xvb-feature-grid">
                  <article>
                    <span>
                      01
                    </span>

                    <h3>
                      Browser-native development
                    </h3>

                    <p>
                      Bolt&apos;s immediate browser runtime is one of its
                      clearest product advantages. It reduces environment
                      setup and keeps generation, execution, and iteration
                      close together.
                    </p>
                  </article>

                  <article>
                    <span>
                      02
                    </span>

                    <h3>
                      Bolt Cloud
                    </h3>

                    <p>
                      Hosting, domains, databases, and authentication can
                      remain inside the same Bolt-managed product experience.
                    </p>
                  </article>

                  <article>
                    <span>
                      03
                    </span>

                    <h3>
                      Two-way GitHub sync
                    </h3>

                    <p>
                      Bolt supports importing existing repositories,
                      branches, automatic pushes after runtime checks, and
                      pulling GitHub changes back into Bolt.
                    </p>

                    <SourceLink href={BOLT.github}>
                      GitHub integration
                    </SourceLink>
                  </article>

                  <article>
                    <span>
                      04
                    </span>

                    <h3>
                      Design System Agents
                    </h3>

                    <p>
                      Bolt has a dedicated design-system workflow for teams
                      that want agents building from established component
                      systems and brand primitives.
                    </p>

                    <SourceLink href={BOLT.designSystem}>
                      Design System Agents
                    </SourceLink>
                  </article>

                  <article>
                    <span>
                      05
                    </span>

                    <h3>
                      Connectors
                    </h3>

                    <p>
                      Bolt can connect to tools such as Notion, Linear,
                      GitHub, Miro, Sentry, Context7, Granola, and Jira,
                      with custom remote MCP connectors also supported.
                    </p>

                    <SourceLink href={BOLT.connectors}>
                      Bolt Connectors
                    </SourceLink>
                  </article>

                  <article>
                    <span>
                      06
                    </span>

                    <h3>
                      Teams and enterprise
                    </h3>

                    <p>
                      Bolt currently has the stronger documented team
                      administration story, including centralized billing,
                      access management, provisioning, and enterprise controls.
                    </p>

                    <SourceLink href={BOLT.pricing}>
                      Bolt pricing
                    </SourceLink>
                  </article>
                </div>
              </section>


              <section id="xroga-advantage">
                <p className="xvb-section-label">
                  03 · XROGA&apos;S BROADER PATH
                </p>

                <h2>
                  Xroga&apos;s advantage is not “more code generation.”
                  It is more of the software journey staying connected.
                </h2>

                <p>
                  Xroga is organized around a product that can survive beyond
                  the first generation. The request, repository, research,
                  implementation, validation, blockers, connected services,
                  and release evidence can remain part of the same project
                  story.
                </p>

                <div className="xvb-principles">
                  <article>
                    <strong>
                      State
                    </strong>

                    <p>
                      What exists now, not what the model assumes exists.
                    </p>
                  </article>

                  <article>
                    <strong>
                      Evidence
                    </strong>

                    <p>
                      What actually ran, passed, failed, or reached a provider.
                    </p>
                  </article>

                  <article>
                    <strong>
                      Permission
                    </strong>

                    <p>
                      Which external action the user has actually authorized.
                    </p>
                  </article>

                  <article>
                    <strong>
                      Blockers
                    </strong>

                    <p>
                      Missing credentials, failed checks, or external setup
                      remain visible instead of being converted into success.
                    </p>
                  </article>
                </div>

                <p>
                  That model is especially useful once an AI project stops
                  being a demo and becomes software another person needs to
                  operate, review, or trust.
                </p>
              </section>


              <section id="workflow">
                <p className="xvb-section-label">
                  04 · SAME REQUEST, DIFFERENT PATH
                </p>

                <h2>
                  Both can start from plain language.
                  The workflow after that is different.
                </h2>

                <ComparisonImage
                  src={IMAGES.workflow}
                  alt="Xroga and Bolt.new workflow comparison showing the same software request moving through different product paths"
                  caption="Bolt emphasizes a tight prompt-to-runtime path. Xroga extends the path around understanding, research, repository inspection, implementation, validation, repair, GitHub, deployment, and verification evidence."
                />

                <p>
                  Imagine asking both systems to build a customer portal with
                  authentication, roles, billing, analytics, responsive
                  states, and production deployment.
                </p>

                <div className="xvb-flow-compare">
                  <article>
                    <p className="xvb-mini-label">
                      BOLT-ORIENTED FLOW
                    </p>

                    <strong>
                      Prompt → generate → run → GitHub / Bolt Cloud → publish
                    </strong>

                    <p>
                      Deliberately compressed and convenient when your project
                      fits the browser-native JavaScript environment.
                    </p>
                  </article>

                  <article className="xvb-xroga-panel">
                    <p className="xvb-mini-label">
                      XROGA-ORIENTED FLOW
                    </p>

                    <strong>
                      Outcome → understand → research → inspect → implement →
                      validate → repair → GitHub → deploy → verify evidence
                    </strong>

                    <p>
                      More stages become useful when the job includes an
                      existing project, external systems, or production proof.
                    </p>
                  </article>
                </div>
              </section>


              <section id="repositories">
                <p className="xvb-section-label">
                  05 · REPOSITORIES AND STACKS
                </p>

                <h2>
                  Existing repositories are shared.
                  Runtime breadth is where the story diverges.
                </h2>

                <p>
                  Older Bolt comparisons sometimes claim Bolt cannot work with
                  existing GitHub repositories. That is outdated. Bolt now
                  documents repository imports and two-way synchronization.
                  {' '}
                  <SourceLink href={BOLT.github}>
                    Bolt GitHub documentation
                  </SourceLink>
                </p>

                <p>
                  The more meaningful difference is runtime scope. Bolt says
                  it focuses on JavaScript-based web technologies, with
                  Node.js for the backend, and explicitly says PHP and Python
                  backends are not compatible with the builder.
                  {' '}
                  <SourceLink href={BOLT.technologies}>
                    Supported technologies
                  </SourceLink>
                </p>

                <p>
                  Xroga is repository-oriented rather than tied to one
                  browser runtime. That makes it better suited to a wider
                  range of existing project shapes, including supported work
                  across JavaScript, TypeScript, Python, Go, Rust, PHP,
                  Ruby, Java/OpenJDK, Swift, and Kotlin where the project
                  environment allows the relevant checks and execution.
                </p>

                <div className="xvb-chip-cloud">
                  {
                    [
                      'JavaScript',
                      'TypeScript',
                      'Python',
                      'Go',
                      'Rust',
                      'PHP',
                      'Ruby',
                      'Java / OpenJDK',
                      'Swift',
                      'Kotlin',
                      'Mixed repositories',
                    ].map(
                      (item) => (
                        <span
                          key={item}
                        >
                          {
                            item
                          }
                        </span>
                      ),
                    )
                  }
                </div>

                <p className="xvb-note">
                  Broader repository orientation is not a promise that every
                  language, dependency, or infrastructure combination will be
                  executable in every environment. Xroga should report the
                  exact validation available for the connected project rather
                  than pretending universal compatibility.
                </p>
              </section>


              <section id="mobile">
                <p className="xvb-section-label">
                  06 · BROWSER WORKSPACE AND MOBILE
                </p>

                <h2>
                  Both live in the browser.
                  The device story is different.
                </h2>

                <div className="xvb-two-up">
                  <article>
                    <p className="xvb-mini-label">
                      BOLT
                    </p>

                    <h3>
                      Desktop browser first
                    </h3>

                    <p>
                      Bolt recommends Chrome or another Chromium-based browser
                      on desktop and currently says mobile browsers are not
                      fully supported.
                    </p>

                    <SourceLink href={BOLT.technologies}>
                      Browser support
                    </SourceLink>
                  </article>

                  <article className="xvb-xroga-panel">
                    <p className="xvb-mini-label">
                      XROGA
                    </p>

                    <h3>
                      Responsive product workspace
                    </h3>

                    <p>
                      Xroga&apos;s workspace is designed around responsive
                      desktop, tablet, and phone layouts so users can prompt,
                      follow project state, inspect progress, and handle
                      lighter product work away from a desktop workstation.
                    </p>
                  </article>
                </div>

                <p>
                  A phone is obviously not the ideal place to review a
                  thousand-line diff. The point is access: founders,
                  operators, product managers, and other collaborators are
                  not required to live inside a desktop IDE simply to follow
                  the product.
                </p>
              </section>


              <section id="research-connect">
                <p className="xvb-section-label">
                  07 · RESEARCH AND CONNECTED TOOLS
                </p>

                <h2>
                  Xroga can research the problem and then work through
                  supported external services.
                </h2>

                <p>
                  Software work increasingly depends on information that can
                  change faster than model training data: API documentation,
                  SDK versions, authentication requirements, hosting changes,
                  provider migrations, and platform rules.
                </p>

                <p>
                  Xroga AI Chat can use current public web search and
                  source-backed research when the work depends on fresh
                  information. That research can become implementation
                  context for the connected project.
                  {' '}
                  <InternalLink href="/features/ai-chat">
                    Xroga AI Chat
                  </InternalLink>
                </p>

                <h3>
                  Xroga Connect
                </h3>

                <p>
                  Xroga Connect is the customer-facing integration layer for
                  supported external services. Some connections can be powered
                  by integration infrastructure such as Composio. Xroga&apos;s
                  product model distinguishes reading/searching from
                  consequential actions that create, edit, send, delete, or
                  publish something.
                </p>

                <p>
                  Composio&apos;s upstream catalog currently lists more than
                  1,500 toolkits, but that should not be interpreted as
                  “every Composio integration is automatically enabled in
                  Xroga.” Actual availability depends on Xroga support,
                  provider permissions, authentication, and the action being
                  requested.
                  {' '}
                  <SourceLink href={COMPOSIO_TOOLKITS}>
                    Composio toolkit catalog
                  </SourceLink>
                </p>

                <div className="xvb-chip-cloud">
                  {
                    [
                      'GitHub',
                      'Gmail',
                      'Slack',
                      'Notion',
                      'Google Sheets',
                      'Google Drive',
                      'Shopify',
                      'Supabase',
                      'HubSpot',
                      'Payments',
                      'Analytics',
                      'Cloud',
                      'Domains',
                      'Automation',
                      'Support',
                    ].map(
                      (item) => (
                        <span
                          key={item}
                        >
                          {
                            item
                          }
                        </span>
                      ),
                    )
                  }
                </div>

                <p>
                  Bolt also has a real integration story and should receive
                  credit for it. Bolt Connectors currently include Notion,
                  Linear, GitHub, Miro, Sentry, Context7, Granola, and Jira,
                  with custom remote MCP connectors supported.
                  {' '}
                  <SourceLink href={BOLT.connectors}>
                    Bolt Connectors
                  </SourceLink>
                </p>
              </section>


              <section id="verification">
                <p className="xvb-section-label">
                  08 · “DONE” NEEDS PROOF
                </p>

                <h2>
                  Generated, validated, and deployed are different states.
                </h2>

                <ComparisonImage
                  src={IMAGES.proof}
                  alt="Xroga software verification pipeline from generated code through types tests production build browser checks responsive views deployment and reachable URL"
                  caption="Xroga separates generated, validated, and deployed so the product can show what actually happened instead of turning model confidence into a release claim."
                />

                <p>
                  AI coding has a distinctive failure mode: a model can sound
                  confident while the application is still broken. That makes
                  each boundary important.
                </p>

                <div className="xvb-proof-list">
                  <article>
                    <span>
                      01
                    </span>

                    <strong>
                      Code generated
                    </strong>

                    <p>
                      The requested implementation exists.
                    </p>
                  </article>

                  <article>
                    <span>
                      02
                    </span>

                    <strong>
                      Syntax / imports
                    </strong>

                    <p>
                      The project can resolve the code it was given.
                    </p>
                  </article>

                  <article>
                    <span>
                      03
                    </span>

                    <strong>
                      Types
                    </strong>

                    <p>
                      Applicable type validation runs.
                    </p>
                  </article>

                  <article>
                    <span>
                      04
                    </span>

                    <strong>
                      Tests
                    </strong>

                    <p>
                      Project-defined tests run where available.
                    </p>
                  </article>

                  <article>
                    <span>
                      05
                    </span>

                    <strong>
                      Production build
                    </strong>

                    <p>
                      Development preview is not substituted for the real build.
                    </p>
                  </article>

                  <article>
                    <span>
                      06
                    </span>

                    <strong>
                      Browser/runtime
                    </strong>

                    <p>
                      The actual product starts and can be inspected.
                    </p>
                  </article>

                  <article>
                    <span>
                      07
                    </span>

                    <strong>
                      Console / network
                    </strong>

                    <p>
                      Runtime and request failures remain visible.
                    </p>
                  </article>

                  <article>
                    <span>
                      08
                    </span>

                    <strong>
                      Responsive views
                    </strong>

                    <p>
                      Relevant desktop and mobile states can be reviewed.
                    </p>
                  </article>

                  <article>
                    <span>
                      09
                    </span>

                    <strong>
                      Provider deployment
                    </strong>

                    <p>
                      The external provider accepts the release.
                    </p>
                  </article>

                  <article>
                    <span>
                      10
                    </span>

                    <strong>
                      Reachable URL
                    </strong>

                    <p>
                      There is something real another person can open.
                    </p>
                  </article>
                </div>

                <p className="xvb-note">
                  This does not mean Bolt does no validation. Bolt explicitly
                  describes automated testing, debugging, iteration, runtime
                  checks, security tooling, and other production-oriented
                  features. The distinction is that Xroga makes evidence,
                  blockers, and completion boundaries a particularly explicit
                  part of the product contract.
                  {' '}
                  <SourceLink href={BOLT.home}>
                    Bolt product overview
                  </SourceLink>
                </p>
              </section>


              <section id="infrastructure">
                <p className="xvb-section-label">
                  09 · INFRASTRUCTURE AND OWNERSHIP
                </p>

                <h2>
                  Bolt&apos;s strongest infrastructure advantage is integration.
                  Xroga&apos;s is explicit provider ownership and release evidence.
                </h2>

                <div className="xvb-two-up">
                  <article>
                    <p className="xvb-mini-label">
                      BOLT CLOUD
                    </p>

                    <h3>
                      One integrated environment
                    </h3>

                    <ul>
                      <li>
                        Website hosting
                      </li>

                      <li>
                        Custom domains
                      </li>

                      <li>
                        Databases
                      </li>

                      <li>
                        Authentication
                      </li>

                      <li>
                        Security tooling
                      </li>

                      <li>
                        Payments
                      </li>

                      <li>
                        SEO features
                      </li>
                    </ul>

                    <SourceLink href={BOLT.pricing}>
                      Bolt pricing
                    </SourceLink>
                  </article>

                  <article className="xvb-xroga-panel">
                    <p className="xvb-mini-label">
                      XROGA PROVIDER WORKFLOW
                    </p>

                    <h3>
                      Your accounts stay visible
                    </h3>

                    <ul>
                      <li>
                        GitHub repository ownership
                      </li>

                      <li>
                        Vercel through an authorized account
                      </li>

                      <li>
                        Supabase project workflows
                      </li>

                      <li>
                        Environment configuration
                      </li>

                      <li>
                        Build gate before live status
                      </li>

                      <li>
                        Provider-backed deployment evidence
                      </li>

                      <li>
                        Custom domain / DNS workflows
                      </li>
                    </ul>

                    <InternalLink href="/docs/vercel">
                      Xroga Vercel workflow
                    </InternalLink>
                  </article>
                </div>

                <p>
                  If you want the fewest infrastructure decisions, Bolt Cloud
                  is attractive. If you want the repository and provider
                  identities to remain independently inspectable, Xroga&apos;s
                  model can be a better fit.
                </p>
              </section>


              <section id="outputs">
                <p className="xvb-section-label">
                  10 · WHAT CAN YOU BUILD?
                </p>

                <h2>
                  Xroga is positioned beyond one application category.
                </h2>

                <p>
                  Both products can build websites, web applications, and
                  mobile-app projects. Xroga additionally exposes dedicated
                  workflows for project types that are not presented as
                  first-class Bolt outputs in the official pages reviewed.
                </p>

                <div className="xvb-output-grid">
                  {
                    [
                      'Websites',
                      'SaaS',
                      'Dashboards',
                      'Internal tools',
                      'Customer portals',
                      'APIs',
                      'Mobile projects',
                      'Browser extensions',
                      'Desktop software',
                      'Automations',
                      'AI agents',
                      'CLIs',
                      'Libraries',
                      'Data pipelines',
                      'Browser games',
                      'Crypto dashboards',
                      'Web3 products',
                    ].map(
                      (item) => (
                        <span
                          key={item}
                        >
                          {
                            item
                          }
                        </span>
                      ),
                    )
                  }
                </div>

                <p className="xvb-note">
                  “Not documented as first-class” does not mean another
                  general-purpose AI could never produce code for that output.
                  This page distinguishes a documented product workflow from a
                  theoretical code-generation possibility.
                </p>
              </section>


              <section id="pricing">
                <p className="xvb-section-label">
                  11 · PRICING AND USAGE
                </p>

                <h2>
                  Both have a $25 monthly paid entry point.
                  The usage model is different.
                </h2>

                <div className="xvb-pricing-grid">
                  <article className="xvb-xroga-panel">
                    <p className="xvb-mini-label">
                      XROGA
                    </p>

                    <div className="xvb-price">
                      $0
                      <small>
                        Free
                      </small>
                    </div>

                    <div className="xvb-price">
                      $25
                      <small>
                        Xroga Pro / month
                      </small>
                    </div>

                    <p>
                      Xroga describes customer usage as plan capacity rather
                      than exposing a fixed customer-facing prompt, action, or
                      model-token allowance.
                    </p>

                    <InternalLink href="/pricing">
                      Xroga pricing
                    </InternalLink>
                  </article>

                  <article>
                    <p className="xvb-mini-label">
                      BOLT.NEW
                    </p>

                    <div className="xvb-price">
                      $0
                      <small>
                        Free
                      </small>
                    </div>

                    <div className="xvb-price">
                      $25
                      <small>
                        Pro / month
                      </small>
                    </div>

                    <p>
                      Bolt Free currently lists a 300K-token daily limit and
                      1M monthly tokens. Pro starts at 10M monthly tokens with
                      no daily token limit. Unused paid tokens can roll into
                      the next month.
                    </p>

                    <SourceLink href={BOLT.pricing}>
                      Bolt pricing
                    </SourceLink>
                  </article>
                </div>

                <h3>
                  Balanced Month
                </h3>

                <p>
                  Xroga can progressively make monthly capacity available
                  through the billing cycle instead of turning usage into an
                  arbitrary “five prompts left” counter.
                </p>

                <h3>
                  Full Access — Pro
                </h3>

                <p>
                  When the work needs more capacity now, Full Access can make
                  the remaining working capacity for the current cycle
                  available earlier.
                </p>

                <p className="xvb-note">
                  Full Access changes when existing capacity becomes
                  available. It does not create additional monthly capacity
                  and should not be described as unlimited or as a free reset.
                </p>

                <p>
                  Token totals and Xroga capacity should not be converted into
                  a fake exchange rate. Different agents use context, models,
                  tool calls, retries, and verification differently. The
                  useful question is how much meaningful project work the
                  plan allows you to complete.
                </p>
              </section>


              <section id="audience">
                <p className="xvb-section-label">
                  12 · WHO IS XROGA FOR?
                </p>

                <h2>
                  One workspace.
                  Different levels of technical depth.
                </h2>

                <ComparisonImage
                  src={IMAGES.audience}
                  alt="Xroga workspace across desktop tablet and phone for non-coders founders developers startups designers agencies operators students and technical founders"
                  caption="Xroga is designed so the same project can be understandable to a founder at the product level and a developer at the repository, terminal, and validation level."
                />

                <div className="xvb-audience-grid">
                  {
                    [
                      {
                        title:
                          'Non-technical founders',

                        body:
                          'Describe the outcome in plain language and follow visible project state without learning a full IDE before you start.',
                      },

                      {
                        title:
                          'Technical founders',

                        body:
                          'Keep the repository, code changes, terminal-level information, validation, and provider evidence available when deeper control is needed.',
                      },

                      {
                        title:
                          'Developers',

                        body:
                          'Work against existing repositories and project conventions instead of limiting every project to one hosted runtime.',
                      },

                      {
                        title:
                          'Startup teams',

                        body:
                          'Move from idea to MVP while preserving a path for the same codebase to survive customer feedback, fixes, and production iteration.',
                      },

                      {
                        title:
                          'Business owners',

                        body:
                          'Build internal tools, portals, dashboards, automation, and custom operational software around the business process you actually use.',
                      },

                      {
                        title:
                          'Product managers',

                        body:
                          'Follow intent, implementation progress, blockers, validation, and release state without needing to become the person writing every line.',
                      },

                      {
                        title:
                          'Designers',

                        body:
                          'Review real responsive behavior and work against the actual product rather than only a static visual mockup.',
                      },

                      {
                        title:
                          'Agencies and consultants',

                        body:
                          'Work across different client repositories, hosting providers, data systems, and release requirements.',
                      },

                      {
                        title:
                          'Operators',

                        body:
                          'Use connected tools and automations while keeping consequential external actions tied to authorization.',
                      },

                      {
                        title:
                          'Creators',

                        body:
                          'Turn an idea into a website, tool, application, extension, automation, or interactive product without starting from infrastructure setup.',
                      },

                      {
                        title:
                          'Students',

                        body:
                          'Learn through building instead of treating a complete local development toolchain as the admission ticket.',
                      },

                      {
                        title:
                          'Technical consultants',

                        body:
                          'Diagnose, repair, refactor, and extend existing projects while preserving an inspectable trail of work.',
                      },
                    ].map(
                      (item) => (
                        <article
                          key={
                            item.title
                          }
                        >
                          <h3>
                            {
                              item.title
                            }
                          </h3>

                          <p>
                            {
                              item.body
                            }
                          </p>
                        </article>
                      ),
                    )
                  }
                </div>
              </section>


              <section id="decision">
                <p className="xvb-section-label">
                  13 · DECISION
                </p>

                <h2>
                  Which one should you choose?
                </h2>

                <ComparisonImage
                  src={IMAGES.strengths}
                  alt="Xroga and Bolt.new strength map showing shared capabilities and areas where each product is strongest"
                  caption="A useful comparison does not force every row into a winner. Some capabilities are shared; Bolt has genuine infrastructure strengths; Xroga has broader product-workflow strengths."
                />

                <div className="xvb-choice-grid">
                  <article>
                    <p className="xvb-mini-label">
                      CONSIDER BOLT WHEN
                    </p>

                    <h3>
                      The integrated JavaScript browser environment is the
                      main advantage you want.
                    </h3>

                    <ul>
                      <li>
                        You want a fast browser-native Node.js loop.
                      </li>

                      <li>
                        Bolt Cloud hosting, database, and auth fit the product.
                      </li>

                      <li>
                        Your backend naturally belongs in JavaScript / Node.js.
                      </li>

                      <li>
                        Bolt&apos;s design-system workflow is important.
                      </li>

                      <li>
                        Team and enterprise administration is a primary
                        requirement today.
                      </li>

                      <li>
                        You prefer an explicit token-based usage model.
                      </li>
                    </ul>
                  </article>

                  <article className="xvb-choice-grid__xroga">
                    <p className="xvb-mini-label">
                      CONSIDER XROGA WHEN
                    </p>

                    <h3>
                      You want the broader path from intent to inspectable
                      software.
                    </h3>

                    <ul>
                      <li>
                        You have an existing repository or a broader stack.
                      </li>

                      <li>
                        Current web research should feed directly into
                        implementation.
                      </li>

                      <li>
                        Non-coders and developers need one shared product
                        workspace.
                      </li>

                      <li>
                        Evidence, blockers, browser checks, and provider state
                        need to stay visible.
                      </li>

                      <li>
                        Extensions, desktop software, automation, or other
                        software shapes matter.
                      </li>

                      <li>
                        You want repository and deployment-provider ownership
                        to remain explicit.
                      </li>

                      <li>
                        Responsive desktop / tablet / phone access matters.
                      </li>

                      <li>
                        You prefer a capacity model over prompt/action counters.
                      </li>
                    </ul>
                  </article>
                </div>

                <div className="xvb-decision-rule">
                  <p className="xvb-mini-label">
                    THE SIMPLEST DECISION RULE
                  </p>

                  <blockquote>
                    If the runtime is the product you are choosing,
                    Bolt is compelling.
                  </blockquote>

                  <blockquote>
                    If the workflow around the software is the product
                    you are choosing, Xroga deserves a closer look.
                  </blockquote>
                </div>
              </section>


              <section id="faq">
                <p className="xvb-section-label">
                  14 · FAQ
                </p>

                <h2>
                  Xroga vs Bolt.new:
                  frequently asked questions
                </h2>

                <div className="xvb-faq">
                  {
                    FAQS.map(
                      (faq) => (
                        <details
                          key={
                            faq.question
                          }
                        >
                          <summary>
                            {
                              faq.question
                            }
                          </summary>

                          <p>
                            {
                              faq.answer
                            }
                          </p>
                        </details>
                      ),
                    )
                  }
                </div>
              </section>


              <section id="methodology">
                <p className="xvb-section-label">
                  15 · METHODOLOGY
                </p>

                <h2>
                  How this comparison was built
                </h2>

                <p>
                  Bolt information was reviewed against current official Bolt
                  pricing, product, GitHub, Connectors, design-system, and
                  supported-technology documentation on September 23, 2026.
                  Xroga capability statements reflect the current Xroga
                  product and repository.
                </p>

                <p>
                  We did not run a controlled benchmark between the two
                  products, so this page does not invent numerical scores for
                  code quality, speed, reliability, or “AI intelligence.”
                </p>

                <p>
                  A useful evaluation is to give both products the same
                  representative project and inspect what they changed, the
                  amount of intervention required, the relevant checks, the
                  failure reporting, the repository ownership, the deployment
                  ownership, and the evidence returned at the end.
                </p>

                <div className="xvb-source-box">
                  <h3>
                    Primary external sources
                  </h3>

                  <ul>
                    <li>
                      <SourceLink href={BOLT.pricing}>
                        Bolt pricing and plans
                      </SourceLink>
                    </li>

                    <li>
                      <SourceLink href={BOLT.v2}>
                        Bolt v2 product overview
                      </SourceLink>
                    </li>

                    <li>
                      <SourceLink href={BOLT.github}>
                        Bolt GitHub two-way synchronization
                      </SourceLink>
                    </li>

                    <li>
                      <SourceLink href={BOLT.connectors}>
                        Bolt Connectors
                      </SourceLink>
                    </li>

                    <li>
                      <SourceLink href={BOLT.technologies}>
                        Bolt supported technologies and browser support
                      </SourceLink>
                    </li>

                    <li>
                      <SourceLink href={BOLT.designSystem}>
                        Bolt Design System Agents
                      </SourceLink>
                    </li>

                    <li>
                      <SourceLink href={COMPOSIO_TOOLKITS}>
                        Composio toolkit catalog
                      </SourceLink>
                    </li>
                  </ul>
                </div>

                <div className="xvb-source-box">
                  <h3>
                    Xroga product references
                  </h3>

                  <ul>
                    <li>
                      <InternalLink href="/ai-app-builder">
                        AI App Builder
                      </InternalLink>
                    </li>

                    <li>
                      <InternalLink href="/ai-coding-agent">
                        AI Coding Agent
                      </InternalLink>
                    </li>

                    <li>
                      <InternalLink href="/features/ai-chat">
                        AI Chat and web research
                      </InternalLink>
                    </li>

                    <li>
                      <InternalLink href="/integrations">
                        Integrations
                      </InternalLink>
                    </li>

                    <li>
                      <InternalLink href="/docs/vercel">
                        Vercel deployment workflow
                      </InternalLink>
                    </li>

                    <li>
                      <InternalLink href="/security">
                        Security and evidence approach
                      </InternalLink>
                    </li>

                    <li>
                      <InternalLink href="/pricing">
                        Pricing
                      </InternalLink>
                    </li>
                  </ul>
                </div>
              </section>

            </div>
          </div>


          <section className="xvb-final-cta">
            <div className="xvb-final-cta__glow" />

            <div className="xvb-final-cta__content">
              <p className="xvb-eyebrow">
                BUILD SOMETHING REAL
              </p>

              <h2>
                Research it.
                Build it.
                Test it.
                Repair it.
                Ship it.
              </h2>

              <p>
                Start from a new idea or bring the repository you already
                own. Keep the code, project state, validation, connected
                tools, and provider evidence in one product workflow.
              </p>

              <div className="xvb-actions">
                <Link
                  className="xvb-primary-button"
                  href="/auth/signup"
                >
                  Start building free
                </Link>

                <Link
                  className="xvb-secondary-button"
                  href="/pricing"
                >
                  Explore Xroga Pro — $25/month
                </Link>
              </div>

              <small>
                Your repository · Your accounts · Your product
              </small>
            </div>
          </section>


          <section className="xvb-related">
            <h2>
              Continue comparing
            </h2>

            <div className="xvb-related-grid">
              <Link href="/compare/xroga-vs-lovable">
                <span>
                  Xroga vs Lovable
                </span>

                <small>
                  Compare →
                </small>
              </Link>

              <Link href="/compare/xroga-vs-replit">
                <span>
                  Xroga vs Replit
                </span>

                <small>
                  Compare →
                </small>
              </Link>

              <Link href="/compare/xroga-vs-cursor">
                <span>
                  Xroga vs Cursor
                </span>

                <small>
                  Compare →
                </small>
              </Link>

              <Link href="/alternatives/bolt-alternative">
                <span>
                  Bolt.new alternatives
                </span>

                <small>
                  Explore →
                </small>
              </Link>
            </div>
          </section>

        </article>

      </div>
    </main>
  );
}
