'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  FileText,
  Folder,
  HelpCircle,
  Home,
  Image as ImageIcon,
  LayoutGrid,
  Menu,
  Package,
  Play,
  Scissors,
  Search,
  Send,
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

const MEDIA = [
  '/backgrounds/bg-desktop-1-infinity.webp',
  '/backgrounds/bg-desktop-2-earth.webp',
  '/backgrounds/bg-desktop-4-blackhole-nebula.webp',
  '/backgrounds/xroga-beige-ai-islands-bg.webp',
  '/backgrounds/xroga-beige-sculpted-data-bg.webp',
  '/backgrounds/xroga-beige-mars-pyramids-code-bg.webp',
  '/backgrounds/xroga-black-clouds-bg.webp',
] as const;

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
    image: MEDIA[0],
    prompt:
      'Create a cinematic documentary about cities of the future with a powerful opening hook, atmospheric narration, chapter structure, and premium futuristic visuals.',
  },
  {
    title: 'Space Signal Story',
    meta: 'Story · 16:9 · Cinematic',
    category: 'Stories',
    image: MEDIA[2],
    prompt:
      'Create a cinematic story about a mysterious signal arriving from deep space. Build suspense across connected scenes and finish with a powerful visual reveal.',
  },
  {
    title: 'Vertical Adventure',
    meta: 'Short · 9:16 · 45 sec',
    category: 'Shorts',
    image: MEDIA[3],
    prompt:
      'Create a 45-second vertical adventure about discovering floating islands above the clouds with fast pacing and a memorable final shot.',
  },
  {
    title: 'Technology Explained',
    meta: 'Explainer · 16:9 · 5 min',
    category: 'Videos',
    image: MEDIA[4],
    prompt:
      'Create a five-minute technology explainer using cinematic visual storytelling, clear narration, elegant transitions, and strong visual examples.',
  },
  {
    title: 'Lost Civilization',
    meta: 'Film · 16:9 · Story',
    category: 'Film',
    image: MEDIA[5],
    prompt:
      'Create a cinematic film concept about explorers discovering evidence of a lost civilization on Mars. Maintain visual continuity throughout the production.',
  },
  {
    title: 'Product Launch Film',
    meta: 'Ad · 16:9 · 30 sec',
    category: 'Ads',
    image: MEDIA[6],
    prompt:
      'Create a premium 30-second product launch film with dramatic lighting, precise pacing, cinematic shots, and luxury commercial direction.',
  },
];

const WORKFLOW = [
  {
    label: 'Idea',
    description:
      'Turn a rough thought into a clear creative direction.',
    chips: ['PROMPT', 'GOAL', 'FORMAT'],
    action: 'composer',
  },
  {
    label: 'Research',
    description:
      'Build visual context around topic, audience, environment, and direction.',
    chips: ['CONTEXT', 'VISUALS', 'ANGLE'],
    action: 'composer',
  },
  {
    label: 'Script',
    description:
      'Shape the hook, structure, narration, dialogue, and scene beats.',
    chips: ['HOOK', 'NARRATION', 'SCENES'],
    action: 'storyboard',
  },
  {
    label: 'Storyboard',
    description:
      'Plan shots, framing, timing, movement, and visual continuity.',
    chips: ['SHOTS', 'CAMERA', 'TIMING'],
    action: 'storyboard',
  },
  {
    label: 'Generate',
    description:
      'Transform planned scenes into visual outputs while keeping the project connected.',
    chips: ['SCENES', 'VISUALS', 'CONTINUITY'],
    action: 'storyboard',
  },
  {
    label: 'Edit',
    description:
      'Refine pacing, sequence, voice, captions, music, and the final cut.',
    chips: ['TIMELINE', 'VOICE', 'MUSIC'],
    action: 'editor',
  },
  {
    label: 'Package',
    description:
      'Prepare thumbnails, titles, descriptions, chapters, and presentation.',
    chips: ['THUMBNAIL', 'TITLE', 'SEO'],
    action: 'package',
  },
  {
    label: 'Publish',
    description:
      'Adapt one production across formats and prepare a release plan.',
    chips: ['16:9', '9:16', '4:5'],
    action: 'package',
  },
  {
    label: 'Grow',
    description:
      'Compare creative variants and learn which direction performs best.',
    chips: ['CTR', 'RETENTION', 'ITERATE'],
    action: 'package',
  },
] as const;

