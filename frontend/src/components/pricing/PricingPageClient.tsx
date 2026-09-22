'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  useRouter,
} from 'next/navigation';

import type {
  LucideIcon,
} from 'lucide-react';

import {
  ArrowRight,
  BadgeCheck,
  Blocks,
  Bot,
  Briefcase,
  CalendarClock,
  Check,
  Chrome,
  CircleGauge,
  Cloud,
  Code2,
  Database,
  FileSearch,
  Files,
  Gamepad2,
  Github,
  Globe2,
  Layers3,
  Laptop,
  Monitor,
  PackageCheck,
  Plug,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  TestTube2,
  UserRound,
  Users,
  WandSparkles,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';

import {
  createClient,
} from '@/lib/supabase/client';

import {
  api,
} from '@/lib/api';

import {
  CheckoutButton,
} from '@/components/billing/CheckoutButton';

import styles
  from './PricingPage.module.css';


type BillingStatus =
  Awaited<
    ReturnType<
      typeof api.billing.status
    >
  >;


type FeatureItem = {
  icon: LucideIcon;
  label: string;
  strong?: boolean;
};


const FREE_FEATURES:
  FeatureItem[] = [

  {
    icon: Code2,
    label: 'AI coding agent & app builder',
    strong: true,
  },

  {
    icon: Layers3,
    label: 'Build websites, web apps & SaaS',
    strong: true,
  },

  {
    icon: Github,
    label: 'Work with real GitHub repositories',
    strong: true,
  },

  {
    icon: Files,
    label: 'Repository-aware code changes',
  },

  {
    icon: Wrench,
    label: 'Debug, fix & repair code',
  },

  {
    icon: Database,
    label: 'APIs, backend & data workflows',
  },

  {
    icon: PackageCheck,
    label: 'Automatic production build checks',
  },

  {
    icon: Monitor,
    label: 'Real browser preview',
  },

  {
    icon: TestTube2,
    label: 'Automatic browser verification',
    strong: true,
  },

  {
    icon: Smartphone,
    label: 'Desktop + mobile UI checks',
  },

  {
    icon: Database,
    label: 'Supabase integration workflows',
  },

  {
    icon: Rocket,
    label: 'Supported Vercel deployment workflow',
  },

  {
    icon: Search,
    label: 'Live web search & research',
  },

  {
    icon: FileSearch,
    label: 'Documents, screenshots & files',
  },

  {
    icon: BrainIcon,
    label: 'Black Hole V∞ intelligence',
  },

  {
    icon: Plug,
    label: 'Plugins & integrations workspace',
  },

  {
    icon: CircleGauge,
    label: 'Included monthly AI capacity',
  },

  {
    icon: CalendarClock,
    label: 'Capacity unlocks progressively',
  },
];


const PRO_FEATURES:
  FeatureItem[] = [

  {
    icon: BadgeCheck,
    label: 'Everything available in Free',
    strong: true,
  },

  {
    icon: Zap,
    label: 'Higher monthly AI capacity',
    strong: true,
  },

  {
    icon: Rocket,
    label: 'Full Access pacing',
    strong: true,
  },

  {
    icon: Workflow,
    label: 'Longer end-to-end software builds',
    strong: true,
  },

  {
    icon: Code2,
    label: 'Large multi-file changes & refactors',
  },

  {
    icon: RefreshCw,
    label: 'Repeated build → test → repair loops',
  },

  {
    icon: Github,
    label: 'Deep repository engineering',
  },

  {
    icon: Search,
    label: 'Research-heavy product workflows',
  },

  {
    icon: TestTube2,
    label: 'Extended browser verification cycles',
  },

  {
    icon: Wrench,
    label: 'Repair after runtime & browser failures',
  },

  {
    icon: Github,
    label: 'Branch, commit & release workflows',
  },

  {
    icon: Rocket,
    label: 'Production deployment workflows',
  },

  {
    icon: Database,
    label: 'Supabase schema, auth & storage setup',
  },

  {
    icon: Globe2,
    label: 'Custom domain + DNS verification',
  },

  {
    icon: Chrome,
    label: 'Chrome extension packaging',
  },

  {
    icon: Laptop,
    label: 'Electron desktop release workflows',
  },

  {
    icon: Smartphone,
    label: 'Expo mobile project workflows',
  },

  {
    icon: Bot,
    label: 'Automation & agent scaffolds',
  },

  {
    icon: Blocks,
    label: 'Crypto / Web3 product workflows',
  },

  {
    icon: RefreshCw,
    label: 'More room for post-launch iteration',
  },

  {
    icon: Sparkles,
    label: 'Priority capacity for active builders',
  },
];


const CAPABILITY_GROUPS = [

  {
    icon: Code2,

    title:
      'Build',

    description:
      'Turn product ideas into real software surfaces.',

    items: [
      'Websites',
      'SaaS products',
      'Dashboards',
      'Admin systems',
      'Internal tools',
      'Booking products',
      'Marketplaces',
      'Customer portals',
      'APIs',
      'AI products',
    ],
  },

  {
    icon: Github,

    title:
      'Code & repositories',

    description:
      'Work with new projects or code you already own.',

    items: [
      'Existing repositories',
      'New GitHub projects',
      'Multi-file changes',
      'Refactoring',
      'Bug fixing',
      'Feature implementation',
      'Repository understanding',
      'Branch workflows',
      'Commit evidence',
      'Release preparation',
    ],
  },

  {
    icon: Search,

    title:
      'Research',

    description:
      'Use current evidence when the work depends on the outside world.',

    items: [
      'Live web search',
      'Multi-source research',
      'Current documentation',
      'Source-backed answers',
      'API research',
      'Provider research',
      'Public-source intelligence',
      'Evidence freshness',
      'Source authority checks',
      'Research → implementation',
    ],
  },

  {
    icon: Database,

    title:
      'Backend & data',

    description:
      'Go beyond the visible interface.',

    items: [
      'Backend routes',
      'APIs',
      'PostgreSQL',
      'Supabase',
      'Authentication',
      'Storage',
      'Schema setup',
      'RLS workflows',
      'Persistent application data',
      'Environment configuration',
    ],
  },

  {
    icon: TestTube2,

    title:
      'Test & verify',

    description:
      'Treat running evidence as more important than an AI saying “done.”',

    items: [
      'Production builds',
      'Applicable tests',
      'Server startup',
      'HTTP checks',
      'DOM checks',
      'Page errors',
      'Console errors',
      'Network failures',
      'Interaction checks',
      'Desktop + mobile verification',
    ],
  },

  {
    icon: Rocket,

    title:
      'Publish',

    description:
      'Move from project files to provider-backed release evidence.',

    items: [
      'GitHub',
      'Vercel',
      'Production previews',
      'Web deployment',
      'Custom domains',
      'DNS verification',
      'Chrome extension ZIP',
      'Desktop releases',
      'Expo / EAS workflow',
      'Release evidence',
    ],
  },

  {
    icon: Plug,

    title:
      'Plugins & services',

    description:
      'Connect infrastructure and business tools your product needs.',

    items: [
      'Developer tools',
      'Databases',
      'Cloud infrastructure',
      'AI providers',
      'Storage',
      'Payments',
      'Analytics',
      'Automation',
      'Domains & DNS',
      'Hundreds more',
    ],
  },

  {
    icon: Terminal,

    title:
      'Developer workspace',

    description:
      'Keep the underlying work visible when you want technical control.',

    items: [
      'Files',
      'Code',
      'Changes',
      'Terminal',
      'Browser preview',
      'Deploy evidence',
      'Run history',
      'Project state',
      'Uploads',
      'Live execution status',
    ],
  },

] as const;


const BUILD_TYPES = [
  'Website',
  'SaaS',
  'AI SaaS',
  'Dashboard',
  'CRM',
  'Admin panel',
  'Internal tool',
  'Booking system',
  'Marketplace',
  'Customer portal',
  'API',
  'AI chatbot',
  'Chrome extension',
  'Desktop utility',
  'Mobile-app foundation',
  'Automation',
  'AI agent',
  'Browser game',
  'Analytics product',
  'Data product',
  'Crypto dashboard',
  'Web3 app',
  'DAO tool',
  'Portfolio',
  'Landing page',
  'Existing-product feature',
  'Bug fix',
  'Redesign',
];


const VERIFICATION_STEPS = [
  'Code',
  'Build',
  'Tests',
  'Start app',
  'HTTP',
  'DOM',
  'Page errors',
  'Console',
  'Network',
  'Interactions',
  'Desktop + mobile',
  'Repair or ship',
];


const PLAN_COMPARISON = [

  [
    'Build software with AI',
    'Core access',
    'Full workflow + higher capacity',
  ],

  [
    'AI Coding Agent',
    'Included',
    'Included',
  ],

  [
    'New projects',
    'Included',
    'Included',
  ],

  [
    'Existing repositories',
    'Included',
    'Included',
  ],

  [
    'Websites & web apps',
    'Included',
    'Included',
  ],

  [
    'SaaS & dashboards',
    'Included',
    'Included',
  ],

  [
    'Backend & APIs',
    'Included',
    'Included',
  ],

  [
    'Chrome / desktop / mobile workflows',
    'Supported',
    'More capacity for sustained builds',
  ],

  [
    'Debug & repair',
    'Included',
    'More room for repeated repair loops',
  ],

  [
    'Browser verification',
    'Included',
    'Extended verification & iteration',
  ],

  [
    'Desktop + mobile checks',
    'Included',
    'Included',
  ],

  [
    'GitHub workflow',
    'Included',
    'Better suited to repeated shipping',
  ],

  [
    'Supabase workflows',
    'Included',
    'More room for full-stack implementation',
  ],

  [
    'Vercel workflow',
    'Supported',
    'Production-focused workflows',
  ],

  [
    'Custom domains / DNS',
    'Supported',
    'Supported',
  ],

  [
    'Live web search',
    'Included',
    'Included',
  ],

  [
    'Deep research',
    'Included',
    'Higher capacity for research-heavy work',
  ],

  [
    'Documents / screenshots / files',
    'Included',
    'Included',
  ],

  [
    'Plugin catalog',
    'Included',
    'Included',
  ],

  [
    'Monthly AI capacity',
    'Included',
    'Higher',
  ],

  [
    'Balanced Month',
    'Included',
    'Included',
  ],

  [
    'Progressive daily unlocks',
    'Included',
    'Included',
  ],

  [
    'Full Access',
    '—',
    'Unlock current-cycle capacity earlier',
  ],

  [
    'Large multi-stage builds',
    'Capacity constrained',
    'Designed for active use',
  ],

  [
    'Long coding sessions',
    'Capacity constrained',
    'Designed for active use',
  ],

  [
    'Production iteration',
    'Limited by included capacity',
    'Primary use case',
  ],

  [
    'Monthly renewal',
    'Included',
    'Included',
  ],

  [
    'Credit card',
    'Not required',
    'Required to subscribe',
  ],

  [
    'Price',
    '$0',
    '$25 / month',
  ],

] as const;


const COMPETITORS = [

  {
    name:
      'Lovable',

    price:
      'Pro from $25/mo',

    focus:
      'Conversational web-app building, cloud hosting, Supabase and visual editing.',

    difference:
      'Xroga is positioned around a broader repository → research → verification → publishing workflow and additional software-output paths.',
  },

  {
    name:
      'Bolt',

    price:
      'Pro $25/mo',

    focus:
      'Browser-based app building with hosting, databases and custom domains.',

    difference:
      'Xroga emphasizes repository ownership, research, explicit verification evidence and cross-product engineering workflows.',
  },

  {
    name:
      'Replit',

    price:
      'Core $20/mo · Pro $100/mo',

    focus:
      'Broad cloud development environment with Agent, hosting, databases and collaboration.',

    difference:
      'Xroga is designed around an outcome-first path that hides technical complexity for nontechnical builders while keeping evidence available.',
  },

  {
    name:
      'v0',

    price:
      'Plus $30/user/mo',

    focus:
      'Web product creation with strong React, Next.js and Vercel integration.',

    difference:
      'Xroga combines product creation with live research, repository work, broader output workflows and explicit browser verification.',
  },

  {
    name:
      'Cursor',

    price:
      'Pro $20/mo',

    focus:
      'Developer-first coding environment with agents, repository tools, cloud agents and browser tooling.',

    difference:
      'Xroga wraps engineering inside an outcome-oriented product workflow intended to remain usable without coding experience.',
  },

] as const;


const AUDIENCES = [

  {
    icon: Sparkles,

    title:
      'Founders',

    body:
      'Turn the product in your head into something customers, investors and teammates can actually open and test.',
  },

  {
    icon: UserRound,

    title:
      'Nontechnical founders',

    body:
      'Describe the outcome in plain language. Xroga handles the technical workflow while keeping real project evidence visible.',
  },

  {
    icon: Briefcase,

    title:
      'Business owners',

    body:
      'Build internal tools, portals, dashboards, automations and customer software around how your business actually works.',
  },

  {
    icon: Users,

    title:
      'Product teams',

    body:
      'Prototype, research, connect real infrastructure, validate behavior and keep iterating without rebuilding the workflow elsewhere.',
  },

  {
    icon: Code2,

    title:
      'Developers',

    body:
      'Bring an existing repository, inspect changes, use the terminal, review evidence and retain control of the underlying code.',
  },

  {
    icon: WandSparkles,

    title:
      'Anyone with an idea',

    body:
      'Start from an outcome instead of starting by learning an entire development stack.',
  },

] as const;


function BrainIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <BrainCircuit
      className={
        className
      }
    />
  );
}


