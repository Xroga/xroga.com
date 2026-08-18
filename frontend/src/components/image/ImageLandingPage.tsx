'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ImagePlus,
  Menu,
  Plus,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';

type GalleryItem = {
  src: string;
  title: string;
  category: string;
  ratio: string;
  prompt: string;
  className?: string;
};

const GALLERY: GalleryItem[] = [
  {
    src: '/image-landing/examples/example-01.png',
    title: 'Studio Glow',
    category: 'Portrait',
    ratio: '4:5',
    prompt:
      'Premium cinematic studio portrait, warm amber rim light, cool blue edge light, realistic skin texture, soft falloff, elegant neutral wardrobe, shallow depth of field, editorial photography.',
    className: 'xi-gallery-card--tall',
  },
  {
    src: '/image-landing/examples/example-02.png',
    title: 'Duality',
    category: 'Portrait',
    ratio: '4:5',
    prompt:
      'Cinematic male portrait with dramatic split lighting, warm orange on one side and cool blue on the other, black turtleneck, deep background, sharp eyes, premium editorial photography.',
  },
  {
    src: '/image-landing/examples/example-06.png',
    title: 'Shattered Identity',
    category: 'Concept',
    ratio: '4:5',
    prompt:
      'A cinematic portrait surrounded by floating shattered mirror fragments, each shard reflecting a different angle of the subject, dark studio, subtle red accents, photorealistic, high contrast.',
    className: 'xi-gallery-card--wide',
  },
  {
    src: '/image-landing/examples/example-07.png',
    title: 'The Strategist',
    category: 'Editorial',
    ratio: '4:5',
    prompt:
      'Low-angle editorial fashion portrait through a reflective glass table, subject holding a silver chess piece while black and silver chess pieces float around them, clean gray studio, strategic mood.',
  },
  {
    src: '/image-landing/examples/example-11.png',
    title: 'Crimson Character',
    category: '3D',
    ratio: '1:1',
    prompt:
      'Cinematic low-angle 3D character portrait, refined modern glasses, deep crimson rim lighting, obsidian background, volumetric light, highly detailed facial geometry, premium animated-film realism.',
  },
  {
    src: '/image-landing/examples/example-12.png',
    title: 'Macro Cinema',
    category: 'Photography',
    ratio: '4:5',
    prompt:
      'Ultra-realistic macro close-up portrait with natural skin texture, freckles, soft brown eyes, warm directional light, cinematic depth of field, 100mm macro lens feeling, extremely detailed.',
    className: 'xi-gallery-card--tall',
  },
  {
    src: '/image-landing/examples/example-13.png',
    title: 'Candy Lens',
    category: 'Surreal',
    ratio: '9:16',
    prompt:
      'Playful surreal fisheye photo from inside a glass bowl filled with pink cotton candy and clear ice, bright blue straw, glossy reflections, blue sky, whimsical editorial photography.',
  },
  {
    src: '/image-landing/examples/example-14.png',
    title: 'Expressive 3D',
    category: '3D',
    ratio: '4:5',
    prompt:
      'Minimal 3D avatar portrait on a white background, oversized expressive green eyes, black glasses, playful surprised expression, soft studio illumination, refined stylized character design.',
  },
  {
    src: '/image-landing/examples/example-15.png',
    title: 'Rimlight',
    category: 'Portrait',
    ratio: '9:16',
    prompt:
      'Highly detailed cinematic portrait with powerful backlight forming a bright contour around the silhouette, dramatic shadows, black seamless studio background, subtle haze, glossy eye reflections.',
    className: 'xi-gallery-card--wide',
  },
  {
    src: '/image-landing/examples/example-16.png',
    title: 'Motion Editorial',
    category: 'Fashion',
    ratio: '9:16',
    prompt:
      'Cinematic side-view fashion portrait with strong horizontal motion blur, teal environment, warm highlights, elegant long coat, editorial magazine color grading, photorealistic and soft natural light.',
  },
];