const PHASES = [
  'Understanding your idea',
  'Planning production',
  'Structuring scenes',
  'Preparing creative workflow',
] as const;

const STORYBOARD_FRAMES = [
  ['01', 'Opening', 'Wide reveal', MEDIA[2]],
  ['02', 'Discovery', 'Slow orbit', MEDIA[0]],
  ['03', 'Conflict', 'Push in', MEDIA[6]],
  ['04', 'Reveal', 'Crane up', MEDIA[1]],
  ['05', 'World', 'Aerial shot', MEDIA[3]],
  ['06', 'Detail', 'Macro move', MEDIA[4]],
] as const;

function scrollToSection(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
}

function WorkflowImage({
  src,
  alt = '',
}: {
  src: string;
  alt?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      quality={64}
      sizes="(max-width: 720px) 70vw, 260px"
    />
  );
}

function WorkflowStageVisual({
  stage,
}: {
  stage: number;
}) {
  if (stage === 0) {
    return (
      <div className="xv-stage-view xv-stage-idea">
        <div className="xv-stage-prompt">
          <header>
            <Sparkles />
            <span>
              <small>CREATIVE IDEA</small>
              <b>Future Cities: Life in 2050</b>
            </span>
          </header>

          <p>
            Create a cinematic documentary that
            opens above a city designed for a world
            that does not exist yet.
          </p>

          <div>
            <span>CINEMATIC</span>
            <span>16:9</span>
            <span>DOCUMENTARY</span>
          </div>
        </div>

        <div className="xv-stage-image-stack">
          {[MEDIA[0], MEDIA[1], MEDIA[3]].map(
            (image, index) => (
              <article key={image}>
                <WorkflowImage src={image} />

                <span>
                  DIRECTION {index + 1}
                </span>
              </article>
            ),
          )}
        </div>

        <div className="xv-stage-status">
          <Sparkles />
          Black Hole V∞ is turning the idea
          into visual directions
        </div>
      </div>
    );
  }

  if (stage === 1) {
    return (
      <div className="xv-stage-view xv-stage-research">
        <header className="xv-stage-mini-head">
          <span>
            <small>VISUAL RESEARCH</small>
            <b>Building the creative world</b>
          </span>

          <strong>4 directions found</strong>
        </header>

        <div className="xv-research-grid">
          {[
            [MEDIA[1], 'MEGACITY', 'Environment'],
            [MEDIA[4], 'SYSTEMS', 'Technology'],
            [MEDIA[3], 'HABITAT', 'Architecture'],
            [MEDIA[5], 'SCALE', 'World building'],
          ].map(([image, title, type]) => (
            <article key={title}>
              <WorkflowImage src={image} />

              <div>
                <small>{type}</small>
                <b>{title}</b>
              </div>
            </article>
          ))}
        </div>

        <div className="xv-stage-processing">
          <span>
            <i />
            Understanding visual language
          </span>

          <span>
            <CheckCircle2 />
            Direction map prepared
          </span>

          <span>
            <CheckCircle2 />
            References connected
          </span>
        </div>
      </div>
    );
  }

  if (stage === 2) {
    return (
      <div className="xv-stage-view xv-stage-script">
        <div className="xv-script-sheet">
          <header>
            <FileText />

            <span>
              <small>MASTER SCRIPT</small>
              <b>Future Cities — Draft 01</b>
            </span>

            <em>03:42</em>
          </header>

          <div className="xv-script-lines">
            <span>
              <b>00:00</b>
              “Imagine waking up inside a city
              designed around you.”
            </span>

            <span>
              <b>00:08</b>
              “No traffic lights. No wasted
              energy. No fixed streets.”
            </span>

            <span className="is-active">
              <b>00:17</b>
              “The city itself becomes an
              intelligent system.”
            </span>

            <span>
              <b>00:28</b>
              “And this future may be closer
              than we think.”
            </span>
          </div>
        </div>

        <div className="xv-script-visuals">
          {[MEDIA[0], MEDIA[4], MEDIA[1]].map(
            (image, index) => (
              <article key={image}>
                <WorkflowImage src={image} />

                <span>
                  SCENE {String(index + 1).padStart(2, '0')}
                </span>
              </article>
            ),
          )}
        </div>
      </div>
    );
  }

  if (stage === 3) {
    return (
      <div className="xv-stage-view xv-stage-storyboard">
        <header className="xv-stage-mini-head">
          <span>
            <small>STORYBOARD</small>
            <b>6 planned visual beats</b>
          </span>

          <strong>32.7 sec preview</strong>
        </header>

        <div className="xv-stage-story-grid">
          {STORYBOARD_FRAMES.map(
            ([number, title, camera, image]) => (
              <article key={number}>
                <div>
                  <WorkflowImage src={image} />

                  <span>
                    {number}
                  </span>
                </div>

                <b>{title}</b>
                <small>{camera}</small>
              </article>
            ),
          )}
        </div>
      </div>
    );
  }

  if (stage === 4) {
    return (
      <div className="xv-stage-view xv-stage-generate">
        <header className="xv-stage-mini-head">
          <span>
            <small>VISUAL GENERATION</small>
            <b>Producing connected scene outputs</b>
          </span>

          <strong className="is-live">
            <i />
            PREVIEW
          </strong>
        </header>

        <div className="xv-generation-grid">
          <article className="is-ready">
            <div>
              <WorkflowImage src={MEDIA[2]} />
              <span>
                <Check />
              </span>
            </div>

            <footer>
              <span>
                <small>SCENE 01</small>
                <b>Opening world</b>
              </span>

              <em>READY</em>
            </footer>
          </article>

          <article className="is-ready">
            <div>
              <WorkflowImage src={MEDIA[0]} />

              <span>
                <Check />
              </span>
            </div>

            <footer>
              <span>
                <small>SCENE 02</small>
                <b>Future district</b>
              </span>

              <em>READY</em>
            </footer>
          </article>

          <article className="is-generating">
            <div>
              <WorkflowImage src={MEDIA[1]} />

              <div className="xv-generating-overlay">
                <Sparkles />
                <b>Generating visual</b>
                <span>72%</span>
              </div>
            </div>

            <footer>
              <span>
                <small>SCENE 03</small>
                <b>City intelligence</b>
              </span>

              <em>72%</em>
            </footer>

            <i className="xv-generation-progress">
              <span />
            </i>
          </article>

          <article className="is-queued">
            <div>
              <WorkflowImage src={MEDIA[4]} />

              <div className="xv-queued-overlay">
                <span>04</span>
                <b>Queued</b>
              </div>
            </div>

            <footer>
              <span>
                <small>SCENE 04</small>
                <b>System reveal</b>
              </span>

              <em>QUEUE</em>
            </footer>
          </article>
        </div>

        <div className="xv-generation-footer">
          <span>
            <Sparkles />
            Black Hole V∞
          </span>

          <i />

          <span>
            Scene continuity
          </span>

          <i />

          <span>
            Visual direction
          </span>

          <i />

          <span>
            Production output
          </span>
        </div>
      </div>
    );
  }

  if (stage === 5) {
    return (
      <div className="xv-stage-view xv-stage-edit">
        <div className="xv-edit-preview">
          <WorkflowImage src={MEDIA[1]} />

          <button type="button" aria-label="Preview concept">
            <Play />
          </button>

          <div>
            <span>SCENE 04</span>
            <b>Future Cities — Master Cut</b>
          </div>
        </div>

        <div className="xv-mini-editor">
          <header>
            <small>00:00</small>
            <small>00:10</small>
            <small>00:20</small>
            <small>00:30</small>
          </header>

          <div>
            <b>VIDEO</b>
            <span className="video-track">
              <i />
              <i />
              <i />
              <i />
            </span>
          </div>

          <div>
            <b>VOICE</b>
            <span className="voice-track">
              <i />
            </span>
          </div>

          <div>
            <b>MUSIC</b>
            <span className="music-track">
              <i />
            </span>
          </div>
        </div>

        <div className="xv-edit-strip">
          {[MEDIA[2], MEDIA[0], MEDIA[6], MEDIA[1]].map(
            (image, index) => (
              <article key={`${image}-${index}`}>
                <WorkflowImage src={image} />
                <span>{index + 1}</span>
              </article>
            ),
          )}
        </div>
      </div>
    );
  }

  if (stage === 6) {
    return (
      <div className="xv-stage-view xv-stage-package">
        <header className="xv-stage-mini-head">
          <span>
            <small>PACKAGING</small>
            <b>Thumbnail concepts generated</b>
          </span>

          <strong>3 variations</strong>
        </header>

        <div className="xv-thumbnail-grid">
          {[
            [
              MEDIA[0],
              'THE CITIES OF 2050',
              'Concept A',
            ],
            [
              MEDIA[1],
              'INSIDE THE FUTURE',
              'Concept B',
            ],
            [
              MEDIA[4],
              'THIS CHANGES CITIES',
              'Concept C',
            ],
          ].map(([image, title, label]) => (
            <article key={label}>
              <div>
                <WorkflowImage src={image} />

                <strong>{title}</strong>
              </div>

              <footer>
                <span>{label}</span>
                <b>THUMBNAIL</b>
              </footer>
            </article>
          ))}
        </div>

        <div className="xv-title-options">
          <span>
            <b>01</b>
            The Cities That Will Define 2050
          </span>

          <span>
            <b>02</b>
            Inside Tomorrow&apos;s Smartest Cities
          </span>
        </div>
      </div>
    );
  }

  if (stage === 7) {
    return (
      <div className="xv-stage-view xv-stage-publish">
        <div className="xv-master-output">
          <div>
            <WorkflowImage src={MEDIA[0]} />
          </div>

          <span>
            <small>MASTER</small>
            <b>YouTube Film</b>
            <em>16:9</em>
          </span>
        </div>

        <ArrowRight className="xv-publish-arrow" />

        <div className="xv-format-grid">
          {[
            ['Short', '9:16', MEDIA[0]],
            ['Reel', '9:16', MEDIA[1]],
            ['Feed', '4:5', MEDIA[4]],
            ['Square', '1:1', MEDIA[3]],
          ].map(([title, ratio, image]) => (
            <article key={title}>
              <div>
                <WorkflowImage src={image} />
              </div>

              <span>
                <b>{title}</b>
                <small>{ratio}</small>
              </span>
            </article>
          ))}
        </div>

        <div className="xv-publish-status">
          <Send />
          One production adapted for every format
        </div>
      </div>
    );
  }

  return (
    <div className="xv-stage-view xv-stage-grow">
      <header className="xv-stage-mini-head">
        <span>
          <small>GROWTH WORKSPACE · DEMO DATA</small>
          <b>Compare creative directions</b>
        </span>

        <strong>
          <TrendingUp />
          Improving
        </strong>
      </header>

      <div className="xv-growth-visuals">
        {[
          [MEDIA[0], 'Variant A', '6.8%', '63%'],
          [MEDIA[1], 'Variant B', '5.1%', '54%'],
          [MEDIA[4], 'Variant C', '4.6%', '49%'],
        ].map(
          ([image, title, ctr, retention], index) => (
            <article
              key={title}
              className={
                index === 0
                  ? 'is-best'
                  : ''
              }
            >
              <div>
                <WorkflowImage src={image} />

                {index === 0 ? (
                  <span>BEST</span>
                ) : null}
              </div>

              <header>
                <b>{title}</b>
              </header>

              <footer>
                <span>
                  <small>CTR</small>
                  <b>{ctr}</b>
                </span>

                <span>
                  <small>RETENTION</small>
                  <b>{retention}</b>
                </span>
              </footer>
            </article>
          ),
        )}
      </div>

      <div className="xv-growth-insight">
        <BarChart3 />

        <span>
          <b>Preview insight</b>
          The brighter establishing frame creates
          the strongest opening direction.
        </span>
      </div>
    </div>
  );
}