function FeatureLine({
  feature,
  pro = false,
}: {
  feature:
    FeatureItem;

  pro?:
    boolean;
}) {

  const Icon =
    feature.icon;


  return (
    <li
      className={
        styles.featureLine
      }
    >
      <span
        className={
          pro
            ? styles.featureIconPro
            : styles.featureIcon
        }
      >
        <Icon
          aria-hidden="true"
        />
      </span>

      <span
        className={
          feature.strong
            ? styles.featureStrong
            : undefined
        }
      >
        {
          feature.label
        }
      </span>
    </li>
  );
}


export function PricingPageClient() {

  const [
    loggedIn,
    setLoggedIn,
  ] =
    useState(
      false,
    );


  const [
    status,
    setStatus,
  ] =
    useState<
      BillingStatus |
      null
    >(
      null,
    );


  const router =
    useRouter();


  useEffect(
    () => {

      void (
        async () => {

          try {

            const {
              data,
            } =
              await createClient()
                .auth
                .getSession();


            const hasSession =
              Boolean(
                data.session,
              );


            setLoggedIn(
              hasSession,
            );


            if (
              hasSession
            ) {
              setStatus(
                await api.billing
                  .status(),
              );
            }

          } catch {

            setStatus(
              null,
            );

          }

        }
      )();

    },
    [],
  );


  const freeCurrent =
    status?.plan ===
    'free';


  const proCurrent =
    status?.plan ===
    'spark';


  function openFree() {

    if (
      freeCurrent
    ) {
      return;
    }


    router.push(
      loggedIn
        ? '/workspace'
        : '/auth/signup',
    );
  }


  return (
    <div
      className={
        styles.root
      }
    >

      <main
        className={
          styles.shell
        }
      >

        {/* ==================================================
            HERO
        ================================================== */}

        <section
          className={
            styles.hero
          }
        >

          <div
            className={
              styles.heroKicker
            }
          >
            <Sparkles
              aria-hidden="true"
            />

            XROGA AI · BUILD BEYOND THE PROMPT
          </div>


          <h1
            className={
              styles.heroTitle
            }
          >
            From an idea to software
            {' '}
            <span>
              people can actually use.
            </span>
          </h1>


          <p
            className={
              styles.heroCopy
            }
          >
            Research the web. Understand the project.
            Write and repair code. Connect data.
            Test the product in a real browser.
            Publish through infrastructure you control.
          </p>


          <div
            className={
              styles.heroPills
            }
          >

            <span>
              <Code2 />
              Build
            </span>

            <span>
              <Search />
              Research
            </span>

            <span>
              <TestTube2 />
              Verify
            </span>

            <span>
              <Rocket />
              Ship
            </span>

          </div>

        </section>



        {/* ==================================================
            PRICING CARDS
        ================================================== */}

        <section
          className={
            styles.pricingSection
          }
          aria-labelledby="plans"
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              START FREE · GO PRO WHEN YOU SHIP
            </span>


            <h2
              id="plans"
              className={
                styles.sectionTitle
              }
            >
              Choose how far you want to build.
            </h2>


            <p
              className={
                styles.sectionCopy
              }
            >
              The core Xroga workflow starts free.
              Pro gives active builders substantially
              more room for long research, engineering,
              verification and shipping cycles.
            </p>

          </div>


          <div
            className={
              styles.pricingGrid
            }
          >

            {/* ==============================================
                PRO
            ============================================== */}

            <article
              className={`${styles.planCard} ${styles.proCard}`}
            >

              <div
                className={
                  styles.proGlow
                }
                aria-hidden="true"
              />


              <div
                className={
                  styles.cardInner
                }
              >

                <div
                  className={
                    styles.cardTop
                  }
                >

                  <div>

                    <div
                      className={
                        styles.proLabel
                      }
                    >
                      Xroga Pro
                    </div>

                    <div
                      className={
                        styles.proBadge
                      }
                    >
                      <Sparkles />
                      FOR SHIPPING REAL PRODUCTS
                    </div>

                  </div>


                  {
                    proCurrent
                      ? (
                        <span
                          className={
                            styles.currentBadge
                          }
                        >
                          CURRENT
                        </span>
                      )
                      : null
                  }

                </div>


                <div
                  className={
                    styles.priceRow
                  }
                >

                  <span
                    className={
                      styles.price
                    }
                  >
                    $25
                  </span>

                  <span
                    className={
                      styles.priceMeta
                    }
                  >
                    <strong>
                      per month
                    </strong>

                    <span>
                      billed monthly
                    </span>
                  </span>

                </div>


                <p
                  className={
                    styles.planLead
                  }
                >
                  Move from experimenting to sustained
                  building. Research, implement, verify,
                  repair and ship demanding products with
                  higher monthly capacity.
                </p>


                {
                  proCurrent
                    ? (
                      <button
                        type="button"
                        className={`${styles.ctaButton} ${styles.proCta}`}
                        disabled
                      >
                        Current plan
                      </button>
                    )
                    : loggedIn
                      ? (
                        <CheckoutButton
                          planTier="spark"
                          label="Get Xroga Pro — $25/month"
                          className={`${styles.ctaButton} ${styles.proCta}`}
                        />
                      )
                      : (
                        <button
                          type="button"
                          className={`${styles.ctaButton} ${styles.proCta}`}
                          onClick={
                            () =>
                              router.push(
                                '/auth/signup',
                              )
                          }
                        >
                          Get Xroga Pro — $25/month
                        </button>
                      )
                }


                <p
                  className={
                    styles.ctaNote
                  }
                >
                  Cancel anytime · Your code · Your accounts · Your deployment
                </p>


                <div
                  className={
                    styles.cardDivider
                  }
                />


                <div
                  className={
                    styles.cardSectionTitle
                  }
                >
                  <Zap />
                  Built for sustained product work
                </div>


                <ul
                  className={
                    styles.featureList
                  }
                >

                  {
                    PRO_FEATURES.map(
                      (
                        feature,
                      ) => (
                        <FeatureLine
                          key={
                            feature.label
                          }
                          feature={
                            feature
                          }
                          pro
                        />
                      ),
                    )
                  }

                </ul>


                <div
                  className={
                    styles.fullAccessBox
                  }
                >

                  <div
                    className={
                      styles.fullAccessIcon
                    }
                  >
                    <Zap />
                  </div>


                  <div>

                    <strong>
                      Full Access
                    </strong>

                    <p>
                      Need the power now? Pro can make
                      remaining working capacity for the
                      current cycle available earlier
                      instead of waiting for later unlocks.
                    </p>

                    <small>
                      Full Access accelerates existing
                      capacity. It does not add extra
                      monthly capacity.
                    </small>

                  </div>

                </div>

              </div>

            </article>



            {/* ==============================================
                FREE
            ============================================== */}

            <article
              className={`${styles.planCard} ${styles.freeCard}`}
            >

              <div
                className={
                  styles.cardInner
                }
              >

                <div
                  className={
                    styles.cardTop
                  }
                >

                  <div
                    className={
                      styles.freeLabel
                    }
                  >
                    Free
                  </div>


                  {
                    freeCurrent
                      ? (
                        <span
                          className={
                            styles.currentBadge
                          }
                        >
                          CURRENT
                        </span>
                      )
                      : null
                  }

                </div>


                <div
                  className={
                    styles.priceRow
                  }
                >

                  <span
                    className={
                      styles.price
                    }
                  >
                    $0
                  </span>

                  <span
                    className={
                      styles.priceMeta
                    }
                  >
                    <strong>
                      per month
                    </strong>

                    <span>
                      no card required
                    </span>
                  </span>

                </div>


                <p
                  className={
                    styles.planLead
                  }
                >
                  Start an idea, work on real code and
                  experience the complete Xroga product
                  workflow with included monthly capacity.
                </p>


                <button
                  type="button"
                  className={`${styles.ctaButton} ${styles.freeCta}`}
                  disabled={
                    freeCurrent ||
                    Boolean(
                      status?.isPaid,
                    )
                  }
                  onClick={
                    openFree
                  }
                >
                  {
                    freeCurrent
                      ? 'Current plan'
                      : status?.isPaid
                        ? 'Included with your account'
                        : 'Start building free'
                  }
                </button>


                <p
                  className={
                    styles.ctaNote
                  }
                >
                  Build with plain language.
                  No coding experience required.
                </p>


                <div
                  className={
                    styles.cardDivider
                  }
                />


                <div
                  className={
                    styles.cardSectionTitle
                  }
                >
                  <Code2 />
                  Build real software
                </div>


                <ul
                  className={
                    styles.featureList
                  }
                >

                  {
                    FREE_FEATURES.map(
                      (
                        feature,
                      ) => (
                        <FeatureLine
                          key={
                            feature.label
                          }
                          feature={
                            feature
                          }
                        />
                      ),
                    )
                  }

                </ul>

              </div>

            </article>

          </div>

        </section>



        {/* ==================================================
            CAPACITY
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              CAPACITY WITHOUT TOKEN MATH
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              Built around how real product work happens.
            </h2>


            <p
              className={
                styles.sectionCopy
              }
            >
              Xroga shows understandable capacity,
              unlock timing and cycle status instead
              of asking users to calculate arbitrary
              action counts.
            </p>

          </div>


          <div
            className={
              styles.threeGrid
            }
          >

            <article
              className={
                styles.infoCard
              }
            >

              <div
                className={
                  styles.infoNumber
                }
              >
                01
              </div>

              <div
                className={
                  styles.infoIcon
                }
              >
                <CalendarClock />
              </div>

              <h3>
                Daily unlocks
              </h3>

              <p>
                Monthly capacity becomes progressively
                available through the billing cycle,
                giving normal work a predictable rhythm.
              </p>

            </article>


            <article
              className={
                styles.infoCard
              }
            >

              <div
                className={
                  styles.infoNumber
                }
              >
                02
              </div>

              <div
                className={
                  styles.infoIcon
                }
              >
                <RefreshCw />
              </div>

              <h3>
                Monthly renewal
              </h3>

              <p>
                Included capacity begins a fresh cycle
                at renewal. Your projects, repositories
                and completed work remain preserved.
              </p>

            </article>


            <article
              className={`${styles.infoCard} ${styles.infoCardAccent}`}
            >

              <div
                className={
                  styles.infoNumber
                }
              >
                03
              </div>

              <div
                className={
                  styles.infoIcon
                }
              >
                <Zap />
              </div>

              <h3>
                Full Access · Pro
              </h3>

              <p>
                Have an important build today? Accelerate
                remaining current-cycle capacity instead
                of waiting for later daily unlocks.
              </p>

              <span
                className={
                  styles.infoFoot
                }
              >
                Acceleration — not extra monthly capacity.
              </span>

            </article>

          </div>

        </section>



        {/* ==================================================
            EVERYTHING
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              XROGA.COM POWERS
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              One AI. A much larger software workflow.
            </h2>


            <p
              className={
                styles.sectionCopy
              }
            >
              Xroga is designed to move across research,
              engineering, infrastructure, validation
              and shipping instead of stopping when
              code appears on the screen.
            </p>

          </div>


          <div
            className={
              styles.capabilityGrid
            }
          >

            {
              CAPABILITY_GROUPS.map(
                (
                  group,
                ) => {

                  const Icon =
                    group.icon;


                  return (
                    <article
                      key={
                        group.title
                      }
                      className={
                        styles.capabilityCard
                      }
                    >

                      <div
                        className={
                          styles.capabilityIcon
                        }
                      >
                        <Icon />
                      </div>


                      <h3>
                        {
                          group.title
                        }
                      </h3>


                      <p>
                        {
                          group.description
                        }
                      </p>


                      <div
                        className={
                          styles.miniList
                        }
                      >

                        {
                          group.items.map(
                            (
                              item,
                            ) => (
                              <span
                                key={
                                  item
                                }
                              >
                                <Check />
                                {
                                  item
                                }
                              </span>
                            ),
                          )
                        }

                      </div>

                    </article>
                  );

                },
              )
            }

          </div>

        </section>



        {/* ==================================================
            WHAT CAN YOU BUILD
        ================================================== */}

        <section
          className={`${styles.section} ${styles.buildSection}`}
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              START WITH THE OUTCOME
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              What could you build with Xroga?
            </h2>


            <p
              className={
                styles.sectionCopy
              }
            >
              Do not pick a template category first.
              Describe what the product should do.
            </p>

          </div>


          <div
            className={
              styles.chipCloud
            }
          >

            {
              BUILD_TYPES.map(
                (
                  item,
                ) => (
                  <span
                    key={
                      item
                    }
                  >
                    {
                      item
                    }
                  </span>
                ),
              )
            }

          </div>


          <p
            className={
              styles.buildEnding
            }
          >
            Or describe something
            Xroga has never seen before.
          </p>

        </section>



        {/* ==================================================
            BROWSER VERIFICATION
        ================================================== */}

        <section
          className={`${styles.section} ${styles.darkFeatureSection}`}
        >

          <div
            className={
              styles.darkFeatureCopy
            }
          >

            <span
              className={
                styles.darkEyebrow
              }
            >
              VERIFICATION > SELF-CONFIDENCE
            </span>


            <h2>
              Xroga does not stop
              when the code compiles.
            </h2>


            <p>
              Xroga can run the product, open it in a
              browser and gather evidence from the
              software itself — then send failures back
              through the repair workflow.
            </p>


            <div
              className={
                styles.darkStatement
              }
            >
              <TestTube2 />

              <span>
                AI exercises the product like a user
                and investigates failures like a developer.
              </span>
            </div>

          </div>


          <div
            className={
              styles.verificationFlow
            }
          >

            {
              VERIFICATION_STEPS.map(
                (
                  step,
                  index,
                ) => (
                  <div
                    key={
                      step
                    }
                    className={
                      styles.verifyStep
                    }
                  >
                    <span>
                      {
                        String(
                          index + 1,
                        ).padStart(
                          2,
                          '0',
                        )
                      }
                    </span>

                    <strong>
                      {
                        step
                      }
                    </strong>

                    {
                      index <
                      VERIFICATION_STEPS.length - 1
                        ? (
                          <ArrowRight />
                        )
                        : null
                    }
                  </div>
                ),
              )
            }

          </div>

        </section>



        {/* ==================================================
            RESEARCH
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.splitFeature
            }
          >

            <div>

              <span
                className={
                  styles.eyebrow
                }
              >
                LIVE RESEARCH
              </span>


              <h2
                className={
                  styles.sectionTitleLeft
                }
              >
                Research before Xroga guesses.
              </h2>


              <p
                className={
                  styles.sectionCopyLeft
                }
              >
                When a product depends on current
                information, Xroga can retrieve public
                sources and turn evidence into
                implementation context.
              </p>

            </div>


            <div
              className={
                styles.researchGrid
              }
            >

              {
                [
                  [
                    Search,
                    'Web Search',
                    'Current public information.',
                  ],

                  [
                    FileSearch,
                    'Deep Research',
                    'Multiple sources instead of one answer.',
                  ],

                  [
                    Files,
                    'Documentation Research',
                    'Current provider and API information.',
                  ],

                  [
                    ShieldCheck,
                    'Source Intelligence',
                    'Authority, freshness and evidence.',
                  ],

                  [
                    Globe2,
                    'Public-source Research',
                    'Supported web and social-source workflows.',
                  ],

                  [
                    Code2,
                    'Research → Build',
                    'Use evidence directly in implementation.',
                  ],
                ].map(
                  (
                    [
                      Icon,
                      title,
                      body,
                    ],
                  ) => (
                    <div
                      key={
                        String(
                          title,
                        )
                      }
                      className={
                        styles.researchItem
                      }
                    >

                      <Icon />

                      <div>
                        <strong>
                          {
                            title
                          }
                        </strong>

                        <p>
                          {
                            body
                          }
                        </p>
                      </div>

                    </div>
                  ),
                )
              }

            </div>

          </div>

        </section>



        {/* ==================================================
            PLUGINS
        ================================================== */}

        <section
          className={`${styles.section} ${styles.pluginSection}`}
        >

          <div
            className={
              styles.pluginNumber
            }
          >
            700+
          </div>


          <div
            className={
              styles.pluginContent
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              SERVICES IN THE XROGA PLUGIN CATALOG
            </span>


            <h2
              className={
                styles.sectionTitleLeft
              }
            >
              Your product rarely lives alone.
            </h2>


            <p
              className={
                styles.sectionCopyLeft
              }
            >
              Discover infrastructure, APIs and business
              services your product may need. Connect
              supported services directly or request
              providers that are not yet executable
              through Xroga.
            </p>


            <div
              className={
                styles.pluginTags
              }
            >

              {
                [
                  'Developer tools',
                  'Databases',
                  'Cloud',
                  'AI providers',
                  'Payments',
                  'Storage',
                  'Authentication',
                  'Analytics',
                  'Automation',
                  'Email',
                  'Marketing',
                  'Project management',
                  'Domains & DNS',
                  'Finance',
                  'Commerce',
                  'Communication',
                  'Scheduling',
                  'Customer support',
                ].map(
                  (
                    item,
                  ) => (
                    <span
                      key={
                        item
                      }
                    >
                      {
                        item
                      }
                    </span>
                  ),
                )
              }

            </div>


            <p
              className={
                styles.pluginDisclaimer
              }
            >
              Catalog entries include connected,
              connectable and requestable services.
              Availability depends on provider support,
              credentials and authorization.
            </p>

          </div>

        </section>



        {/* ==================================================
            FULL STACK
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              NOT JUST THE UI
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              Build the product behind the screen.
            </h2>


            <p
              className={
                styles.sectionCopy
              }
            >
              Connect frontend, backend, authentication,
              data and deployment instead of stopping
              at a convincing mockup.
            </p>

          </div>


          <div
            className={
              styles.architectureFlow
            }
          >

            {
              [
                [
                  WandSparkles,
                  'Your idea',
                ],

                [
                  Workflow,
                  'Product architecture',
                ],

                [
                  Code2,
                  'Frontend',
                ],

                [
                  Cloud,
                  'Backend / API',
                ],

                [
                  ShieldCheck,
                  'Auth',
                ],

                [
                  Database,
                  'Database + storage',
                ],

                [
                  TestTube2,
                  'Verify',
                ],

                [
                  Rocket,
                  'Live product',
                ],
              ].map(
                (
                  [
                    Icon,
                    label,
                  ],
                  index,
                ) => (
                  <div
                    key={
                      String(
                        label,
                      )
                    }
                    className={
                      styles.architectureNode
                    }
                  >

                    <Icon />

                    <strong>
                      {
                        label
                      }
                    </strong>

                    {
                      index <
                      7
                        ? (
                          <ArrowRight />
                        )
                        : null
                    }

                  </div>
                ),
              )
            }

          </div>

        </section>



        {/* ==================================================
            SHIP
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.shipPanel
            }
          >

            <div
              className={
                styles.shipCopy
              }
            >

              <span
                className={
                  styles.eyebrow
                }
              >
                FROM PROMPT TO A URL
              </span>


              <h2
                className={
                  styles.sectionTitleLeft
                }
              >
                Build it. Verify it. Ship it.
              </h2>


              <p
                className={
                  styles.sectionCopyLeft
                }
              >
                Publishing is treated as a real
                provider operation — not a success
                message generated because code exists.
              </p>

            </div>


            <div
              className={
                styles.shipSteps
              }
            >

              {
                [
                  'Build',
                  'Validate',
                  'Repair',
                  'GitHub',
                  'Deploy',
                  'Verify provider',
                  'Custom domain',
                ].map(
                  (
                    step,
                    index,
                  ) => (
                    <div
                      key={
                        step
                      }
                      className={
                        styles.shipStep
                      }
                    >

                      <span>
                        <Check />
                      </span>

                      <strong>
                        {
                          step
                        }
                      </strong>

                      {
                        index < 6
                          ? (
                            <ArrowRight />
                          )
                          : null
                      }

                    </div>
                  ),
                )
              }

            </div>

          </div>

        </section>



        {/* ==================================================
            FREE VS PRO
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              PLAN COMPARISON
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              Free starts the workflow.
              Pro gives it room to run.
            </h2>


            <p
              className={
                styles.sectionCopy
              }
            >
              We do not hide core product capabilities
              just to make a comparison table look better.
              Pro is about substantially more capacity
              for serious, sustained product work.
            </p>

          </div>


          <div
            className={
              styles.tableWrap
            }
          >

            <table
              className={
                styles.compareTable
              }
            >

              <thead>

                <tr>

                  <th>
                    Capability
                  </th>

                  <th>
                    Free
                    <small>
                      $0
                    </small>
                  </th>

                  <th
                    className={
                      styles.proColumn
                    }
                  >
                    Xroga Pro
                    <small>
                      $25/month
                    </small>
                  </th>

                </tr>

              </thead>


              <tbody>

                {
                  PLAN_COMPARISON.map(
                    (
                      [
                        feature,
                        free,
                        pro,
                      ],
                    ) => (
                      <tr
                        key={
                          feature
                        }
                      >

                        <td>
                          {
                            feature
                          }
                        </td>

                        <td>
                          {
                            free ===
                            'Included'
                              ? (
                                <span
                                  className={
                                    styles.tableYes
                                  }
                                >
                                  <Check />
                                  Included
                                </span>
                              )
                              : free
                          }
                        </td>

                        <td
                          className={
                            styles.proColumn
                          }
                        >
                          {
                            pro ===
                            'Included'
                              ? (
                                <span
                                  className={
                                    styles.tableYes
                                  }
                                >
                                  <Check />
                                  Included
                                </span>
                              )
                              : (
                                <strong>
                                  {
                                    pro
                                  }
                                </strong>
                              )
                          }
                        </td>

                      </tr>
                    ),
                  )
                }

              </tbody>

            </table>

          </div>

        </section>



        {/* ==================================================
            COMPETITOR COMPARISON
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              HOW THE MARKET DIFFERS
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              Different AI tools stop at
              different parts of the job.
            </h2>


            <p
              className={
                styles.sectionCopy
              }
            >
              The question is not whether another
              AI can write code. The question is how
              much of the journey from intent to
              verified software lives in one workflow.
            </p>

          </div>


          <div
            className={
              styles.competitorGrid
            }
          >

            {
              COMPETITORS.map(
                (
                  competitor,
                ) => (
                  <article
                    key={
                      competitor.name
                    }
                    className={
                      styles.competitorCard
                    }
                  >

                    <div
                      className={
                        styles.competitorTop
                      }
                    >

                      <strong>
                        {
                          competitor.name
                        }
                      </strong>

                      <span>
                        {
                          competitor.price
                        }
                      </span>

                    </div>


                    <div
                      className={
                        styles.competitorBlock
                      }
                    >

                      <small>
                        DOCUMENTED FOCUS
                      </small>

                      <p>
                        {
                          competitor.focus
                        }
                      </p>

                    </div>


                    <div
                      className={
                        styles.competitorDifference
                      }
                    >

                      <small>
                        XROGA DIFFERENCE
                      </small>

                      <p>
                        {
                          competitor.difference
                        }
                      </p>

                    </div>

                  </article>
                ),
              )
            }

          </div>


          <div
            className={
              styles.competitorNote
            }
          >

            <ShieldCheck />

            <p>
              Competitor prices and positioning shown
              for context as checked in September 2026.
              Products change frequently. This comparison
              describes documented focus rather than
              claiming another product cannot perform
              a particular task.
            </p>

          </div>

        </section>



        {/* ==================================================
            WHY XROGA
        ================================================== */}

        <section
          className={`${styles.section} ${styles.loopSection}`}
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              THE WHOLE LOOP
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              Code generation is one step.
              The product is the entire loop.
            </h2>

          </div>


          <div
            className={
              styles.loopGrid
            }
          >

            {
              [
                [
                  '01',
                  Search,
                  'Understand',
                  'Project, repository, objective and constraints.',
                ],

                [
                  '02',
                  Globe2,
                  'Research',
                  'Current sources, providers, APIs and evidence.',
                ],

                [
                  '03',
                  Code2,
                  'Build',
                  'Frontend, backend, data and integrations.',
                ],

                [
                  '04',
                  Monitor,
                  'Run',
                  'Start the actual application.',
                ],

                [
                  '05',
                  TestTube2,
                  'Verify & repair',
                  'Exercise behavior and repair observed failures.',
                ],

                [
                  '06',
                  Rocket,
                  'Ship',
                  'GitHub, deployment, database, domain and release evidence.',
                ],
              ].map(
                (
                  [
                    number,
                    Icon,
                    title,
                    body,
                  ],
                ) => (
                  <article
                    key={
                      String(
                        number,
                      )
                    }
                    className={
                      styles.loopCard
                    }
                  >

                    <span>
                      {
                        number
                      }
                    </span>

                    <Icon />

                    <h3>
                      {
                        title
                      }
                    </h3>

                    <p>
                      {
                        body
                      }
                    </p>

                  </article>
                ),
              )
            }

          </div>

        </section>



        {/* ==================================================
            AUDIENCE
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              FOR BUILDERS OF EVERY KIND
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              No blank IDE required.
            </h2>


            <p
              className={
                styles.sectionCopy
              }
            >
              Describe the outcome.
              Go technical only when you want to.
            </p>

          </div>


          <div
            className={
              styles.audienceGrid
            }
          >

            {
              AUDIENCES.map(
                (
                  audience,
                ) => {

                  const Icon =
                    audience.icon;


                  return (
                    <article
                      key={
                        audience.title
                      }
                      className={
                        styles.audienceCard
                      }
                    >

                      <Icon />

                      <h3>
                        {
                          audience.title
                        }
                      </h3>

                      <p>
                        {
                          audience.body
                        }
                      </p>

                    </article>
                  );

                },
              )
            }

          </div>

        </section>



        {/* ==================================================
            FAQ
        ================================================== */}

        <section
          className={
            styles.section
          }
        >

          <div
            className={
              styles.sectionHeading
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              PRICING FAQ
            </span>


            <h2
              className={
                styles.sectionTitle
              }
            >
              Clear capacity.
              No arbitrary action counter.
            </h2>

          </div>


          <div
            className={
              styles.faqGrid
            }
          >

            <details
              className={
                styles.faq
              }
            >

              <summary>
                What does included AI capacity mean?
              </summary>

              <p>
                Your plan includes capacity for Xroga&apos;s
                research, reasoning, coding and product-building
                work. Xroga shows understandable capacity and
                cycle status rather than forcing you to calculate
                internal model token costs.
              </p>

            </details>


            <details
              className={
                styles.faq
              }
            >

              <summary>
                Does my capacity reset every day?
              </summary>

              <p>
                Not exactly. Balanced Month progressively
                makes monthly capacity available through
                the billing cycle. When the currently
                available portion is used, later capacity
                can become available at the next unlock.
              </p>

            </details>


            <details
              className={
                styles.faq
              }
            >

              <summary>
                When does the full capacity renew?
              </summary>

              <p>
                Your included plan capacity begins a fresh
                cycle with the next monthly billing-cycle
                renewal.
              </p>

            </details>


            <details
              className={
                styles.faq
              }
            >

              <summary>
                What is Full Access?
              </summary>

              <p>
                Xroga Pro users can explicitly choose
                Full Access to make remaining working
                capacity for the current cycle available
                earlier instead of waiting for later
                progressive unlocks.
              </p>

            </details>


            <details
              className={
                styles.faq
              }
            >

              <summary>
                Does Full Access give extra capacity?
              </summary>

              <p>
                No. Full Access changes when current-cycle
                capacity becomes available. It does not
                increase the total monthly capacity.
              </p>

            </details>


            <details
              className={
                styles.faq
              }
            >

              <summary>
                What happens if I use the monthly capacity?
              </summary>

              <p>
                Completed work and project state remain
                preserved. New AI work can continue when
                capacity becomes available again or when
                the next cycle begins.
              </p>

            </details>


            <details
              className={
                styles.faq
              }
            >

              <summary>
                Do I need coding skills?
              </summary>

              <p>
                No. Xroga is designed so you can begin
                with the result you want in plain language.
                Developers can still inspect repository
                changes, terminal output and verification
                evidence when they want deeper control.
              </p>

            </details>


            <details
              className={
                styles.faq
              }
            >

              <summary>
                Does Xroga own my code?
              </summary>

              <p>
                Xroga&apos;s supported repository and publishing
                workflows are designed around GitHub and
                provider accounts you authorize, keeping
                project ownership outside a closed generated
                preview.
              </p>

            </details>

          </div>

        </section>



        {/* ==================================================
            FINAL CTA
        ================================================== */}

        <section
          className={
            styles.finalCta
          }
        >

          <div
            className={
              styles.finalGlow
            }
            aria-hidden="true"
          />


          <div
            className={
              styles.finalContent
            }
          >

            <span
              className={
                styles.eyebrow
              }
            >
              YOUR IDEA IS ENOUGH TO START
            </span>


            <h2>
              Build something real.
            </h2>


            <p>
              Research it. Build it. Test it.
              Repair it. Connect it. Ship it.
            </p>


            <div
              className={
                styles.finalButtons
              }
            >

              <button
                type="button"
                className={`${styles.ctaButton} ${styles.proCta} ${styles.finalButton}`}
                onClick={
                  () =>
                    router.push(
                      loggedIn
                        ? '/workspace'
                        : '/auth/signup',
                    )
                }
              >
                Start building free

                <ArrowRight />
              </button>


              {
                !proCurrent
                  ? loggedIn
                    ? (
                      <CheckoutButton
                        planTier="spark"
                        label="Get Xroga Pro"
                        className={`${styles.ctaButton} ${styles.freeCta} ${styles.finalButton}`}
                      />
                    )
                    : (
                      <button
                        type="button"
                        className={`${styles.ctaButton} ${styles.freeCta} ${styles.finalButton}`}
                        onClick={
                          () =>
                            router.push(
                              '/auth/signup',
                            )
                        }
                      >
                        Explore Xroga Pro
                      </button>
                    )
                  : null
              }

            </div>

          </div>

        </section>


      </main>

    </div>
  );
}
