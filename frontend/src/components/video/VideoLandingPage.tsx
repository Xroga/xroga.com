'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  Compass,
  Folder,
  HelpCircle,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  Menu,
  Package,
  Scissors,
  Search,
  Shapes,
  Sparkles,
  TrendingUp,
  Workflow,
  X,
} from 'lucide-react';

import { Logo } from '@/components/layout/Logo';

type Template = {
  title: string;
  meta: string;
  category: string;
  image: string;
  prompt: string;
};

const NAV_ITEMS = [
  [Home, 'Home', 'top'],
  [Compass, 'Explore', 'explore'],
  [Sparkles, 'Create', 'composer'],
  [Folder, 'Projects', 'storyboard'],
  [Workflow, 'Workflow', 'workflow'],
  [LayoutGrid, 'Templates', 'explore'],
] as const;

const TOOL_ITEMS = [
  [Scissors, 'Editor', 'editor'],
  [ImageIcon, 'Assets', 'explore'],
  [Shapes, 'Brand Kit', 'package'],
] as const;

const CREATION_TABS = [
  'Videos',
  'Shorts',
  'Reels',
  'Ads',
  'Stories',
  'Film',
] as const;

const INPUT_TABS = [
  'Text to Video',
  'Image to Video',
  'Reference to Video',
  'Script to Video',
] as const;

const TEMPLATES: Template[] = [
  {
    title: 'Future Cities Documentary',
    meta: 'YouTube · 16:9 · Long-form',
    category: 'Videos',
    image: '/backgrounds/bg-desktop-1-infinity.webp',
    prompt:
      'Create a cinematic documentary about future cities, with a strong opening hook, atmospheric narration, chapter structure, and premium sci-fi visuals.',
  },
  {
    title: 'Space Signal Story',
    meta: 'Story · 16:9 · Cinematic',
    category: 'Stories',
    image: '/backgrounds/bg-desktop-4-blackhole-nebula.webp',
    prompt:
      'Create a cinematic story about a mysterious signal arriving from deep space. Build suspense across five connected scenes and end on a powerful reveal.',
  },
  {
    title: 'Vertical Adventure',
    meta: 'Short · 9:16 · 45 sec',
    category: 'Shorts',
    image: '/backgrounds/xroga-beige-ai-islands-bg.webp',
    prompt:
      'Create a 45-second vertical adventure about discovering floating islands above the clouds, with fast pacing and a memorable final shot.',
  },
  {
    title: 'Technology Explained',
    meta: 'Explainer · 16:9 · 5 min',
    category: 'Videos',
    image: '/backgrounds/xroga-beige-sculpted-data-bg.webp',
    prompt:
      'Create a clear five-minute visual explainer about how intelligent systems coordinate complex work, using cinematic technology imagery and simple narration.',
  },
  {
    title: 'Lost Civilization',
    meta: 'Film · 16:9 · Story',
    category: 'Film',
    image: '/backgrounds/xroga-beige-mars-pyramids-code-bg.webp',
    prompt:
      'Create a cinematic film concept about explorers discovering evidence of a lost civilization on Mars. Keep the visual language consistent across every scene.',
  },
  {
    title: 'Product Launch Film',
    meta: 'Ad · 16:9 · 30 sec',
    category: 'Ads',
    image: '/backgrounds/xroga-deep-work-bg.webp',
    prompt:
      'Create a premium 30-second product launch film with dramatic lighting, minimal copy, precise pacing, and luxury commercial cinematography.',
  },
];

const WORKFLOW = [
  ['Idea', 'Describe the outcome in plain language.'],
  ['Research', 'Build context around topic, audience, and angle.'],
  ['Script', 'Shape the hook, structure, narration, and dialogue.'],
  ['Storyboard', 'Plan scenes, shots, timing, and visual continuity.'],
  ['Generate', 'Prepare the scene-by-scene production workflow.'],
  ['Edit', 'Refine pacing, voice, captions, music, and order.'],
  ['Package', 'Prepare thumbnail, titles, descriptions, and chapters.'],
  ['Publish', 'Adapt formats and organize the release plan.'],
  ['Grow', 'Learn from performance signals and improve the next cut.'],
] as const;