export function VideoLandingPage() {
  const [mobileNavOpen, setMobileNavOpen] =
    useState(false);

  const [
    activeCreationTab,
    setActiveCreationTab,
  ] =
    useState<
      (typeof CREATION_TABS)[number]
    >('Videos');

  const [activeInputTab, setActiveInputTab] =
    useState<(typeof INPUT_TABS)[number]>(
      'Text to Video',
    );

  const [activeWorkflow, setActiveWorkflow] =
    useState(4);

  const [searchOpen, setSearchOpen] =
    useState(false);

  const [searchQuery, setSearchQuery] =
    useState('');

  const [prompt, setPrompt] = useState(
    TEMPLATES[0].prompt,
  );

  const [format, setFormat] =
    useState('YouTube');

  const [duration, setDuration] =
    useState('Auto');

  const [ratio, setRatio] =
    useState('16:9');

  const [style, setStyle] =
    useState('Cinematic');

  const [mode, setMode] =
    useState('Director');

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
        template.category ===
          activeCreationTab;

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
    goTo(
      WORKFLOW[activeWorkflow].action,
    );
  };

  return (
    <main className="xv-page" id="top">
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
            <strong>Video</strong>
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
              ([Icon, label, id], index) => (
                <button
                  type="button"
                  key={label}
                  className={
                    index === 0
                      ? 'is-active'
                      : ''
                  }
                  onClick={() => goTo(id)}
                >
                  <Icon />
                  <span>{label}</span>

                  {label === 'Create' ? (
                    <small>SOON</small>
                  ) : null}
                </button>
              ),
            )}
          </nav>

          <div className="xv-sidebar-group">
            <b>CREATIVE TOOLS</b>

            {TOOL_ITEMS.map(
              ([Icon, label, id]) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => goTo(id)}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              ),
            )}
          </div>

          <div className="xv-sidebar-group">
            <b>SUPPORT</b>

            <button
              type="button"
              onClick={() =>
                goTo('workflow')
              }
            >
              <HelpCircle />
              <span>How It Works</span>
            </button>

            <Link href="/auth/signup">
              <Sparkles />
              <span>Early Access</span>
            </Link>
          </div>

          <div className="xv-sidebar-journey">
            <b>HOW XROGA CREATES</b>

            {WORKFLOW.map(
              (item, index) => (
                <button
                  type="button"
                  key={item.label}
                  className={
                    index ===
                    activeWorkflow
                      ? 'is-current'
                      : ''
                  }
                  onClick={() => {
                    setActiveWorkflow(index);
                    goTo('workflow');
                  }}
                >
                  <span>
                    {String(
                      index + 1,
                    ).padStart(2, '0')}
                  </span>

                  <strong>
                    {item.label}
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
                    value={searchQuery}
                    onChange={(event) =>
                      setSearchQuery(
                        event.target.value,
                      )
                    }
                    placeholder="Search concepts"
                    aria-label="Search concepts"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery('');
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
                    setSearchOpen(true);
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
                src={MEDIA[2]}
                alt="Cinematic Xroga Video concept"
                fill
                priority
                quality={72}
                sizes="(max-width: 1100px) 100vw, 1200px"
              />

              <div className="xv-hero-overlay" />

              <div className="xv-hero-copy">
                <div className="xv-kicker">
                  <span>PRODUCT PREVIEW</span>
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
                  Research. Write. Direct.
                  Generate. Edit. Package.
                  Publish. Grow.
                </p>

                <small>
                  One connected workspace
                  designed for short-form,
                  long-form, ads, stories,
                  documentaries, and
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
                      goTo('composer')
                    }
                  >
                    Explore Workspace
                    <ChevronRight />
                  </button>
                </div>
              </div>

              <aside className="xv-hero-intelligence">
                <Sparkles />

                <b>BLACK HOLE V∞</b>

                <p>
                  The intelligence behind
                  your production.
                </p>

                <ul>
                  <li>
                    Understands the goal
                  </li>
                  <li>
                    Plans the story
                  </li>
                  <li>
                    Keeps creative context
                  </li>
                  <li>
                    Coordinates the workflow
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
                    What do you want to
                    create?
                  </label>

                  <textarea
                    id="xv-prompt"
                    value={prompt}
                    onChange={(event) =>
                      setPrompt(
                        event.target.value,
                      )
                    }
                  />

                  <div className="xv-select-row">
                    <label>
                      <span>Format</span>

                      <select
                        value={format}
                        onChange={(event) =>
                          setFormat(
                            event.target.value,
                          )
                        }
                      >
                        <option>YouTube</option>
                        <option>Short</option>
                        <option>Reel</option>
                        <option>Ad</option>
                        <option>Film</option>
                        <option>Auto</option>
                      </select>
                    </label>

                    <label>
                      <span>Duration</span>

                      <select
                        value={duration}
                        onChange={(event) =>
                          setDuration(
                            event.target.value,
                          )
                        }
                      >
                        <option>Auto</option>
                        <option>30 sec</option>
                        <option>1 min</option>
                        <option>3 min</option>
                        <option>10 min</option>
                        <option>30 min</option>
                      </select>
                    </label>

                    <label>
                      <span>Ratio</span>

                      <select
                        value={ratio}
                        onChange={(event) =>
                          setRatio(
                            event.target.value,
                          )
                        }
                      >
                        <option>16:9</option>
                        <option>9:16</option>
                        <option>1:1</option>
                        <option>4:5</option>
                      </select>
                    </label>

                    <label>
                      <span>Style</span>

                      <select
                        value={style}
                        onChange={(event) =>
                          setStyle(
                            event.target.value,
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
                        <option>Story</option>
                      </select>
                    </label>

                    <label>
                      <span>Mode</span>

                      <select
                        value={mode}
                        onChange={(event) =>
                          setMode(
                            event.target.value,
                          )
                        }
                      >
                        <option>Quick</option>
                        <option>Director</option>
                        <option>Growth</option>
                      </select>
                    </label>

                    <button
                      className="xv-create-button"
                      type="button"
                      onClick={runPreview}
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
                      <b>BLACK HOLE V∞</b>
                      <small>
                        Preview only · no AI
                        request
                      </small>
                    </div>
                  </header>

                  {previewPhase === null ? (
                    <p>
                      Choose your input and
                      settings, then press
                      Create Video to preview
                      the planned workflow.
                    </p>
                  ) : (
                    <div className="xv-phase-list">
                      {PHASES.map(
                        (phase, index) => (
                          <span
                            key={phase}
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
                        Xroga Video is coming
                        soon.
                      </b>

                      <small>
                        Live generation is not
                        enabled in this
                        product preview.
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
                  <small>EXPLORE</small>
                  <h2>
                    What you can create
                  </h2>
                </div>

                <p>
                  Select a concept to load
                  it directly into the
                  composer.
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
                            quality={66}
                            sizes="(max-width: 720px) 76vw, (max-width: 1200px) 34vw, 240px"
                          />
                        </span>

                        <span className="xv-template-copy">
                          <small>
                            {template.meta}
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
                  No concepts match this
                  search.

                  <button
                    type="button"
                    onClick={() =>
                      setSearchQuery('')
                    }
                  >
                    Clear search
                  </button>
                </div>
              )}
            </section>

            <section
              className="xv-section xv-workflow-section"
              id="workflow"
            >
              <header className="xv-section-head">
                <div>
                  <small>WORKFLOW</small>

                  <h2>
                    One connected production
                    journey
                  </h2>
                </div>

                <p>
                  Select a stage and watch
                  the product preview change
                  with it.
                </p>
              </header>

              <div className="xv-workflow-tabs">
                {WORKFLOW.map(
                  (item, index) => (
                    <button
                      type="button"
                      key={item.label}
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
                          index + 1,
                        ).padStart(
                          2,
                          '0',
                        )}
                      </span>

                      {item.label}
                    </button>
                  ),
                )}
              </div>

              <div className="xv-workflow-card xv-workflow-card-rich">
                <div className="xv-workflow-copy-rich">
                  <small>
                    STEP{' '}
                    {String(
                      activeWorkflow + 1,
                    ).padStart(2, '0')}
                  </small>

                  <h3>
                    {
                      WORKFLOW[
                        activeWorkflow
                      ].label
                    }
                  </h3>

                  <p>
                    {
                      WORKFLOW[
                        activeWorkflow
                      ].description
                    }
                  </p>

                  <div className="xv-step-pills">
                    {WORKFLOW[
                      activeWorkflow
                    ].chips.map((chip) => (
                      <span key={chip}>
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div className="xv-step-state">
                    <Sparkles />

                    <span>
                      <b>
                        Black Hole V∞
                      </b>

                      <small>
                        Maintaining context
                        across this stage
                      </small>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={
                      openWorkflowPreview
                    }
                  >
                    Open related preview
                    <ArrowRight />
                  </button>
                </div>

                <div className="xv-workflow-graphic xv-stage-canvas">
                  <WorkflowStageVisual
                    stage={activeWorkflow}
                  />
                </div>
              </div>
            </section>

            <section
              className="xv-section"
              id="storyboard"
            >
              <header className="xv-section-head">
                <div>
                  <small>STORYBOARD</small>

                  <h2>
                    See the production
                    before the final cut
                  </h2>
                </div>

                <p>
                  Scene imagery, shot
                  direction, duration, and
                  continuity in one view.
                </p>
              </header>

              <div className="xv-storyboard-grid">
                {STORYBOARD_FRAMES.slice(
                  0,
                  4,
                ).map(
                  ([
                    number,
                    title,
                    camera,
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
                          quality={64}
                          sizes="(max-width: 720px) 74vw, 240px"
                        />
                      </div>

                      <header>
                        <span>
                          SCENE {number}
                        </span>

                        <small>
                          {camera}
                        </small>
                      </header>

                      <b>{title}</b>

                      <p>
                        Generated visual
                        direction preview
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
                  </small>

                  <h2>
                    Shape every scene inside
                    one project
                  </h2>
                </div>

                <p>
                  Concept editing surface for
                  scene order, voice, music,
                  captions, and pacing.
                </p>
              </header>

              <div className="xv-editor-layout">
                <div className="xv-editor-stage">
                  <Image
                    src={MEDIA[1]}
                    alt="Xroga Video editor concept"
                    fill
                    quality={68}
                    sizes="(max-width: 900px) 100vw, 760px"
                  />

                  <div>
                    <small>
                      SCENE 04 · REVEAL
                    </small>

                    <b>
                      Future Cities — Master
                      Cut
                    </b>
                  </div>
                </div>

                <aside className="xv-editor-inspector">
                  <b>SCENE SETTINGS</b>

                  {[
                    [
                      'Camera',
                      'Orbital push',
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
                    ([label, value]) => (
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

              <div className="xv-timeline-scroll">
                <div className="xv-timeline">
                  <div className="xv-ruler">
                    <span>00:00</span>
                    <span>00:10</span>
                    <span>00:20</span>
                    <span>00:30</span>
                    <span>00:40</span>
                  </div>

                  <div className="xv-track">
                    <b>VIDEO</b>

                    <span className="video">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>

                  <div className="xv-track">
                    <b>VOICE</b>

                    <span className="voice">
                      <i />
                    </span>
                  </div>

                  <div className="xv-track">
                    <b>CAPTIONS</b>

                    <span className="captions">
                      <i>Opening</i>
                      <i>Future cities</i>
                      <i>Reveal</i>
                    </span>
                  </div>

                  <div className="xv-track">
                    <b>MUSIC</b>

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
                  One intelligence across
                  the production.
                </h2>

                <p>
                  Understand the goal, plan
                  the work, maintain creative
                  context, and coordinate the
                  experience without exposing
                  infrastructure complexity.
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
                    'Creative continuity',
                  ],
                  [
                    'OPTIMIZE',
                    'Format and packaging',
                  ],
                ].map(
                  ([title, body]) => (
                    <article
                      key={title}
                    >
                      <b>{title}</b>
                      <span>{body}</span>
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
                    Create once. Prepare
                    every format.
                  </h2>
                </div>

                <p>
                  Packaging, publishing, and
                  performance concepts inside
                  the same production.
                </p>
              </header>

              <div className="xv-release-grid">
                <article className="xv-release-card">
                  <Package />

                  <small>PACKAGE</small>

                  <b>
                    Thumbnail, titles,
                    chapters
                  </b>

                  <p>
                    The Cities That Will
                    Define 2050
                  </p>

                  <p>
                    Inside Tomorrow&apos;s
                    Smartest Cities
                  </p>
                </article>

                <article className="xv-release-card">
                  <CalendarDays />

                  <small>
                    PUBLISH · PLANNED
                  </small>

                  <b>
                    One project, multiple
                    releases
                  </b>

                  <div className="xv-calendar-mini">
                    <span>
                      MON
                      <b>Main video</b>
                    </span>

                    <span>
                      WED
                      <b>Reel</b>
                    </span>

                    <span>
                      FRI
                      <b>Short</b>
                    </span>
                  </div>
                </article>

                <article className="xv-release-card">
                  <BarChart3 />

                  <small>
                    GROW · DEMO DATA
                  </small>

                  <b>
                    Learn what performs
                  </b>

                  <div className="xv-metrics">
                    <span>
                      <small>CTR</small>
                      <b>6.8%</b>
                    </span>

                    <span>
                      <small>
                        Retention
                      </small>
                      <b>63%</b>
                    </span>
                  </div>

                  <p className="xv-insight">
                    <TrendingUp />

                    Stronger opening visual
                    direction detected.
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
                    This is an interactive
                    product preview.
                  </h2>

                  <p>
                    The imagery demonstrates
                    how the future workflow
                    could move from idea to
                    generated scenes, editing,
                    packaging, publishing,
                    and growth. Live AI video
                    generation is not enabled.
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
                One idea. Complete production.
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
