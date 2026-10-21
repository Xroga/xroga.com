'use client';

/**
 * S03 and S04 environments: authored architecture, lit once and animated by light.
 *
 * The architecture is not drawn with CSS. It is rendered (offline, with a physically based heightfield renderer: GGX
 * titanium, soft shadows, ambient occlusion, a moving area light) and shipped as small self-hosted images under
 * /public/homepage/atelier. At runtime the page only translates and fades one highlight layer along each surface, so
 * the light genuinely travels across real bevels, folds and grooves at compositor cost.
 *
 *  S03 · Optical Intelligence Atelier: a folded, bevelled titanium plane cropped by the left edge of the section and a
 *        lower, more restrained plane on the right. An off-axis light slides slowly down the fold; in Launch & Marketing it
 *        travels the other way. Search's teal and Launch's coffee-brown belong to the product: the material stays neutral.
 *  S04 · Obsidian Release Theater: two curved architectural fins either side of the Release Studio (a bullnose shoulder
 *        and a chamfered return), a seamless dark backdrop and a grounded stage. One studio light visits the left fin,
 *        then the right, while the shell's rim light answers it.
 *
 * Geometry is measured from the live layout (the product's rectangle and the heading's bottom) and written as CSS
 * variables. Nothing is drawn behind the heading or the product. Decorative only: pointer-events none, aria-hidden,
 * paused offscreen, a composed still under reduced motion.
 */
import { useEffect, useRef, useState } from 'react';
import s from './StudioScene.module.css';

const BASE = '/homepage/atelier';

export function StudioScene({ kind }: { kind: 's03' | 's04' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [awake, setAwake] = useState(false);
  const [mode, setMode] = useState<'a' | 'b'>('a');

  useEffect(() => {
    const root = ref.current;
    const sec = root?.parentElement;
    if (!root || !sec) return;
    const measure = () => {
      const base = sec.getBoundingClientRect();
      const inner = sec.querySelector<HTMLElement>(':scope > div:not([aria-hidden="true"])');
      if (!inner) return;
      const header = inner.querySelector<HTMLElement>('header');
      const hb = header ? header.getBoundingClientRect().bottom - base.top : 220;
      // the product is everything after the heading; its bottom is the last visible child, not the section padding
      const body = Array.from(inner.children).filter((c) => c.tagName !== 'HEADER').map((c) => c.getBoundingClientRect()).filter((r) => r.height > 40);
      if (!body.length) return;
      const left = Math.min(...body.map((r) => r.left)) - base.left;
      const right = Math.max(...body.map((r) => r.right)) - base.left;
      const top = Math.min(...body.map((r) => r.top)) - base.top;
      const bottom = Math.max(...body.map((r) => r.bottom)) - base.top;
      const set = (k: string, v: number) => root.style.setProperty(k, `${Math.round(v)}px`);
      set('--cl', left);
      set('--ct', top);
      set('--cw', right - left);
      set('--ch', bottom - top);
      set('--hb', hb);
      set('--sh', base.height);
    };
    const syncMode = () => setMode(kind === 's03' && sec.dataset.view && sec.dataset.view !== 'search' ? 'b' : 'a');
    measure();
    syncMode();
    const ro = new ResizeObserver(measure);
    ro.observe(sec);
    const inner = sec.querySelector(':scope > div:not([aria-hidden="true"])');
    if (inner) ro.observe(inner);
    const mo = new MutationObserver(() => {
      syncMode();
      measure();
    });
    mo.observe(sec, { attributes: true, attributeFilter: ['data-view'] });
    const io = new IntersectionObserver(([e]) => setAwake(e.isIntersecting), { rootMargin: '120px 0px' });
    io.observe(root);
    const settle = window.setTimeout(measure, 900); // the entrance choreography settles after first paint
    return () => {
      window.clearTimeout(settle);
      ro.disconnect();
      mo.disconnect();
      io.disconnect();
    };
  }, [kind]);

  const px = (name: string) => ({ ['--img' as string]: `url(${BASE}/${name})` }) as React.CSSProperties;
  return (
    <div ref={ref} className={`${s.scene} ${kind === 's03' ? s.s03 : s.s04}`} data-kind={kind} data-mode={mode} data-awake={awake || undefined} aria-hidden="true">
      <div className={s.base} />
      {kind === 's03' ? (
        <>
          <div className={s.planeL}>
            <i className={s.img} style={px('s03a-left-base.webp')} />
            <div className={s.clip} style={px('s03a-left-mask.png')}>
              <i className={s.sprite} style={px('s03a-left-light.webp')} />
            </div>
          </div>
          <div className={s.planeR}>
            <i className={s.img} style={px('s03a-right-base.webp')} />
          </div>
        </>
      ) : (
        <>
          <div className={s.finL}>
            <i className={s.img} style={px('s04a-fin-base.webp')} />
            <div className={s.clip} style={px('s04a-fin-mask.png')}>
              <i className={s.sprite} style={px('s04a-fin-light.webp')} />
            </div>
          </div>
          <div className={s.finR}>
            <i className={s.img} style={px('s04a-fin-base.webp')} />
            <div className={s.clip} style={px('s04a-fin-mask.png')}>
              <i className={s.sprite} style={px('s04a-fin-light.webp')} />
            </div>
          </div>
          <div className={s.edge} />
          <div className={s.contact} />
          <div className={s.reflection} />
        </>
      )}
      <div className={s.closure} />
      <div className={s.vignette} />
    </div>
  );
}