const SCENES = [
  [
    '01',
    'Opening',
    '5.4 sec',
    '/backgrounds/bg-desktop-4-blackhole-nebula.webp',
  ],
  [
    '02',
    'Discovery',
    '7.1 sec',
    '/backgrounds/bg-desktop-1-infinity.webp',
  ],
  [
    '03',
    'Conflict',
    '6.2 sec',
    '/backgrounds/xroga-black-clouds-bg.webp',
  ],
  [
    '04',
    'Reveal',
    '8.0 sec',
    '/backgrounds/bg-desktop-2-earth.webp',
  ],
] as const;

const PHASES = [
  'Understanding your idea',
  'Planning production',
  'Structuring scenes',
  'Preparing creative workflow',
] as const;

function scrollToSection(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
}

export function VideoLandingPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [activeCreationTab, setActiveCreationTab] =
    useState<(typeof CREATION_TABS)[number]>('Videos');

  const [activeInputTab, setActiveInputTab] =
    useState<(typeof INPUT_TABS)[number]>('Text to Video');

  const [activeWorkflow, setActiveWorkflow] = useState(3);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [prompt, setPrompt] = useState(TEMPLATES[0].prompt);

  const [format, setFormat] = useState('YouTube');
  const [duration, setDuration] = useState('Auto');
  const [ratio, setRatio] = useState('16:9');
  const [style, setStyle] = useState('Cinematic');
  const [mode, setMode] = useState('Director');

  const [previewPhase, setPreviewPhase] =
    useState<number | null>(null);

  const [previewDone, setPreviewDone] =
    useState(false);

  const visibleTemplates = useMemo(() => {
    const q = searchQuery
      .trim()
      .toLowerCase();

    return TEMPLATES.filter((template) => {
      const tabMatches =
        activeCreationTab === 'Videos' ||
        template.category === activeCreationTab;

      const searchMatches =
        !q ||
        `${template.title} ${template.meta} ${template.category}`
          .toLowerCase()
          .includes(q);

      return tabMatches && searchMatches;
    });
  }, [activeCreationTab, searchQuery]);

  const goTo = (id: string) => {
    setMobileNavOpen(false);
    scrollToSection(id);
  };

  const applyTemplate = (
    template: Template,
  ) => {
    setPrompt(template.prompt);
    setActiveInputTab('Text to Video');
    scrollToSection('composer');
  };

  const runPreview = () => {
    if (
      previewPhase !== null &&
      !previewDone
    ) {
      return;
    }

    setPreviewDone(false);
    setPreviewPhase(0);

    window.setTimeout(
      () => setPreviewPhase(1),
      450,
    );

    window.setTimeout(
      () => setPreviewPhase(2),
      900,
    );

    window.setTimeout(
      () => setPreviewPhase(3),
      1350,
    );

    window.setTimeout(
      () => setPreviewDone(true),
      1800,
    );
  };

  const openWorkflowPreview = () => {
    const label =
      WORKFLOW[activeWorkflow][0];

    if (
      label === 'Storyboard' ||
      label === 'Generate'
    ) {
      goTo('storyboard');
      return;
    }

    if (label === 'Edit') {
      goTo('editor');
      return;
    }

    if (
      label === 'Package' ||
      label === 'Publish' ||
      label === 'Grow'
    ) {
      goTo('package');
      return;
    }

    goTo('composer');
  };

  return (
    <main
      className="xv-page"
      id="top"
    >
      <div className="xv-shell">
        <aside
          className={`xv-sidebar ${
            mobileNavOpen
              ? 'is-open'
              : ''
          }`}
          aria-label="Xroga Video navigation"
        >
          <div className="xv-logo-lockup">
            <Logo
              href={null}
              variant="homepage"
              height={30}
            />

            <i />

            <strong>
              Video
            </strong>
          </div>

          <button
            className="xv-sidebar-close"
            type="button"
            onClick={() =>
              setMobileNavOpen(false)
            }
            aria-label="Close menu"
          >
            <X />
          </button>

          <nav className="xv-sidebar-nav">
            {NAV_ITEMS.map(
              (
                [
                  Icon,
                  label,
                  id,
                ],
                index,
              ) => (
                <button
                  type="button"
                  key={label}
                  className={
                    index === 0
                      ? 'is-active'
                      : ''
                  }
                  onClick={() =>
                    goTo(id)
                  }
                >
                  <Icon />

                  <span>
                    {label}
                  </span>

                  {label ===
                  'Create' ? (
                    <small>
                      SOON
                    </small>
                  ) : null}
                </button>
              ),
            )}
          </nav>

          <div className="xv-sidebar-group">
            <b>
              CREATIVE TOOLS
            </b>

            {TOOL_ITEMS.map(
              ([
                Icon,
                label,
                id,
              ]) => (
                <button
                  type="button"
                  key={label}
                  onClick={() =>
                    goTo(id)
                  }
                >
                  <Icon />

                  <span>
                    {label}
                  </span>
                </button>
              ),
            )}
          </div>

          <div className="xv-sidebar-group">
            <b>
              SUPPORT
            </b>

            <button
              type="button"
              onClick={() =>
                goTo('workflow')
              }
            >
              <HelpCircle />

              <span>
                How It Works
              </span>
            </button>

            <Link href="/auth/signup">
              <Sparkles />

              <span>
                Early Access
              </span>
            </Link>
          </div>

          <div className="xv-sidebar-journey">
            <b>
              HOW XROGA CREATES
            </b>

            {WORKFLOW.map(
              (
                [label],
                index,
              ) => (
                <button
                  type="button"
                  key={label}
                  className={
                    index ===
                    activeWorkflow
                      ? 'is-current'
                      : ''
                  }
                  onClick={() => {
                    setActiveWorkflow(
                      index,
                    );

                    goTo(
                      'workflow',
                    );
                  }}
                >
                  <span>
                    {String(
                      index + 1,
                    ).padStart(
                      2,
                      '0',
                    )}
                  </span>

                  <strong>
                    {label}
                  </strong>
                </button>
              ),
            )}
          </div>
        </aside>

        {mobileNavOpen ? (
          <button
            className="xv-nav-backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() =>
              setMobileNavOpen(false)
            }
          />
        ) : null}

        <section className="xv-main">
          <header className="xv-topbar">
            <button
              className="xv-menu-button"
              type="button"
              onClick={() =>
                setMobileNavOpen(true)
              }
              aria-label="Open menu"
            >
              <Menu />
            </button>

            <nav
              className="xv-category-tabs"
              aria-label="Creation categories"
            >
              {CREATION_TABS.map(
                (tab) => (
                  <button
                    type="button"
                    key={tab}
                    className={
                      activeCreationTab ===
                      tab
                        ? 'is-active'
                        : ''
                    }
                    onClick={() => {
                      setActiveCreationTab(
                        tab,
                      );

                      scrollToSection(
                        'explore',
                      );
                    }}
                  >
                    {tab}
                  </button>
                ),
              )}
            </nav>

            <div className="xv-top-actions">
              {searchOpen ? (
                <label className="xv-search-field">
                  <Search />

                  <input
                    autoFocus
                    value={
                      searchQuery
                    }
                    onChange={(
                      event,
                    ) =>
                      setSearchQuery(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Search concepts"
                    aria-label="Search concepts"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(
                        false,
                      );

                      setSearchQuery(
                        '',
                      );
                    }}
                    aria-label="Close search"
                  >
                    <X />
                  </button>
                </label>
              ) : (
                <button
                  className="xv-icon-button"
                  type="button"
                  onClick={() => {
                    setSearchOpen(
                      true,
                    );

                    scrollToSection(
                      'explore',
                    );
                  }}
                  aria-label="Search concepts"
                >
                  <Search />
                </button>
              )}

              <span className="xv-coming-soon">
                COMING SOON
              </span>

              <Link
                className="xv-early-button"
                href="/auth/signup"
              >
                Join Early Access

                <ArrowRight />
              </Link>
            </div>
          </header>

          <div className="xv-content">
            <section
              className="xv-hero"
              aria-labelledby="xv-title"
            >
              <Image
                src="/backgrounds/bg-desktop-4-blackhole-nebula.webp"
                alt="Cinematic Xroga Video concept"
                fill
                priority
                quality={72}
                sizes="(max-width: 1100px) 100vw, 1200px"
              />

              <div className="xv-hero-overlay" />

              <div className="xv-hero-copy">
                <div className="xv-kicker">
                  <span>
                    PRODUCT PREVIEW
                  </span>

                  <span>
                    AI VIDEO WORKSPACE
                  </span>
                </div>

                <h1 id="xv-title">
                  Turn one idea into
                  <br />

                  <em>
                    a complete production.
                  </em>
                </h1>

                <p>
                  Research. Write.
                  Direct. Generate.
                  Edit. Package.
                  Publish. Grow.
                </p>

                <small>
                  Xroga Video is being
                  designed as one
                  connected workspace
                  for short-form,
                  long-form, ads,
                  stories, and
                  cinematic production.
                </small>

                <div className="xv-hero-actions">
                  <Link href="/auth/signup">
                    Join Early Access

                    <ArrowRight />
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      goTo(
                        'composer',
                      )
                    }
                  >
                    Explore Workspace

                    <ChevronRight />
                  </button>
                </div>
              </div>

              <aside className="xv-hero-intelligence">
                <Sparkles />

                <b>
                  BLACK HOLE V∞
                </b>

                <p>
                  The intelligence
                  behind your
                  production.
                </p>

                <ul>
                  <li>
                    Understands the
                    goal
                  </li>

                  <li>
                    Plans the story
                  </li>

                  <li>
                    Keeps creative
                    context
                  </li>

                  <li>
                    Coordinates the
                    workflow
                  </li>
                </ul>
              </aside>
            </section>

            <section
              className="xv-composer"
              id="composer"
            >
              <div className="xv-composer-tabs">
                {INPUT_TABS.map(
                  (tab) => (
                    <button
                      type="button"
                      key={tab}
                      className={
                        activeInputTab ===
                        tab
                          ? 'is-active'
                          : ''
                      }
                      onClick={() =>
                        setActiveInputTab(
                          tab,
                        )
                      }
                    >
                      {tab}
                    </button>
                  ),
                )}
              </div>

              <div className="xv-composer-body">
                <div className="xv-prompt-panel">
                  <label htmlFor="xv-prompt">
                    What do you want
                    to create?
                  </label>

                  <textarea
                    id="xv-prompt"
                    value={prompt}
                    onChange={(
                      event,
                    ) =>
                      setPrompt(
                        event
                          .target
                          .value,
                      )
                    }
                  />

                  <div className="xv-select-row">
                    <label>
                      <span>
                        Format
                      </span>

                      <select
                        value={format}
                        onChange={(
                          event,
                        ) =>
                          setFormat(
                            event
                              .target
                              .value,
                          )
                        }
                      >
                        <option>
                          YouTube
                        </option>

                        <option>
                          Short
                        </option>

                        <option>
                          Reel
                        </option>

                        <option>
                          Ad
                        </option>

                        <option>
                          Film
                        </option>

                        <option>
                          Auto
                        </option>
                      </select>
                    </label>

                    <label>
                      <span>
                        Duration
                      </span>

                      <select
                        value={
                          duration
                        }
                        onChange={(
                          event,
                        ) =>
                          setDuration(
                            event
                              .target
                              .value,
                          )
                        }
                      >
                        <option>
                          Auto
                        </option>

                        <option>
                          30 sec
                        </option>

                        <option>
                          1 min
                        </option>

                        <option>
                          3 min
                        </option>

                        <option>
                          10 min
                        </option>

                        <option>
                          30 min
                        </option>
                      </select>
                    </label>

                    <label>
                      <span>
                        Ratio
                      </span>

                      <select
                        value={ratio}
                        onChange={(
                          event,
                        ) =>
                          setRatio(
                            event
                              .target
                              .value,
                          )
                        }
                      >
                        <option>
                          16:9
                        </option>

                        <option>
                          9:16
                        </option>

                        <option>
                          1:1
                        </option>

                        <option>
                          4:5
                        </option>
                      </select>
                    </label>

                    <label>
                      <span>
                        Style
                      </span>

                      <select
                        value={style}
                        onChange={(
                          event,
                        ) =>
                          setStyle(
                            event
                              .target
                              .value,
                          )
                        }
                      >
                        <option>
                          Cinematic
                        </option>

                        <option>
                          Documentary
                        </option>

                        <option>
                          Animated
                        </option>

                        <option>
                          Commercial
                        </option>

                        <option>
                          Story
                        </option>
                      </select>
                    </label>

                    <label>
                      <span>
                        Mode
                      </span>

                      <select
                        value={mode}
                        onChange={(
                          event,
                        ) =>
                          setMode(
                            event
                              .target
                              .value,
                          )
                        }
                      >
                        <option>
                          Quick
                        </option>

                        <option>
                          Director
                        </option>

                        <option>
                          Growth
                        </option>
                      </select>
                    </label>

                    <button
                      className="xv-create-button"
                      type="button"
                      onClick={
                        runPreview
                      }
                      disabled={
                        previewPhase !==
                          null &&
                        !previewDone
                      }
                    >
                      {previewPhase !==
                        null &&
                      !previewDone
                        ? 'Preparing…'
                        : 'Create Video'}

                      <Sparkles />
                    </button>
                  </div>
                </div>

                <aside className="xv-preview-panel">
                  <header>
                    <Sparkles />

                    <div>
                      <b>
                        BLACK HOLE V∞
                      </b>

                      <small>
                        Preview only ·
                        no AI request
                      </small>
                    </div>
                  </header>

                  {previewPhase ===
                  null ? (
                    <p>
                      Choose your
                      input and
                      settings, then
                      press Create
                      Video to preview
                      the planned
                      workflow.
                    </p>
                  ) : (
                    <div className="xv-phase-list">
                      {PHASES.map(
                        (
                          phase,
                          index,
                        ) => (
                          <span
                            key={
                              phase
                            }
                            className={
                              index <=
                              previewPhase
                                ? 'is-active'
                                : ''
                            }
                          >
                            {index <
                              previewPhase ||
                            previewDone ? (
                              <Check />
                            ) : (
                              <i />
                            )}

                            {phase}
                          </span>
                        ),
                      )}
                    </div>
                  )}

                  {previewDone ? (
                    <div className="xv-preview-ready">
                      <b>
                        Xroga Video is
                        coming soon.
                      </b>

                      <small>
                        Live generation
                        is not enabled
                        on this preview.
                      </small>

                      <Link href="/auth/signup">
                        Join Early Access

                        <ArrowRight />
                      </Link>
                    </div>
                  ) : null}
                </aside>
              </div>
            </section>

            <section
              className="xv-section"
              id="explore"
            >
              <header className="xv-section-head">
                <div>
                  <small>
                    EXPLORE
                  </small>

                  <h2>
                    What you can
                    create
                  </h2>
                </div>

                <p>
                  Select a concept to
                  load it directly
                  into the composer.
                </p>
              </header>

              {visibleTemplates.length ? (
                <div className="xv-template-grid">
                  {visibleTemplates.map(
                    (template) => (
                      <button
                        className="xv-template-card"
                        type="button"
                        key={
                          template.title
                        }
                        onClick={() =>
                          applyTemplate(
                            template,
                          )
                        }
                      >
                        <span className="xv-template-image">
                          <Image
                            src={
                              template.image
                            }
                            alt=""
                            fill
                            quality={
                              68
                            }
                            sizes="(max-width: 720px) 76vw, (max-width: 1200px) 34vw, 240px"
                          />
                        </span>

                        <span className="xv-template-copy">
                          <small>
                            {
                              template.meta
                            }
                          </small>

                          <b>
                            {
                              template.title
                            }
                          </b>

                          <em>
                            Use concept

                            <ArrowRight />
                          </em>
                        </span>
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <div className="xv-empty-state">
                  No concepts match
                  this search.

                  <button
                    type="button"
                    onClick={() =>
                      setSearchQuery(
                        '',
                      )
                    }
                  >
                    Clear search
                  </button>
                </div>
              )}
            </section>

            <section
              className="xv-section"
              id="workflow"
            >
              <header className="xv-section-head">
                <div>
                  <small>
                    WORKFLOW
                  </small>

                  <h2>
                    One connected
                    production journey
                  </h2>
                </div>

                <p>
                  Click any stage to
                  see what that part
                  of the future
                  workspace is
                  designed to handle.
                </p>
              </header>

              <div className="xv-workflow-tabs">
                {WORKFLOW.map(
                  (
                    [label],
                    index,
                  ) => (
                    <button
                      type="button"
                      key={label}
                      className={
                        activeWorkflow ===
                        index
                          ? 'is-active'
                          : ''
                      }
                      onClick={() =>
                        setActiveWorkflow(
                          index,
                        )
                      }
                    >
                      <span>
                        {String(
                          index +
                            1,
                        ).padStart(
                          2,
                          '0',
                        )}
                      </span>

                      {label}
                    </button>
                  ),
                )}
              </div>

              <div className="xv-workflow-card">
                <div>
                  <small>
                    STEP{' '}
                    {String(
                      activeWorkflow +
                        1,
                    ).padStart(
                      2,
                      '0',
                    )}
                  </small>

                  <h3>
                    {
                      WORKFLOW[
                        activeWorkflow
                      ][0]
                    }
                  </h3>

                  <p>
                    {
                      WORKFLOW[
                        activeWorkflow
                      ][1]
                    }
                  </p>

                  <button
                    type="button"
                    onClick={
                      openWorkflowPreview
                    }
                  >
                    Open related
                    preview

                    <ArrowRight />
                  </button>
                </div>

                <div className="xv-workflow-graphic">
                  <span />

                  <span />

                  <i>
                    <Sparkles />
                  </i>

                  <b>
                    {
                      WORKFLOW[
                        activeWorkflow
                      ][0]
                    }
                  </b>
                </div>
              </div>
            </section>

            <section
              className="xv-section"
              id="storyboard"
            >
              <header className="xv-section-head">
                <div>
                  <small>
                    STORYBOARD
                  </small>

                  <h2>
                    Plan every scene
                    before production
                  </h2>
                </div>

                <p>
                  Concept UI showing
                  shot order,
                  duration, and
                  visual continuity.
                </p>
              </header>

              <div className="xv-storyboard-grid">
                {SCENES.map(
                  ([
                    number,
                    title,
                    time,
                    image,
                  ]) => (
                    <article
                      key={number}
                    >
                      <div>
                        <Image
                          src={image}
                          alt={`${title} storyboard concept`}
                          fill
                          quality={66}
                          sizes="(max-width: 720px) 74vw, 240px"
                        />
                      </div>

                      <header>
                        <span>
                          SCENE{' '}
                          {number}
                        </span>

                        <small>
                          {time}
                        </small>
                      </header>

                      <b>
                        {title}
                      </b>

                      <p>
                        {number ===
                        '01'
                          ? 'Wide establishing reveal'
                          : number ===
                              '02'
                            ? 'Slow camera orbit'
                            : number ===
                                '03'
                              ? 'Tighter dramatic push'
                              : 'Final crane reveal'}
                      </p>
                    </article>
                  ),
                )}
              </div>
            </section>

            <section
              className="xv-section"
              id="editor"
            >
              <header className="xv-section-head">
                <div>
                  <small>
                    DIRECTOR + EDITOR
                    PREVIEW
                  </small>

                  <h2>
                    Creative control
                    without leaving
                    the project
                  </h2>
                </div>

                <p>
                  A lighter concept
                  editor designed to
                  stay fast on
                  desktop and mobile.
                </p>
              </header>

              <div className="xv-editor-layout">
                <div className="xv-editor-stage">
                  <Image
                    src="/backgrounds/bg-desktop-2-earth.webp"
                    alt="Xroga Video editor concept"
                    fill
                    quality={70}
                    sizes="(max-width: 900px) 100vw, 760px"
                  />

                  <div>
                    <small>
                      SCENE 04 ·
                      REVEAL
                    </small>

                    <b>
                      Future Cities —
                      master cut
                    </b>
                  </div>
                </div>

                <aside className="xv-editor-inspector">
                  <b>
                    SCENE SETTINGS
                  </b>

                  {[
                    [
                      'Camera',
                      'Slow orbital push',
                    ],
                    [
                      'Lighting',
                      'Blue hour',
                    ],
                    [
                      'Voice',
                      'Narrator A',
                    ],
                    [
                      'Style',
                      'Cinematic',
                    ],
                    [
                      'Captions',
                      'Enabled',
                    ],
                    [
                      'Duration',
                      '8.0 sec',
                    ],
                  ].map(
                    ([
                      label,
                      value,
                    ]) => (
                      <button
                        type="button"
                        key={label}
                      >
                        <span>
                          {label}
                        </span>

                        <strong>
                          {value}
                        </strong>

                        <ChevronRight />
                      </button>
                    ),
                  )}
                </aside>
              </div>

              <div
                className="xv-timeline-scroll"
                aria-label="Concept editor timeline"
              >
                <div className="xv-timeline">
                  <div className="xv-ruler">
                    <span>
                      00:00
                    </span>

                    <span>
                      00:10
                    </span>

                    <span>
                      00:20
                    </span>

                    <span>
                      00:30
                    </span>

                    <span>
                      00:40
                    </span>
                  </div>

                  <div className="xv-track">
                    <b>
                      VIDEO
                    </b>

                    <span className="video">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>

                  <div className="xv-track">
                    <b>
                      VOICE
                    </b>

                    <span className="voice">
                      <i />
                    </span>
                  </div>

                  <div className="xv-track">
                    <b>
                      CAPTIONS
                    </b>

                    <span className="captions">
                      <i>
                        Opening hook
                      </i>

                      <i>
                        Future cities
                      </i>

                      <i>
                        The reveal
                      </i>
                    </span>
                  </div>

                  <div className="xv-track">
                    <b>
                      MUSIC
                    </b>

                    <span className="music">
                      <i />
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="xv-section xv-intelligence">
              <div className="xv-intelligence-mark">
                <span />

                <i />

                <Sparkles />
              </div>

              <div className="xv-intelligence-copy">
                <small>
                  BLACK HOLE V∞
                </small>

                <h2>
                  One intelligence
                  across the
                  production.
                </h2>

                <p>
                  Xroga keeps the
                  underlying
                  complexity behind
                  one creative
                  interface:
                  understand the
                  goal, plan the
                  work, maintain
                  context, and
                  prepare the final
                  output.
                </p>
              </div>

              <div className="xv-intelligence-points">
                {[
                  [
                    'UNDERSTAND',
                    'Goal, audience, direction',
                  ],
                  [
                    'PLAN',
                    'Structure, scenes, assets',
                  ],
                  [
                    'CONNECT',
                    'Continuity across the project',
                  ],
                  [
                    'OPTIMIZE',
                    'Format, packaging, release',
                  ],
                ].map(
                  ([
                    title,
                    body,
                  ]) => (
                    <article
                      key={title}
                    >
                      <b>
                        {title}
                      </b>

                      <span>
                        {body}
                      </span>
                    </article>
                  ),
                )}
              </div>
            </section>

            <section
              className="xv-section"
              id="package"
            >
              <header className="xv-section-head">
                <div>
                  <small>
                    FINISH + RELEASE
                  </small>

                  <h2>
                    Create once.
                    Prepare every
                    format.
                  </h2>
                </div>

                <p>
                  Packaging,
                  publishing, and
                  growth concepts
                  remain clearly
                  marked as planned
                  or demo data.
                </p>
              </header>

              <div className="xv-release-grid">
                <article className="xv-release-card">
                  <Package />

                  <small>
                    PACKAGE
                  </small>

                  <b>
                    Titles,
                    thumbnail,
                    chapters
                  </b>

                  <p>
                    The Cities That
                    Will Define 2050
                  </p>

                  <p>
                    Inside
                    Tomorrow&apos;s
                    Smartest Cities
                  </p>
                </article>

                <article className="xv-release-card">
                  <CalendarDays />

                  <small>
                    PUBLISH ·
                    PLANNED
                  </small>

                  <b>
                    One project,
                    multiple
                    releases
                  </b>

                  <div className="xv-calendar-mini">
                    <span>
                      MON

                      <b>
                        Main video
                      </b>
                    </span>

                    <span>
                      WED

                      <b>
                        Reel
                      </b>
                    </span>

                    <span>
                      FRI

                      <b>
                        Short
                      </b>
                    </span>
                  </div>
                </article>

                <article className="xv-release-card">
                  <BarChart3 />

                  <small>
                    GROW · DEMO DATA
                  </small>

                  <b>
                    Learn what
                    performs
                  </b>

                  <div className="xv-metrics">
                    <span>
                      <small>
                        CTR
                      </small>

                      <b>
                        6.8%
                      </b>
                    </span>

                    <span>
                      <small>
                        Retention
                      </small>

                      <b>
                        63%
                      </b>
                    </span>
                  </div>

                  <p className="xv-insight">
                    <TrendingUp />

                    Move the
                    strongest visual
                    earlier in the
                    opening hook.
                  </p>
                </article>
              </div>
            </section>

            <section className="xv-development">
              <div>
                <Sparkles />

                <span>
                  <small>
                    XROGA VIDEO IS IN
                    DEVELOPMENT
                  </small>

                  <h2>
                    This is an
                    interactive
                    product preview.
                  </h2>

                  <p>
                    Live AI video
                    generation is not
                    enabled here.
                    Explore the
                    planned creation,
                    storyboard,
                    editing,
                    packaging,
                    publishing, and
                    growth
                    experience.
                  </p>
                </span>
              </div>

              <Link href="/auth/signup">
                Join Early Access

                <ArrowRight />
              </Link>
            </section>

            <footer className="xv-footer">
              <span>
                © 2026 XROGA AI
              </span>

              <b>
                One idea. Complete
                production.
              </b>

              <div>
                <Link href="/privacy">
                  Privacy
                </Link>

                <Link href="/terms">
                  Terms
                </Link>

                <Link href="/contact">
                  Contact
                </Link>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
