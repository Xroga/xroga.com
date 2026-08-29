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

const MEDIA = {
  infinity: '/backgrounds/bg-desktop-1-infinity.webp',
  earth: '/backgrounds/bg-desktop-2-earth.webp',
  blackhole: '/backgrounds/bg-desktop-4-blackhole-nebula.webp',
  islands: '/backgrounds/xroga-beige-ai-islands-bg.webp',
  data: '/backgrounds/xroga-beige-sculpted-data-bg.webp',
  mars: '/backgrounds/xroga-beige-mars-pyramids-code-bg.webp',
  clouds: '/backgrounds/xroga-black-coder-voxel-space-bg-20260829.webp',
} as const;

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

const TEMPLATES: Template[] = [
  {
    title: 'Future Cities',
    meta: 'DOCUMENTARY · 16:9',
    category: 'Videos',
    image: MEDIA.infinity,
    prompt:
      'Create a cinematic documentary about the cities of 2050 with a powerful opening hook, atmospheric narration, strong visual continuity, and chapter structure.',
  },
  {
    title: 'Signal From Space',
    meta: 'STORY · 16:9',
    category: 'Stories',
    image: MEDIA.blackhole,
    prompt:
      'Create a cinematic story about a mysterious signal reaching Earth from deep space. Build suspense across connected scenes and end with a visual reveal.',
  },
  {
    title: 'World Above Clouds',
    meta: 'SHORT · 9:16',
    category: 'Shorts',
    image: MEDIA.islands,
    prompt:
      'Create a fast cinematic vertical story about discovering a civilization floating above the clouds.',
  },
  {
    title: 'Intelligence Explained',
    meta: 'EXPLAINER · 16:9',
    category: 'Videos',
    image: MEDIA.data,
    prompt:
      'Create a premium technology explainer using cinematic imagery, simple narration, and elegant visual transitions.',
  },
  {
    title: 'Lost Mars Civilization',
    meta: 'FILM · 16:9',
    category: 'Film',
    image: MEDIA.mars,
    prompt:
      'Create a cinematic film concept about explorers discovering evidence of an ancient civilization on Mars.',
  },
  {
    title: 'Product Launch',
    meta: 'AD · 16:9',
    category: 'Ads',
    image: MEDIA.clouds,
    prompt:
      'Create a premium 30-second launch film with dramatic lighting, precision camera movement, and luxury advertising direction.',
  },
];

const WORKFLOW = [
  {
    label: 'Idea',
    description:
      'Turn one rough thought into a clear creative direction.',
    chips: ['PROMPT', 'GOAL', 'FORMAT'],
    destination: 'composer',
  },
  {
    label: 'Research',
    description:
      'Build the visual world, references, audience context, and creative angle.',
    chips: ['CONTEXT', 'VISUALS', 'ANGLE'],
    destination: 'explore',
  },
  {
    label: 'Script',
    description:
      'Shape the hook, narration, story structure, dialogue, and scene beats.',
    chips: ['HOOK', 'NARRATION', 'SCENES'],
    destination: 'storyboard',
  },
  {
    label: 'Storyboard',
    description:
      'Plan every visual beat, camera direction, scene duration, and transition.',
    chips: ['SHOTS', 'CAMERA', 'TIMING'],
    destination: 'storyboard',
  },
  {
    label: 'Generate',
    description:
      'Produce connected scene visuals while maintaining one creative direction.',
    chips: ['GENERATE', 'SCENES', 'CONTEXT'],
    destination: 'storyboard',
  },
  {
    label: 'Edit',
    description:
      'Assemble the cut, narration, captions, music, timing, and scene order.',
    chips: ['TIMELINE', 'VOICE', 'MUSIC'],
    destination: 'editor',
  },
  {
    label: 'Package',
    description:
      'Create thumbnail concepts, titles, chapters, descriptions, and presentation.',
    chips: ['THUMBNAIL', 'TITLE', 'SEO'],
    destination: 'package',
  },
  {
    label: 'Publish',
    description:
      'Adapt the production into multiple formats and prepare its release.',
    chips: ['16:9', '9:16', '4:5'],
    destination: 'package',
  },
  {
    label: 'Grow',
    description:
      'Compare creative variants and learn which direction performs strongest.',
    chips: ['CTR', 'RETENTION', 'ITERATE'],
    destination: 'package',
  },
] as const;

