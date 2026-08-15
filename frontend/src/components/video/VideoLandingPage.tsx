'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Camera,
  Captions,
  Check,
  ChevronRight,
  Clapperboard,
  Clock3,
  Compass,
  FileText,
  Film,
  Folder,
  HelpCircle,
  Home,
  Image as ImageIcon,
  Layers3,
  LayoutGrid,
  Menu,
  Mic2,
  Music2,
  Package,
  Palette,
  Ratio,
  Scissors,
  Search,
  Shapes,
  Sparkles,
  TrendingUp,
  WandSparkles,
  Workflow,
  X,
} from 'lucide-react';

import { Logo } from '@/components/layout/Logo';

const NAV_ITEMS = [
  [Home, 'Home'],
  [Compass, 'Explore'],
  [Sparkles, 'Create'],
  [Folder, 'Projects'],
  [Workflow, 'Workflows'],
  [LayoutGrid, 'Templates'],
] as const;

const CREATIVE_TOOLS = [
  [Scissors, 'Editor'],
  [ImageIcon, 'Assets'],
  [Shapes, 'Brand Kit'],
] as const;

const GUIDE = [
  ['01', 'Idea', 'Start with what you imagine'],
  ['02', 'Research', 'Understand the subject'],
  ['03', 'Script', 'Build the story'],
  ['04', 'Storyboard', 'Plan every scene'],
  ['05', 'Generate', 'Bring scenes to life'],
  ['06', 'Edit', 'Shape the production'],
  ['07', 'Package', 'Thumbnail, captions & SEO'],
  ['08', 'Publish', 'Prepare every platform'],
  ['09', 'Grow', 'Learn what performs'],
] as const;

const TEMPLATES = [
  {
    title: 'YouTube Documentary',
    duration: '10–30 min',
    tag: '16:9',
    image: '/backgrounds/bg-desktop-2-earth.webp',
  },
  {
    title: 'Short Story',
    duration: '30–90 sec',
    tag: '9:16',
    image: '/backgrounds/xroga-beige-ai-islands-bg.webp',
  },
  {
    title: 'Brand Film',
    duration: '30–120 sec',
    tag: '16:9',
    image: '/backgrounds/xroga-beige-sculpted-data-bg.webp',
  },
  {
    title: 'Animated Story',
    duration: '1–10 min',
    tag: 'STORY',
    image: '/backgrounds/xroga-beige-mars-pyramids-code-bg.webp',
  },
  {
    title: 'Product Campaign',
    duration: '15–60 sec',
    tag: 'AD',
    image: '/backgrounds/xroga-deep-work-bg.webp',
  },
  {
    title: 'Cinematic Film',
    duration: 'Long-form',
    tag: 'FILM',
    image: '/backgrounds/bg-desktop-1-infinity.webp',
  },
] as const;

const IDEAS = [
  {
    title: 'Future Cities',
    label: 'IDEA',
    image: '/backgrounds/bg-desktop-1-infinity.webp',
  },
  {
    title: 'Space Documentary',
    label: 'CONCEPT',
    image: '/backgrounds/bg-desktop-4-blackhole-nebula.webp',
  },
  {
    title: 'Lost Civilizations',
    label: 'TEMPLATE',
    image: '/backgrounds/xroga-beige-mars-pyramids-code-bg.webp',
  },
  {
    title: 'Technology Explained',
    label: 'IDEA',
    image: '/backgrounds/xroga-beige-sculpted-data-bg.webp',
  },
] as const;

const INPUT_MODES = [
  [
    FileText,
    'Text',
    'Video',
    'Describe the outcome and let Xroga structure the production.',
  ],
  [
    ImageIcon,
    'Image',
    'Video',
    'Start from a visual reference and build movement around it.',
  ],
  [
    Clapperboard,
    'Script',
    'Video',
    'Turn an existing script into a scene-by-scene production.',
  ],
  [
    Layers3,
    'Reference',
    'Video',
    'Carry visual direction and continuity across the project.',
  ],
  [
    Film,
    'Existing Video',
    'New Video',
    'Reframe, extend, or repurpose existing footage.',
  ],
  [
    WandSparkles,
    'Brief',
    'Video',
    'Turn a campaign or creative brief into a production plan.',
  ],
] as const;