const HERO_CARDS = [
  '/image-landing/examples/example-04.png',
  '/image-landing/examples/example-02.png',
  '/image-landing/examples/example-01.png',
  '/image-landing/examples/example-12.png',
  '/image-landing/examples/example-13.png',
  '/image-landing/examples/example-15.png',
  '/image-landing/examples/example-10.png',
] as const;

const FILTERS = ['Featured', 'Portrait', 'Editorial', '3D', 'Surreal', 'Photography', 'Fashion'] as const;
const SUGGESTIONS = ['Cinematic portrait', 'Editorial', '3D character', 'Surreal', 'Product shot'] as const;

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function ImageLandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Featured');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const visibleGallery = useMemo(() => {
    if (filter === 'Featured') return GALLERY;
    return GALLERY.filter((item) => item.category === filter);
  }, [filter]);

  function applyPrompt(text: string) {
    setPrompt(text);
    window.requestAnimationFrame(() => scrollTo('generator'));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);

    // Landing-page handoff: preserve the prompt and send the visitor into Xroga signup.
    // Replace this URL later with the production image workspace when the generation route is ready.
    const url = `/auth/signup?intent=image&prompt=${encodeURIComponent(prompt.trim())}`;
    window.setTimeout(() => {
      window.location.href = url;
    }, 420);
  }

  return (
    <main className="xi-page">
      <header className="xi-header">
        <div className="xi-header__inner">
          <Logo href="/" variant="homepage" height={28} className="xi-header__logo" />

          <nav className="xi-nav" aria-label="Image navigation">
            <button type="button" onClick={() => scrollTo('generator')}>Generate</button>
            <button type="button" onClick={() => scrollTo('gallery')}>Explore</button>
            <button type="button" onClick={() => scrollTo('studio')}>Styles</button>
            <Link href="/pricing">Pricing</Link>
          </nav>

          <div className="xi-header__actions">
            <Link className="xi-login" href="/auth/login">Log in</Link>
            <Link className="xi-start" href="/auth/signup">Get started <ArrowRight /></Link>
          </div>

          <button
            className="xi-menu-button"
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((value) => !value)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="xi-mobile-menu">
            <button type="button" onClick={() => { setMobileOpen(false); scrollTo('generator'); }}>Generate</button>
            <button type="button" onClick={() => { setMobileOpen(false); scrollTo('gallery'); }}>Explore</button>
            <button type="button" onClick={() => { setMobileOpen(false); scrollTo('studio'); }}>Styles</button>
            <Link href="/pricing">Pricing</Link>
            <Link href="/auth/login">Log in</Link>
            <Link className="xi-mobile-menu__primary" href="/auth/signup">Get started</Link>
          </div>
        ) : null}
      </header>

      <section className="xi-hero" id="generator">
        <div className="xi-hero__aura xi-hero__aura--red" />
        <div className="xi-hero__aura xi-hero__aura--violet" />
        <div className="xi-noise" aria-hidden="true" />

        <div className="xi-hero__floating xi-hero__floating--left" aria-hidden="true">
          <Image src={HERO_CARDS[0]} alt="" fill sizes="160px" priority />
        </div>
        <div className="xi-hero__floating xi-hero__floating--right" aria-hidden="true">
          <Image src={HERO_CARDS[5]} alt="" fill sizes="160px" priority />
        </div>

        <div className="xi-hero__content">
          <div className="xi-eyebrow"><Sparkles /> XROGA IMAGE <span>AI CREATIVE STUDIO</span></div>

          <h1>
            Turn words into
            <span> stunning images.</span>
          </h1>

          <p className="xi-hero__lead">
            Describe a scene in natural language. Xroga turns your idea into cinematic,
            editorial, photorealistic, 3D and surreal visual directions.
          </p>

          <form className="xi-composer" onSubmit={handleSubmit}>
            <div className="xi-composer__glow" aria-hidden="true" />
            <label htmlFor="xroga-image-prompt" className="sr-only">Describe the image you want to create</label>
            <textarea
              id="xroga-image-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the image you want to create…"
              rows={3}
            />

            <div className="xi-composer__bottom">
              <div className="xi-composer__tools">
                <input ref={fileRef} className="xi-file-input" type="file" accept="image/*" />
                <button type="button" className="xi-tool" onClick={() => fileRef.current?.click()} aria-label="Add reference image">
                  <ImagePlus /> <span>Reference</span>
                </button>

                <label className="xi-tool xi-tool--select">
                  <span className="sr-only">Model</span>
                  <select defaultValue="Xroga Image 1">
                    <option>Xroga Image 1</option>
                    <option>Photoreal</option>
                    <option>Creative</option>
                  </select>
                  <ChevronDown />
                </label>

                <label className="xi-tool xi-tool--select xi-hide-small">
                  <span className="sr-only">Style</span>
                  <select defaultValue="Auto style">
                    <option>Auto style</option>
                    <option>Cinematic</option>
                    <option>Editorial</option>
                    <option>3D</option>
                  </select>
                  <ChevronDown />
                </label>

                <label className="xi-tool xi-tool--select">
                  <span className="sr-only">Aspect ratio</span>
                  <select defaultValue="1:1">
                    <option>1:1</option>
                    <option>4:5</option>
                    <option>16:9</option>
                    <option>9:16</option>
                  </select>
                  <ChevronDown />
                </label>
              </div>

              <button className="xi-generate" type="submit" disabled={!prompt.trim() || busy}>
                <WandSparkles />
                <span>{busy ? 'Opening…' : 'Generate'}</span>
                <ArrowRight />
              </button>
            </div>
          </form>

          <div className="xi-suggestions" aria-label="Prompt suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() => setPrompt(
                  suggestion === 'Cinematic portrait'
                    ? 'Cinematic studio portrait, dramatic red and blue rim light, realistic skin texture, editorial photography, shallow depth of field'
                    : `${suggestion}, premium visual direction, high detail, cinematic lighting`
                )}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div className="xi-hero-deck" aria-label="Example generations">
          {HERO_CARDS.slice(1, 6).map((src, index) => (
            <article className={`xi-hero-card xi-hero-card--${index + 1}`} key={src}>
              <Image src={src} alt="Xroga Image example" fill sizes="(max-width: 720px) 40vw, 220px" priority={index < 3} />
            </article>
          ))}
        </div>

        <div className="xi-hero__fade" />
      </section>

      <section className="xi-proof">
        <p>One prompt. A complete visual direction.</p>
        <div>
          <span>PHOTOREAL</span>
          <i />
          <span>EDITORIAL</span>
          <i />
          <span>CINEMATIC</span>
          <i />
          <span>3D</span>
          <i />
          <span>SURREAL</span>
        </div>
      </section>

      <section className="xi-gallery-section" id="gallery">
        <div className="xi-section-heading">
          <div>
            <span className="xi-kicker">PROMPT GALLERY</span>
            <h2>Start with a look.<br />Make it yours.</h2>
          </div>
          <p>
            Explore prompt-driven visual directions inspired by high-end editorial,
            cinematic and character work. Pick one and send it straight into the composer.
          </p>
        </div>

        <div className="xi-filter-row" role="tablist" aria-label="Gallery filters">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={filter === item}
              className={filter === item ? 'is-active' : ''}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="xi-gallery-grid">
          {visibleGallery.map((item) => (
            <article className={`xi-gallery-card ${item.className ?? ''}`} key={item.title}>
              <div className="xi-gallery-card__image">
                <Image src={item.src} alt={item.title} fill sizes="(max-width: 720px) 50vw, 33vw" />
                <div className="xi-gallery-card__shade" />
                <span className="xi-gallery-card__category">{item.category}</span>
                <button type="button" onClick={() => applyPrompt(item.prompt)}>
                  <Plus /> Use prompt
                </button>
              </div>
              <footer>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.prompt}</p>
                </div>
                <span>{item.ratio}</span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="xi-light-break" id="studio">
        <div className="xi-light-break__heading">
          <span className="xi-kicker">ONE IDEA · MANY DIRECTIONS</span>
          <h2>The same prompt can become a campaign, a character, a photograph, or a world.</h2>
          <p>Shift the model, framing, reference, ratio and visual language without rebuilding your idea from zero.</p>
        </div>

        <div className="xi-light-cards">
          {[GALLERY[7], GALLERY[1], GALLERY[6], GALLERY[9]].map((item, index) => (
            <button key={item.title} type="button" onClick={() => applyPrompt(item.prompt)} className={`xi-light-card xi-light-card--${index + 1}`}>
              <Image src={item.src} alt={item.title} fill sizes="(max-width: 720px) 70vw, 260px" />
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="xi-product-section">
        <div className="xi-product-copy">
          <span className="xi-kicker">XROGA IMAGE WORKSPACE</span>
          <h2>Create, refine and remix in one visual studio.</h2>
          <p>
            Move from a rough sentence to a controlled creative direction. Keep the prompt,
            reference, model, style and variations connected instead of jumping between tools.
          </p>

          <div className="xi-product-points">
            <article><span>01</span><div><h3>Generate from language</h3><p>Natural prompts with scene, camera, mood and visual direction.</p></div></article>
            <article><span>02</span><div><h3>Guide with references</h3><p>Add an image to steer composition, identity, color or visual tone.</p></div></article>
            <article><span>03</span><div><h3>Refine the direction</h3><p>Reuse prompts, switch aspect ratios and explore connected variations.</p></div></article>
          </div>

          <button className="xi-text-cta" type="button" onClick={() => scrollTo('generator')}>
            Start creating <ArrowRight />
          </button>
        </div>

        <div className="xi-studio-mockup" aria-label="Xroga Image product preview">
          <div className="xi-studio-mockup__bar">
            <div className="xi-studio-mockup__dots"><i /><i /><i /></div>
            <span>xroga.com/image</span>
            <em>CREATIVE STUDIO</em>
          </div>

          <div className="xi-studio-mockup__body">
            <aside>
              <b><Sparkles /> Xroga Image</b>
              <button className="is-active" type="button">Generate</button>
              <button type="button">History</button>
              <button type="button">Collections</button>
              <span>TOOLS</span>
              <button type="button">Edit image</button>
              <button type="button">Upscale</button>
            </aside>

            <section>
              <div className="xi-studio-prompt">
                <span>Prompt</span>
                <p>Cinematic portrait with strong backlight, warm red accents, realistic skin, luxury editorial photography.</p>
                <div><i>4:5</i><i>Cinematic</i><i>Photoreal</i><button type="button"><WandSparkles /> Generate</button></div>
              </div>

              <div className="xi-studio-grid">
                {[GALLERY[0], GALLERY[1], GALLERY[5], GALLERY[8]].map((item, index) => (
                  <article key={item.title} className={index === 0 ? 'is-selected' : ''}>
                    <Image src={item.src} alt="" fill sizes="220px" />
                    <span>0{index + 1}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="xi-final-cta">
        <div className="xi-final-cta__glow" />
        <span><Sparkles /> XROGA IMAGE</span>
        <h2>Your next image starts<br />with one sentence.</h2>
        <p>Write the idea. Set the direction. Generate the visual.</p>
        <button type="button" onClick={() => scrollTo('generator')}>Create an image <ArrowRight /></button>
      </section>

      <footer className="xi-footer">
        <div className="xi-footer__top">
          <Logo href="/" variant="homepage" height={30} />
          <p>AI creation tools for turning ideas into real visual work.</p>
          <div>
            <Link href="/features">Features</Link>
            <Link href="/video">Video</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/docs">Docs</Link>
          </div>
        </div>
        <div className="xi-footer__bottom">
          <span>© {new Date().getFullYear()} Xroga AI</span>
          <div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        </div>
      </footer>
    </main>
  );
}