const PHASES = [
  'Understanding your idea',
  'Planning production',
  'Structuring scenes',
  'Preparing creative workflow',
] as const;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function MediaImage({
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
      quality={65}
      sizes="(max-width: 720px) 80vw, 320px"
    />
  );
}

function IdeaVisual() {
  return (
    <div className="xv-flow-screen xv-flow-idea">
      <div className="xv-idea-prompt">
        <header>
          <Sparkles />
          <span>
            <small>CREATIVE IDEA</small>
            <b>Life inside the cities of 2050</b>
          </span>
        </header>

        <p>
          Create a cinematic documentary that opens above a
          city designed around people, intelligence, and
          autonomous infrastructure.
        </p>

        <footer>
          <span>CINEMATIC</span>
          <span>DOCUMENTARY</span>
          <span>16:9</span>
        </footer>
      </div>

      <div className="xv-idea-images">
        <article className="is-large">
          <MediaImage src={MEDIA.infinity} />
          <span>PRIMARY DIRECTION</span>
        </article>

        <article>
          <MediaImage src={MEDIA.earth} />
          <span>WORLD</span>
        </article>

        <article>
          <MediaImage src={MEDIA.data} />
          <span>TECHNOLOGY</span>
        </article>
      </div>
    </div>
  );
}

function ResearchVisual() {
  const items = [
    [MEDIA.earth, 'ENVIRONMENT', 'Future megacity'],
    [MEDIA.data, 'TECHNOLOGY', 'Connected systems'],
    [MEDIA.islands, 'ARCHITECTURE', 'New habitats'],
    [MEDIA.mars, 'WORLD BUILDING', 'Scale & atmosphere'],
  ];

  return (
    <div className="xv-flow-screen">
      <header className="xv-flow-toolbar">
        <span>
          <small>VISUAL RESEARCH</small>
          <b>Building the creative world</b>
        </span>

        <em>4 DIRECTIONS</em>
      </header>

      <div className="xv-research-board">
        {items.map(([image, type, title]) => (
          <article key={title}>
            <MediaImage src={image} />

            <div>
              <small>{type}</small>
              <b>{title}</b>
            </div>
          </article>
        ))}
      </div>

      <footer className="xv-flow-status">
        <span>
          <i />
          Understanding visual language
        </span>

        <span>
          <Check />
          References connected
        </span>

        <span>
          <Check />
          Direction prepared
        </span>
      </footer>
    </div>
  );
}

function ScriptVisual() {
  return (
    <div className="xv-flow-screen xv-script-layout">
      <section className="xv-script-paper">
        <header>
          <FileText />

          <span>
            <small>MASTER SCRIPT</small>
            <b>Future Cities — Draft 01</b>
          </span>

          <em>03:42</em>
        </header>

        <div className="xv-script-lines">
          <p>
            <b>00:00</b>
            “Imagine waking up inside a city designed around
            you.”
          </p>

          <p>
            <b>00:08</b>
            “No traffic lights. No wasted energy. No fixed
            streets.”
          </p>

          <p className="is-active">
            <b>00:17</b>
            “The city itself becomes an intelligent system.”
          </p>

          <p>
            <b>00:28</b>
            “And that future may be closer than we think.”
          </p>
        </div>
      </section>

      <aside className="xv-script-scenes">
        {[MEDIA.infinity, MEDIA.data, MEDIA.earth].map(
          (image, index) => (
            <article key={image}>
              <MediaImage src={image} />

              <span>
                SCENE {String(index + 1).padStart(2, '0')}
              </span>
            </article>
          ),
        )}
      </aside>
    </div>
  );
}