const WORKFLOW_STEPS = [
  {
    label: 'Idea',
    title: 'Start with the outcome.',
    body:
      'Tell Xroga what you want to create in plain language. Keep the technical decisions invisible.',
  },
  {
    label: 'Research',
    title: 'Build the context.',
    body:
      'The planned workflow gathers topic, audience, angle, and supporting context before production.',
  },
  {
    label: 'Script',
    title: 'Shape the story.',
    body:
      'Create the hook, structure, narration, dialogue, and chapter flow for the selected format.',
  },
  {
    label: 'Storyboard',
    title: 'Plan every scene.',
    body:
      'Break the story into visual beats with shot direction, timing, references, and continuity.',
  },
  {
    label: 'Create',
    title: 'Bring the plan to life.',
    body:
      'Visual production is designed to happen scene by scene while keeping the project connected.',
  },
  {
    label: 'Edit',
    title: 'Assemble the production.',
    body:
      'Refine timing, voice, captions, music, scene order, and pacing inside one editor.',
  },
  {
    label: 'Package',
    title: 'Finish beyond export.',
    body:
      'Prepare thumbnail concepts, titles, descriptions, chapters, and platform-ready presentation.',
  },
  {
    label: 'Publish',
    title: 'Prepare every channel.',
    body:
      'Adapt aspect ratios and organize a publishing calendar around the finished production.',
  },
  {
    label: 'Grow',
    title: 'Learn what works.',
    body:
      'Use performance signals to improve hooks, packaging, repurposing, and future content decisions.',
  },
] as const;

const SCENES = [
  {
    n: '01',
    title: 'Opening',
    duration: '5.4 sec',
    camera: 'Wide reveal',
    image: '/backgrounds/bg-desktop-4-blackhole-nebula.webp',
  },
  {
    n: '02',
    title: 'Discovery',
    duration: '7.1 sec',
    camera: 'Slow orbit',
    image: '/backgrounds/bg-desktop-1-infinity.webp',
  },
  {
    n: '03',
    title: 'Conflict',
    duration: '6.2 sec',
    camera: 'Push in',
    image: '/backgrounds/xroga-black-clouds-bg.webp',
  },
  {
    n: '04',
    title: 'Reveal',
    duration: '8.0 sec',
    camera: 'Crane up',
    image: '/backgrounds/bg-desktop-2-earth.webp',
  },
  {
    n: '05',
    title: 'Resolution',
    duration: '5.8 sec',
    camera: 'Slow pullback',
    image: '/backgrounds/xroga-beige-ai-islands-bg.webp',
  },
] as const;

const PREVIEW_STEPS = [
  'Understanding your idea',
  'Planning production',
  'Structuring scenes',
  'Preparing creative workflow',
] as const;