function StoryboardVisual() {
  const frames = [
    ['01', MEDIA.blackhole, 'Opening', 'Wide reveal'],
    ['02', MEDIA.infinity, 'Discovery', 'Slow orbit'],
    ['03', MEDIA.clouds, 'Conflict', 'Push in'],
    ['04', MEDIA.earth, 'Reveal', 'Crane up'],
    ['05', MEDIA.islands, 'World', 'Aerial'],
    ['06', MEDIA.data, 'Detail', 'Macro'],
  ];

  return (
    <div className="xv-flow-screen">
      <header className="xv-flow-toolbar">
        <span>
          <small>STORYBOARD</small>
          <b>Six connected visual beats</b>
        </span>

        <em>32.7 SEC PREVIEW</em>
      </header>

      <div className="xv-flow-storyboard">
        {frames.map(([number, image, title, camera]) => (
          <article key={number}>
            <div>
              <MediaImage src={image} />
              <span>{number}</span>
            </div>

            <b>{title}</b>
            <small>{camera}</small>
          </article>
        ))}
      </div>
    </div>
  );
}

function GenerateVisual() {
  return (
    <div className="xv-flow-screen">
      <header className="xv-flow-toolbar">
        <span>
          <small>VISUAL GENERATION</small>
          <b>Producing connected scene outputs</b>
        </span>

        <em className="xv-live">
          <i />
          PREVIEW
        </em>
      </header>

      <div className="xv-generation-board">
        <article>
          <div>
            <MediaImage src={MEDIA.blackhole} />
            <span className="xv-ready-icon">
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

        <article>
          <div>
            <MediaImage src={MEDIA.infinity} />
            <span className="xv-ready-icon">
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
            <MediaImage src={MEDIA.earth} />

            <div className="xv-generation-overlay">
              <Sparkles />
              <b>Generating scene</b>
              <strong>72%</strong>
            </div>
          </div>

          <footer>
            <span>
              <small>SCENE 03</small>
              <b>City intelligence</b>
            </span>

            <em>72%</em>
          </footer>

          <i className="xv-progress">
            <span />
          </i>
        </article>

        <article className="is-queued">
          <div>
            <MediaImage src={MEDIA.data} />

            <div className="xv-queue-overlay">
              <span>04</span>
              <b>QUEUED</b>
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

      <footer className="xv-generation-status">
        <span>
          <Sparkles />
          Black Hole V∞
        </span>

        <i />

        <span>Scene continuity</span>

        <i />

        <span>Visual direction</span>

        <i />

        <span>Production output</span>
      </footer>
    </div>
  );
}

function EditVisual() {
  return (
    <div className="xv-flow-screen xv-edit-flow">
      <section className="xv-edit-player">
        <MediaImage src={MEDIA.earth} />

        <button type="button" aria-label="Preview concept">
          <Play />
        </button>

        <footer>
          <small>SCENE 04 · REVEAL</small>
          <b>Future Cities — Master Cut</b>
        </footer>
      </section>

      <section className="xv-edit-timeline">
        <header>
          <span>00:00</span>
          <span>00:10</span>
          <span>00:20</span>
          <span>00:30</span>
        </header>

        <div>
          <b>VIDEO</b>
          <span className="xv-edit-video">
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>

        <div>
          <b>VOICE</b>
          <span className="xv-edit-voice">
            <i />
          </span>
        </div>

        <div>
          <b>MUSIC</b>
          <span className="xv-edit-music">
            <i />
          </span>
        </div>
      </section>

      <section className="xv-edit-scenes">
        {[
          MEDIA.blackhole,
          MEDIA.infinity,
          MEDIA.clouds,
          MEDIA.earth,
        ].map((image, index) => (
          <article key={`${image}-${index}`}>
            <MediaImage src={image} />
            <span>{index + 1}</span>
          </article>
        ))}
      </section>
    </div>
  );
}

function PackageVisual() {
  const items = [
    [MEDIA.infinity, 'THE CITIES OF 2050', 'CONCEPT A'],
    [MEDIA.earth, 'INSIDE THE FUTURE', 'CONCEPT B'],
    [MEDIA.data, 'THIS CHANGES CITIES', 'CONCEPT C'],
  ];

  return (
    <div className="xv-flow-screen">
      <header className="xv-flow-toolbar">
        <span>
          <small>PACKAGING</small>
          <b>Thumbnail and title directions</b>
        </span>

        <em>3 VARIATIONS</em>
      </header>

      <div className="xv-package-board">
        {items.map(([image, title, label]) => (
          <article key={label}>
            <div>
              <MediaImage src={image} />
              <strong>{title}</strong>
            </div>

            <footer>
              <span>{label}</span>
              <b>THUMBNAIL</b>
            </footer>
          </article>
        ))}
      </div>

      <div className="xv-title-board">
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

function PublishVisual() {
  return (
    <div className="xv-flow-screen xv-publish-flow">
      <section className="xv-master-format">
        <div>
          <MediaImage src={MEDIA.infinity} />
        </div>

        <footer>
          <span>
            <small>MASTER</small>
            <b>Main Film</b>
          </span>

          <em>16:9</em>
        </footer>
      </section>

      <ArrowRight className="xv-publish-arrow" />

      <section className="xv-format-outputs">
        {[
          ['Short', '9:16', MEDIA.infinity],
          ['Reel', '9:16', MEDIA.earth],
          ['Feed', '4:5', MEDIA.data],
          ['Square', '1:1', MEDIA.islands],
        ].map(([title, ratio, image]) => (
          <article key={title}>
            <div>
              <MediaImage src={image} />
            </div>

            <footer>
              <b>{title}</b>
              <small>{ratio}</small>
            </footer>
          </article>
        ))}
      </section>

      <footer className="xv-publish-note">
        One production adapted across every format
      </footer>
    </div>
  );
}

function GrowVisual() {
  const variants = [
    [MEDIA.infinity, 'Variant A', '6.8%', '63%'],
    [MEDIA.earth, 'Variant B', '5.1%', '54%'],
    [MEDIA.data, 'Variant C', '4.6%', '49%'],
  ];

  return (
    <div className="xv-flow-screen">
      <header className="xv-flow-toolbar">
        <span>
          <small>GROWTH · DEMO DATA</small>
          <b>Compare creative variants</b>
        </span>

        <em>
          <TrendingUp />
          IMPROVING
        </em>
      </header>

      <div className="xv-grow-board">
        {variants.map(
          ([image, title, ctr, retention], index) => (
            <article
              key={title}
              className={index === 0 ? 'is-best' : ''}
            >
              <div>
                <MediaImage src={image} />

                {index === 0 ? <span>BEST</span> : null}
              </div>

              <b>{title}</b>

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

      <div className="xv-growth-note">
        <BarChart3 />

        <span>
          <b>Preview insight</b>
          The brighter opening visual creates the strongest
          direction in this demo.
        </span>
      </div>
    </div>
  );
}

function WorkflowVisual({ stage }: { stage: number }) {
  switch (stage) {
    case 0:
      return <IdeaVisual />;
    case 1:
      return <ResearchVisual />;
    case 2:
      return <ScriptVisual />;
    case 3:
      return <StoryboardVisual />;
    case 4:
      return <GenerateVisual />;
    case 5:
      return <EditVisual />;
    case 6:
      return <PackageVisual />;
    case 7:
      return <PublishVisual />;
    default:
      return <GrowVisual />;
  }
}

export function VideoLandingPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeCreationTab, setActiveCreationTab] =
    useState<(typeof CREATION_TABS)[number]>('Videos');
  const [activeInputTab, setActiveInputTab] =
    useState<(typeof INPUT_TABS)[number]>('Text to Video');
  const [activeWorkflow, setActiveWorkflow] = useState(4);
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
  const [previewDone, setPreviewDone] = useState(false);

  const visibleTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return TEMPLATES.filter((template) => {
      const categoryMatches =
        activeCreationTab === 'Videos' ||
        template.category === activeCreationTab;

      const searchMatches =
        !query ||
        `${template.title} ${template.meta}`
          .toLowerCase()
          .includes(query);

      return categoryMatches && searchMatches;
    });
  }, [activeCreationTab, searchQuery]);

  const goTo = (id: string) => {
    setMobileNavOpen(false);
    scrollToSection(id);
  };

  const applyTemplate = (template: Template) => {
    setPrompt(template.prompt);
    setActiveInputTab('Text to Video');
    scrollToSection('composer');
  };

  const runPreview = () => {
    if (previewPhase !== null && !previewDone) {
      return;
    }

    setPreviewDone(false);
    setPreviewPhase(0);

    window.setTimeout(() => setPreviewPhase(1), 400);
    window.setTimeout(() => setPreviewPhase(2), 800);
    window.setTimeout(() => setPreviewPhase(3), 1200);
    window.setTimeout(() => setPreviewDone(true), 1650);
  };

  return (
    <main className="xv-page" id="top">
      <div className="xv-shell">
        <aside
          className={`xv-sidebar ${
            mobileNavOpen ? 'is-open' : ''
          }`}
        >
          <div className="xv-brand">
            <Logo href={null} variant="homepage" height={30} />
            <i />
            <strong>Video</strong>
          </div>

          <button
            type="button"
            className="xv-sidebar-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>

          <nav className="xv-side-nav">
            {NAV_ITEMS.map(([Icon, label, id]) => (
              <button
                type="button"
                key={label}
                onClick={() => goTo(id)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="xv-side-group">
            <small>CREATIVE TOOLS</small>

            {TOOL_ITEMS.map(([Icon, label, id]) => (
              <button
                type="button"
                key={label}
                onClick={() => goTo(id)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="xv-side-group">
            <small>SUPPORT</small>

            <button
              type="button"
              onClick={() => goTo('workflow')}
            >
              <HelpCircle />
              <span>How It Works</span>
            </button>

            <Link href="/auth/signup">
              <Sparkles />
              <span>Early Access</span>
            </Link>
          </div>

          <div className="xv-side-workflow">
            <small>HOW XROGA CREATES</small>

            {WORKFLOW.map((item, index) => (
              <button
                type="button"
                key={item.label}
                className={
                  activeWorkflow === index ? 'is-active' : ''
                }
                onClick={() => {
                  setActiveWorkflow(index);
                  goTo('workflow');
                }}
              >
                <span>
                  {String(index + 1).padStart(2, '0')}
                </span>

                <b>{item.label}</b>
              </button>
            ))}
          </div>
        </aside>

        {mobileNavOpen ? (
          <button
            type="button"
            className="xv-backdrop"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
        ) : null}

        <section className="xv-main">
          <header className="xv-topbar">
            <button
              type="button"
              className="xv-menu"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu />
            </button>

            <nav className="xv-top-tabs">
              {CREATION_TABS.map((tab) => (
                <button
                  type="button"
                  key={tab}
                  className={
                    activeCreationTab === tab ? 'is-active' : ''
                  }
                  onClick={() => {
                    setActiveCreationTab(tab);
                    scrollToSection('explore');
                  }}
                >
                  {tab}
                </button>
              ))}
            </nav>

            <div className="xv-top-actions">
              {searchOpen ? (
                <label className="xv-search">
                  <Search />

                  <input
                    autoFocus
                    value={searchQuery}
                    placeholder="Search concepts"
                    onChange={(event) =>
                      setSearchQuery(event.target.value)
                    }
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <X />
                  </button>
                </label>
              ) : (
                <button
                  type="button"
                  className="xv-search-button"
                  onClick={() => {
                    setSearchOpen(true);
                    scrollToSection('explore');
                  }}
                >
                  <Search />
                </button>
              )}

              <span className="xv-soon">COMING SOON</span>

              <Link href="/auth/signup" className="xv-early">
                Join Early Access
                <ArrowRight />
              </Link>
            </div>
          </header>

          <div className="xv-content">
            <section className="xv-hero">
              <Image
                src={MEDIA.blackhole}
                alt="Xroga Video cinematic workspace preview"
                fill
                priority
                quality={72}
                sizes="(max-width: 1000px) 100vw, 1300px"
              />

              <div className="xv-hero-shade" />

              <div className="xv-hero-copy">
                <div className="xv-tags">
                  <span>PRODUCT PREVIEW</span>
                  <span>AI VIDEO WORKSPACE</span>
                </div>

                <h1>
                  One idea.
                  <br />
                  <em>Complete production.</em>
                </h1>

                <p>
                  Research. Script. Storyboard. Generate.
                  Edit. Package. Publish. Grow.
                </p>

                <small>
                  A cinematic AI video creation workspace
                  designed around the complete production,
                  not just one generated clip.
                </small>

                <div className="xv-hero-buttons">
                  <Link href="/auth/signup">
                    Join Early Access
                    <ArrowRight />
                  </Link>

                  <button
                    type="button"
                    onClick={() => goTo('composer')}
                  >
                    Explore Workspace
                    <ChevronRight />
                  </button>
                </div>
              </div>

              <aside className="xv-vinfinity-card">
                <Sparkles />

                <small>BLACK HOLE V∞</small>

                <b>
                  Intelligence across the whole production.
                </b>

                <p>
                  Goal → Story → Scenes → Edit → Release
                </p>
              </aside>
            </section>

            <section className="xv-composer" id="composer">
              <nav>
                {INPUT_TABS.map((tab) => (
                  <button
                    type="button"
                    key={tab}
                    className={
                      activeInputTab === tab ? 'is-active' : ''
                    }
                    onClick={() => setActiveInputTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </nav>

              <div className="xv-composer-layout">
                <div className="xv-prompt">
                  <label htmlFor="xv-video-prompt">
                    What do you want to create?
                  </label>

                  <textarea
                    id="xv-video-prompt"
                    value={prompt}
                    onChange={(event) =>
                      setPrompt(event.target.value)
                    }
                  />

                  <div className="xv-settings">
                    <label>
                      <span>FORMAT</span>
                      <select
                        value={format}
                        onChange={(event) =>
                          setFormat(event.target.value)
                        }
                      >
                        <option>YouTube</option>
                        <option>Short</option>
                        <option>Reel</option>
                        <option>Ad</option>
                        <option>Film</option>
                      </select>
                    </label>

                    <label>
                      <span>DURATION</span>
                      <select
                        value={duration}
                        onChange={(event) =>
                          setDuration(event.target.value)
                        }
                      >
                        <option>Auto</option>
                        <option>30 sec</option>
                        <option>1 min</option>
                        <option>3 min</option>
                        <option>10 min</option>
                      </select>
                    </label>

                    <label>
                      <span>RATIO</span>
                      <select
                        value={ratio}
                        onChange={(event) =>
                          setRatio(event.target.value)
                        }
                      >
                        <option>16:9</option>
                        <option>9:16</option>
                        <option>1:1</option>
                        <option>4:5</option>
                      </select>
                    </label>

                    <label>
                      <span>STYLE</span>
                      <select
                        value={style}
                        onChange={(event) =>
                          setStyle(event.target.value)
                        }
                      >
                        <option>Cinematic</option>
                        <option>Documentary</option>
                        <option>Animated</option>
                        <option>Commercial</option>
                      </select>
                    </label>

                    <label>
                      <span>MODE</span>
                      <select
                        value={mode}
                        onChange={(event) =>
                          setMode(event.target.value)
                        }
                      >
                        <option>Quick</option>
                        <option>Director</option>
                        <option>Growth</option>
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={runPreview}
                      disabled={
                        previewPhase !== null && !previewDone
                      }
                    >
                      {previewPhase !== null && !previewDone
                        ? 'Preparing…'
                        : 'Create Video'}

                      <Sparkles />
                    </button>
                  </div>
                </div>

                <aside className="xv-composer-status">
                  <header>
                    <Sparkles />

                    <span>
                      <b>BLACK HOLE V∞</b>
                      <small>INTERACTIVE PREVIEW</small>
                    </span>
                  </header>

                  {previewPhase === null ? (
                    <p>
                      Preview how Xroga plans a production.
                      No live AI request is sent.
                    </p>
                  ) : (
                    <div className="xv-phase-list">
                      {PHASES.map((phase, index) => (
                        <span
                          key={phase}
                          className={
                            index <= previewPhase
                              ? 'is-active'
                              : ''
                          }
                        >
                          {index < previewPhase || previewDone ? (
                            <Check />
                          ) : (
                            <i />
                          )}

                          {phase}
                        </span>
                      ))}
                    </div>
                  )}

                  {previewDone ? (
                    <Link href="/auth/signup">
                      Join Early Access
                      <ArrowRight />
                    </Link>
                  ) : null}
                </aside>
              </div>
            </section>

            <section className="xv-panel" id="explore">
              <header className="xv-panel-head">
                <div>
                  <small>EXPLORE</small>
                  <h2>What you can create</h2>
                </div>

                <p>
                  Select a visual concept to load its prompt.
                </p>
              </header>

              {visibleTemplates.length ? (
                <div className="xv-template-grid">
                  {visibleTemplates.map((template) => (
                    <button
                      type="button"
                      className="xv-template"
                      key={template.title}
                      onClick={() => applyTemplate(template)}
                    >
                      <div>
                        <Image
                          src={template.image}
                          alt=""
                          fill
                          quality={64}
                          sizes="(max-width: 700px) 78vw, 300px"
                        />
                      </div>

                      <footer>
                        <small>{template.meta}</small>
                        <b>{template.title}</b>

                        <span>
                          Use concept
                          <ArrowRight />
                        </span>
                      </footer>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="xv-empty">
                  No matching concepts.

                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                  >
                    Clear search
                  </button>
                </div>
              )}
            </section>

            <section
              className="xv-panel xv-workflow"
              id="workflow"
            >
              <header className="xv-panel-head">
                <div>
                  <small>WORKFLOW</small>
                  <h2>
                    Watch one production move through Xroga
                  </h2>
                </div>

                <p>
                  Every stage now changes the visual workspace.
                </p>
              </header>

              <nav className="xv-workflow-tabs">
                {WORKFLOW.map((item, index) => (
                  <button
                    type="button"
                    key={item.label}
                    className={
                      activeWorkflow === index ? 'is-active' : ''
                    }
                    onClick={() => setActiveWorkflow(index)}
                  >
                    <span>
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <b>{item.label}</b>
                  </button>
                ))}
              </nav>

              <div className="xv-workflow-layout">
                <aside className="xv-workflow-info">
                  <small>
                    STEP{' '}
                    {String(activeWorkflow + 1).padStart(2, '0')}
                  </small>

                  <h3>{WORKFLOW[activeWorkflow].label}</h3>

                  <p>
                    {WORKFLOW[activeWorkflow].description}
                  </p>

                  <div>
                    {WORKFLOW[activeWorkflow].chips.map(
                      (chip) => (
                        <span key={chip}>{chip}</span>
                      ),
                    )}
                  </div>

                  <section>
                    <Sparkles />

                    <span>
                      <b>Black Hole V∞</b>
                      <small>
                        Creative context remains connected
                      </small>
                    </span>
                  </section>

                  <button
                    type="button"
                    onClick={() =>
                      goTo(
                        WORKFLOW[activeWorkflow].destination,
                      )
                    }
                  >
                    Open related preview
                    <ArrowRight />
                  </button>
                </aside>

                <div className="xv-workflow-visual">
                  <WorkflowVisual stage={activeWorkflow} />
                </div>
              </div>
            </section>

            <section className="xv-panel" id="storyboard">
              <header className="xv-panel-head">
                <div>
                  <small>STORYBOARD</small>
                  <h2>See the film before the final cut</h2>
                </div>

                <p>
                  Shot direction and generated-looking
                  visuals stay connected scene by scene.
                </p>
              </header>

              <div className="xv-main-storyboard">
                {[
                  ['01', MEDIA.blackhole, 'Opening'],
                  ['02', MEDIA.infinity, 'Discovery'],
                  ['03', MEDIA.clouds, 'Conflict'],
                  ['04', MEDIA.earth, 'Reveal'],
                ].map(([number, image, title]) => (
                  <article key={number}>
                    <div>
                      <MediaImage src={image} />
                    </div>

                    <header>
                      <small>SCENE {number}</small>
                      <span>6.2 sec</span>
                    </header>

                    <b>{title}</b>
                    <p>Cinematic visual direction</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="xv-panel" id="editor">
              <header className="xv-panel-head">
                <div>
                  <small>DIRECTOR + EDITOR</small>
                  <h2>Shape the production visually</h2>
                </div>

                <p>
                  Scene control, preview, and timeline in one
                  workspace.
                </p>
              </header>

              <div className="xv-main-editor">
                <div className="xv-main-player">
                  <MediaImage src={MEDIA.earth} />

                  <button type="button" aria-label="Preview">
                    <Play />
                  </button>

                  <footer>
                    <small>SCENE 04</small>
                    <b>Future Cities — Master Cut</b>
                  </footer>
                </div>

                <aside>
                  {[
                    ['Camera', 'Slow orbit'],
                    ['Lighting', 'Blue hour'],
                    ['Voice', 'Narrator A'],
                    ['Style', 'Cinematic'],
                    ['Captions', 'Enabled'],
                    ['Duration', '8.0 sec'],
                  ].map(([key, value]) => (
                    <button type="button" key={key}>
                      <span>{key}</span>
                      <b>{value}</b>
                      <ChevronRight />
                    </button>
                  ))}
                </aside>
              </div>

              <div className="xv-main-timeline">
                <header>
                  <span>00:00</span>
                  <span>00:10</span>
                  <span>00:20</span>
                  <span>00:30</span>
                  <span>00:40</span>
                </header>

                <div>
                  <b>VIDEO</b>

                  <span className="video">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </div>

                <div>
                  <b>VOICE</b>
                  <span className="voice">
                    <i />
                  </span>
                </div>

                <div>
                  <b>MUSIC</b>
                  <span className="music">
                    <i />
                  </span>
                </div>
              </div>
            </section>

            <section className="xv-panel xv-blackhole">
              <div className="xv-orb">
                <span />
                <i />
                <Sparkles />
              </div>

              <div>
                <small>BLACK HOLE V∞</small>

                <h2>
                  One intelligence across the production.
                </h2>

                <p>
                  Understand the goal, plan the production,
                  maintain creative context, and coordinate
                  the entire workflow.
                </p>
              </div>

              <section>
                {[
                  ['UNDERSTAND', 'Goal & direction'],
                  ['PLAN', 'Story & scenes'],
                  ['CONNECT', 'Creative continuity'],
                  ['OPTIMIZE', 'Format & release'],
                ].map(([title, body]) => (
                  <article key={title}>
                    <b>{title}</b>
                    <span>{body}</span>
                  </article>
                ))}
              </section>
            </section>

            <section className="xv-panel" id="package">
              <header className="xv-panel-head">
                <div>
                  <small>FINISH + RELEASE</small>
                  <h2>Create once. Prepare everywhere.</h2>
                </div>

                <p>
                  Packaging, distribution, and performance
                  previews.
                </p>
              </header>

              <div className="xv-release-grid">
                <article>
                  <Package />
                  <small>PACKAGE</small>
                  <b>Thumbnail + titles</b>

                  <div className="xv-release-image">
                    <MediaImage src={MEDIA.infinity} />
                  </div>
                </article>

                <article>
                  <CalendarDays />
                  <small>PUBLISH · PLANNED</small>
                  <b>Multiple formats</b>

                  <div className="xv-format-mini">
                    <span>16:9</span>
                    <span>9:16</span>
                    <span>4:5</span>
                    <span>1:1</span>
                  </div>
                </article>

                <article>
                  <BarChart3 />
                  <small>GROW · DEMO DATA</small>
                  <b>Creative learning</b>

                  <div className="xv-demo-metrics">
                    <span>
                      <small>CTR</small>
                      <b>6.8%</b>
                    </span>

                    <span>
                      <small>RETENTION</small>
                      <b>63%</b>
                    </span>
                  </div>
                </article>
              </div>
            </section>

            <section className="xv-development">
              <div>
                <Sparkles />

                <span>
                  <small>XROGA VIDEO IS IN DEVELOPMENT</small>

                  <h2>
                    An interactive preview of the future
                    workspace.
                  </h2>

                  <p>
                    Live generation is not enabled yet.
                    Visual states demonstrate how Xroga Video
                    is intended to work.
                  </p>
                </span>
              </div>

              <Link href="/auth/signup">
                Join Early Access
                <ArrowRight />
              </Link>
            </section>

            <footer className="xv-footer">
              <span>© 2026 XROGA AI</span>

              <b>One idea. Complete production.</b>

              <div>
                <Link href="/privacy">Privacy</Link>
                <Link href="/terms">Terms</Link>
                <Link href="/contact">Contact</Link>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