export function VideoLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeInput, setActiveInput] = useState('Text to Video');
  const [activeWorkflow, setActiveWorkflow] = useState(3);
  const [previewStep, setPreviewStep] = useState<number | null>(null);
  const [previewDone, setPreviewDone] = useState(false);

  function runPreview() {
    if (previewStep !== null && !previewDone) return;

    setPreviewDone(false);
    setPreviewStep(0);

    window.setTimeout(() => setPreviewStep(1), 650);
    window.setTimeout(() => setPreviewStep(2), 1300);
    window.setTimeout(() => setPreviewStep(3), 1950);
    window.setTimeout(() => setPreviewDone(true), 2750);
  }

  return (
    <main className="xv-workspace-page">
      <div className="xv-workspace-shell">
        {/* SIDEBAR */}
        <aside className={`xv-sidebar ${menuOpen ? 'is-open' : ''}`}>
          <div className="xv-brand-row">
            <Logo href={null} variant="homepage" height={30} />
            <i />
            <strong>Video</strong>
          </div>

          <button
            className="xv-sidebar-close"
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>

          <nav className="xv-side-nav" aria-label="Xroga Video workspace">
            {NAV_ITEMS.map(([Icon, label], index) => (
              <button
                type="button"
                className={index === 0 ? 'is-active' : ''}
                key={label}
              >
                <Icon />
                <span>{label}</span>

                {index === 2 ? <small>SOON</small> : null}
              </button>
            ))}
          </nav>

          <div className="xv-side-group">
            <b>CREATIVE TOOLS</b>

            {CREATIVE_TOOLS.map(([Icon, label]) => (
              <button type="button" key={label}>
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="xv-side-group xv-side-support">
            <b>SUPPORT</b>

            <a href="#workflow">
              <HelpCircle />
              <span>How It Works</span>
            </a>

            <Link href="/auth/signup">
              <Sparkles />
              <span>Early Access</span>
            </Link>
          </div>

          <div className="xv-guide">
            <b>HOW XROGA CREATES</b>

            <ol>
              {GUIDE.map(([n, title, body], index) => (
                <li
                  key={title}
                  className={index <= activeWorkflow ? 'is-active' : ''}
                >
                  <span>{n}</span>

                  <div>
                    <strong>{title}</strong>
                    <small>{body}</small>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        {/* MAIN WORKSPACE */}
        <section className="xv-workspace-main">
          {/* TOPBAR */}
          <header className="xv-topbar">
            <button
              type="button"
              className="xv-mobile-menu"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>

            <nav aria-label="Creation formats">
              {[
                'Videos',
                'Shorts',
                'Reels',
                'Ads',
                'Stories',
                'Film',
                'More',
              ].map((item, index) => (
                <button
                  className={index === 0 ? 'is-active' : ''}
                  type="button"
                  key={item}
                >
                  {item}
                </button>
              ))}
            </nav>

            <div className="xv-top-actions">
              <button type="button" aria-label="Search">
                <Search />
              </button>

              <span>COMING SOON</span>

              <Link href="/auth/signup">
                Join Early Access
                <ArrowRight />
              </Link>
            </div>
          </header>

          <div className="xv-content">
            {/* FEATURED CREATION */}
            <section
              className="xv-featured"
              aria-labelledby="xv-featured-title"
            >
              <Image
                src="/backgrounds/bg-desktop-4-blackhole-nebula.webp"
                alt="Cinematic Black Hole V∞ concept art for the Xroga Video workspace"
                fill
                priority
                sizes="(max-width: 900px) 100vw, 1200px"
              />

              <div className="xv-featured-shade" />

              <div className="xv-featured-copy">
                <div className="xv-badges">
                  <span>COMING SOON</span>
                  <span>PRODUCT PREVIEW</span>
                </div>

                <h1 id="xv-featured-title">
                  Turn one idea into
                  <br />
                  <em>a complete production.</em>
                </h1>

                <p>
                  Research. Write. Direct. Generate. Edit. Package. Publish.
                  Grow.
                </p>

                <small>
                  Xroga Video is being designed as an end-to-end AI video
                  creation workspace for creators, brands, and storytellers.
                </small>

                <div className="xv-featured-actions">
                  <Link href="/auth/signup">
                    Join Early Access
                    <ArrowRight />
                  </Link>

                  <a href="#composer">
                    Explore Workspace
                    <ChevronRight />
                  </a>
                </div>
              </div>

              <div className="xv-blackhole-card">
                <Sparkles />

                <b>BLACK HOLE V∞</b>

                <p>The intelligence behind your production.</p>

                <ul>
                  <li>Understands your goal</li>
                  <li>Plans your story</li>
                  <li>Maintains creative context</li>
                  <li>Coordinates the workflow</li>
                </ul>
              </div>
            </section>

            {/* COMPOSER */}
            <section
              className="xv-composer"
              id="composer"
              aria-label="Xroga Video creation preview"
            >
              <div className="xv-composer-tabs">
                {[
                  'Text to Video',
                  'Image to Video',
                  'Reference to Video',
                  'Script to Video',
                ].map((item) => (
                  <button
                    type="button"
                    className={activeInput === item ? 'is-active' : ''}
                    onClick={() => setActiveInput(item)}
                    key={item}
                  >
                    {item}
                  </button>
                ))}
              </div>

              <div className="xv-composer-grid">
                <div className="xv-prompt-area">
                  <label htmlFor="video-prompt">
                    What do you want to create?
                  </label>

                  <textarea
                    id="video-prompt"
                    defaultValue="Create a 12-minute cinematic documentary about cities of the future, with a strong opening hook, atmospheric narration, and chapter structure."
                  />

                  <div className="xv-control-row">
                    <button type="button">
                      <Film />

                      <span>
                        <small>FORMAT</small>
                        YouTube
                      </span>
                    </button>

                    <button type="button">
                      <Clock3 />

                      <span>
                        <small>DURATION</small>
                        Auto
                      </span>
                    </button>

                    <button type="button">
                      <Ratio />

                      <span>
                        <small>RATIO</small>
                        16:9
                      </span>
                    </button>

                    <button type="button">
                      <Palette />

                      <span>
                        <small>STYLE</small>
                        Cinematic
                      </span>
                    </button>

                    <button type="button">
                      <WandSparkles />

                      <span>
                        <small>MODE</small>
                        Director
                      </span>
                    </button>

                    <button
                      type="button"
                      className="xv-create-button"
                      onClick={runPreview}
                    >
                      Create Video
                      <Sparkles />
                    </button>
                  </div>
                </div>

                <aside
                  className={`xv-preview-status ${
                    previewStep !== null ? 'is-running' : ''
                  }`}
                >
                  <div className="xv-preview-brand">
                    <Sparkles />

                    <span>
                      <b>BLACK HOLE V∞</b>
                      <small>UI preview only</small>
                    </span>
                  </div>

                  {previewStep === null ? (
                    <p>
                      Explore how the future creation flow will feel. No AI
                      request is sent from this preview.
                    </p>
                  ) : (
                    <div className="xv-progress-list">
                      {PREVIEW_STEPS.map((item, index) => (
                        <span
                          key={item}
                          className={
                            index <= previewStep ? 'is-active' : ''
                          }
                        >
                          {index < previewStep || previewDone ? (
                            <Check />
                          ) : (
                            <i />
                          )}

                          {item}
                        </span>
                      ))}
                    </div>
                  )}

                  {previewDone ? (
                    <div className="xv-ready">
                      <b>Xroga Video is coming soon.</b>

                      <small>
                        Join early access to create when live generation
                        becomes available.
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

            {/* EXPLORE */}
            <section className="xv-rail-section">
              <div className="xv-section-title">
                <div>
                  <small>EXPLORE</small>
                  <h2>What you can create</h2>
                </div>

                <span>Creation formats, not videos to watch.</span>
              </div>

              <div className="xv-media-rail">
                {TEMPLATES.map((item) => (
                  <article className="xv-media-card" key={item.title}>
                    <div className="xv-media-image">
                      <Image
                        src={item.image}
                        alt={`${item.title} concept preview`}
                        fill
                        sizes="260px"
                      />
                    </div>

                    <span>{item.tag}</span>

                    <div>
                      <b>{item.title}</b>
                      <small>{item.duration}</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* TRENDING IDEAS */}
            <section className="xv-rail-section xv-ideas">
              <div className="xv-section-title">
                <div>
                  <small>DISCOVER</small>
                  <h2>Trending creation ideas</h2>
                </div>

                <span>Concept directions for your next project.</span>
              </div>

              <div className="xv-idea-grid">
                {IDEAS.map((item) => (
                  <article key={item.title}>
                    <Image
                      src={item.image}
                      alt={`${item.title} concept`}
                      fill
                      sizes="(max-width: 800px) 80vw, 300px"
                    />

                    <i />

                    <span>{item.label}</span>

                    <b>{item.title}</b>

                    <small>
                      Open concept
                      <ArrowRight />
                    </small>
                  </article>
                ))}
              </div>
            </section>

            {/* INPUT MODES */}
            <section className="xv-input-modes">
              <div className="xv-section-title">
                <div>
                  <small>INPUTS</small>
                  <h2>Start with what you have</h2>
                </div>

                <span>Different beginnings. One connected production.</span>
              </div>

              <div className="xv-input-grid">
                {INPUT_MODES.map(([Icon, from, to, body]) => (
                  <article key={from}>
                    <Icon />

                    <div>
                      <b>{from}</b>
                      <ArrowRight />
                      <strong>{to}</strong>
                    </div>

                    <p>{body}</p>
                  </article>
                ))}
              </div>
            </section>

            {/* WORKFLOW */}
            <section className="xv-workflow-module" id="workflow">
              <div className="xv-module-header">
                <div>
                  <small>HOW XROGA VIDEO WORKS</small>
                  <h2>One production. One connected journey.</h2>
                </div>

                <span>Interactive product preview</span>
              </div>

              <div className="xv-workflow-tabs">
                {WORKFLOW_STEPS.map((step, index) => (
                  <button
                    type="button"
                    className={
                      activeWorkflow === index ? 'is-active' : ''
                    }
                    onClick={() => setActiveWorkflow(index)}
                    key={step.label}
                  >
                    <span>
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    {step.label}
                  </button>
                ))}
              </div>

              <div className="xv-workflow-preview">
                <div className="xv-workflow-copy">
                  <span>
                    {String(activeWorkflow + 1).padStart(2, '0')}
                  </span>

                  <h3>{WORKFLOW_STEPS[activeWorkflow].title}</h3>

                  <p>{WORKFLOW_STEPS[activeWorkflow].body}</p>

                  <button type="button">
                    Open Preview
                    <ArrowRight />
                  </button>
                </div>

                <div className="xv-workflow-visual">
                  {activeWorkflow === 3 ? (
                    SCENES.slice(0, 4).map((scene) => (
                      <figure key={scene.n}>
                        <Image
                          src={scene.image}
                          alt={`${scene.title} storyboard preview`}
                          fill
                          sizes="180px"
                        />

                        <figcaption>
                          <span>{scene.n}</span>
                          <b>{scene.title}</b>
                          <small>{scene.duration}</small>
                        </figcaption>
                      </figure>
                    ))
                  ) : (
                    <>
                      <i />
                      <i />
                      <i />

                      <div>
                        <Sparkles />
                        <span>
                          {WORKFLOW_STEPS[
                            activeWorkflow
                          ].label.toUpperCase()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* STORYBOARD */}
            <section className="xv-storyboard-module">
              <div className="xv-module-header">
                <div>
                  <small>STORYBOARD</small>
                  <h2>Plan the film before the render.</h2>
                </div>

                <span>CONCEPT PREVIEW</span>
              </div>

              <div className="xv-storyboard-grid">
                {SCENES.map((scene) => (
                  <article key={scene.n}>
                    <div className="xv-scene-image">
                      <Image
                        src={scene.image}
                        alt={`${scene.title} scene concept`}
                        fill
                        sizes="220px"
                      />
                    </div>

                    <header>
                      <span>SCENE {scene.n}</span>
                      <small>{scene.duration}</small>
                    </header>

                    <b>{scene.title}</b>
                    <p>{scene.camera}</p>
                  </article>
                ))}
              </div>
            </section>

            {/* DIRECTOR MODE */}
            <section className="xv-director-module">
              <div className="xv-module-header">
                <div>
                  <small>DIRECTOR MODE</small>
                  <h2>Control the production when you want to.</h2>
                </div>

                <span>PREVIEW ONLY</span>
              </div>

              <div className="xv-director-layout">
                <div className="xv-director-stage">
                  <Image
                    src="/backgrounds/bg-desktop-1-infinity.webp"
                    alt="Director mode cinematic preview"
                    fill
                    sizes="(max-width: 900px) 100vw, 700px"
                  />

                  <div>
                    <span>SCENE 04 · REVEAL</span>
                    <b>A world above the clouds.</b>
                  </div>
                </div>

                <aside className="xv-director-inspector">
                  <b>SCENE INSPECTOR</b>

                  {[
                    ['Camera', 'Slow orbital push'],
                    ['Lighting', 'Blue hour'],
                    ['Character', 'Explorer 01'],
                    ['Voice', 'Narrator A'],
                    ['Style', 'Cinematic'],
                    ['Duration', '8.0 sec'],
                  ].map(([label, value]) => (
                    <label key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <ChevronRight />
                    </label>
                  ))}
                </aside>
              </div>

              <div className="xv-scene-strip">
                {SCENES.map((scene, index) => (
                  <button
                    type="button"
                    className={index === 3 ? 'is-active' : ''}
                    key={scene.n}
                  >
                    <Image
                      src={scene.image}
                      alt=""
                      fill
                      sizes="140px"
                    />

                    <span>{scene.n}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* EDITOR */}
            <section className="xv-editor-module">
              <div className="xv-module-header">
                <div>
                  <small>EDITOR PREVIEW</small>
                  <h2>From scenes to finished cut.</h2>
                </div>

                <span>CONCEPT</span>
              </div>

              <div className="xv-editor-screen">
                <div className="xv-editor-preview">
                  <Image
                    src="/backgrounds/bg-desktop-2-earth.webp"
                    alt="Xroga Video editor preview frame"
                    fill
                    sizes="640px"
                  />

                  <span>00:00:24:08</span>
                </div>

                <div className="xv-editor-tools">
                  <button type="button">
                    <Camera />
                    Video
                  </button>

                  <button type="button">
                    <Mic2 />
                    Voice
                  </button>

                  <button type="button">
                    <Captions />
                    Captions
                  </button>

                  <button type="button">
                    <Music2 />
                    Music
                  </button>
                </div>
              </div>

              <div className="xv-timeline">
                <div className="xv-time-ruler">
                  <span>00:00</span>
                  <span>00:10</span>
                  <span>00:20</span>
                  <span>00:30</span>
                  <span>00:40</span>
                </div>

                <div className="xv-playhead" />

                <div className="xv-track-label">VIDEO</div>
                <div className="xv-track xv-track-video">
                  {SCENES.map((scene) => (
                    <i key={scene.n} />
                  ))}
                </div>

                <div className="xv-track-label">VOICE</div>
                <div className="xv-track xv-track-voice">
                  <i />
                </div>

                <div className="xv-track-label">CAPTIONS</div>
                <div className="xv-track xv-track-captions">
                  <i>In the beginning…</i>
                  <i>we looked beyond.</i>
                  <i>Then the signal changed.</i>
                </div>

                <div className="xv-track-label">MUSIC</div>
                <div className="xv-track xv-track-music">
                  <i />
                </div>
              </div>
            </section>

            {/* BLACK HOLE */}
            <section className="xv-intelligence-module">
              <div className="xv-blackhole-orb">
                <span />
                <i />
                <Sparkles />
              </div>

              <div className="xv-intelligence-copy">
                <small>BLACK HOLE V∞</small>

                <h2>
                  One intelligence across the entire production.
                </h2>

                <p>
                  You should not have to think about models, pipelines, or
                  production infrastructure. Xroga keeps the complexity behind
                  one creative interface.
                </p>
              </div>

              <div className="xv-intelligence-grid">
                {[
                  [
                    'UNDERSTAND',
                    'Interprets the goal, audience, and creative direction.',
                  ],
                  [
                    'PLAN',
                    'Turns the idea into structure, scenes, and assets.',
                  ],
                  [
                    'CONNECT',
                    'Maintains continuity across the production.',
                  ],
                  [
                    'OPTIMIZE',
                    'Prepares content for format, platform, and audience.',
                  ],
                ].map(([title, body]) => (
                  <article key={title}>
                    <span>{title}</span>
                    <p>{body}</p>
                  </article>
                ))}
              </div>
            </section>

            {/* REPURPOSE */}
            <section className="xv-release-module">
              <div className="xv-module-header">
                <div>
                  <small>REPURPOSING</small>
                  <h2>Create once. Adapt everywhere.</h2>
                </div>

                <span>PLANNED WORKFLOW</span>
              </div>

              <div className="xv-release-flow">
                <article className="is-main">
                  <div>
                    <Image
                      src="/backgrounds/bg-desktop-4-blackhole-nebula.webp"
                      alt="Main Xroga Video project concept"
                      fill
                      sizes="430px"
                    />
                  </div>

                  <b>Main Video</b>
                  <span>16:9</span>
                </article>

                <i />

                <div className="xv-release-variants">
                  {[
                    ['YouTube', '16:9'],
                    ['Short', '9:16'],
                    ['Reel', '9:16'],
                    ['Feed', '4:5'],
                    ['LinkedIn', '1:1'],
                    ['Pinterest', '2:3'],
                  ].map(([name, ratio]) => (
                    <article key={name}>
                      <span>{ratio}</span>
                      <b>{name}</b>
                      <small>Adapted cut</small>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* PACKAGE / CALENDAR / GROWTH */}
            <section className="xv-bottom-grid">
              <article className="xv-package-card">
                <header>
                  <Package />

                  <div>
                    <small>PACKAGE YOUR VIDEO</small>
                    <b>Finish beyond export.</b>
                  </div>
                </header>

                <div className="xv-package-layout">
                  <div className="xv-thumbnail">
                    <Image
                      src="/backgrounds/bg-desktop-1-infinity.webp"
                      alt="AI video thumbnail concept"
                      fill
                      sizes="320px"
                    />

                    <span>THUMBNAIL CONCEPT</span>
                  </div>

                  <ol>
                    <li>
                      <span>01</span>
                      The Cities That Will Define 2050
                    </li>

                    <li>
                      <span>02</span>
                      Inside Tomorrow&apos;s Smartest Cities
                    </li>

                    <li>
                      <span>03</span>
                      How Future Cities Are Already Being Built
                    </li>
                  </ol>
                </div>
              </article>

              <article className="xv-calendar-card">
                <header>
                  <CalendarDays />

                  <div>
                    <small>PUBLISHING WORKFLOW · PLANNED</small>
                    <b>From creation to calendar.</b>
                  </div>
                </header>

                <div className="xv-calendar-list">
                  {[
                    ['MON', 'Main Video'],
                    ['TUE', 'Short 01'],
                    ['WED', 'Reel'],
                    ['FRI', 'Short 02'],
                    ['SUN', 'Follow-up'],
                  ].map(([day, item]) => (
                    <div key={day}>
                      <span>{day}</span>
                      <b>{item}</b>
                      <small>Prepared</small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="xv-growth-card">
                <header>
                  <BarChart3 />

                  <div>
                    <small>GROWTH WORKSPACE · DEMO DATA</small>
                    <b>Create. Learn. Improve.</b>
                  </div>
                </header>

                <div className="xv-metrics">
                  {[
                    ['CTR', '6.8%'],
                    ['Retention', '63%'],
                    ['Watch time', '8:42'],
                    ['Engagement', '4.1%'],
                  ].map(([key, value]) => (
                    <span key={key}>
                      <small>{key}</small>
                      <b>{value}</b>
                    </span>
                  ))}
                </div>

                <div className="xv-insight">
                  <TrendingUp />

                  <p>
                    <b>Preview insight</b>
                    Your strongest visual appears earlier in this version.
                    Consider moving the reveal into the opening hook.
                  </p>
                </div>
              </article>
            </section>

            {/* COMING SOON */}
            <section className="xv-development-notice">
              <div>
                <Sparkles />

                <span>
                  <small>XROGA VIDEO IS IN DEVELOPMENT</small>

                  <h2>
                    This workspace is an interactive product preview.
                  </h2>

                  <p>
                    Explore the creation workflow, storyboards, editor
                    concepts, packaging, publishing, and growth tools. Live AI
                    video generation is not available yet.
                  </p>
                </span>
              </div>

              <Link href="/auth/signup">
                Join Early Access
                <ArrowRight />
              </Link>
            </section>

            <footer className="xv-workspace-footer">
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
