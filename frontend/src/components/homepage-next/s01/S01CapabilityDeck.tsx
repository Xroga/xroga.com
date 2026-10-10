'use client';
/**
 * S01 Capability Deck: "What can Xroga take on?"
 *
 * Three presentations of the same eight cards, chosen from the viewport and motion preference:
 *  - deck      (desktop): a sticky stage whose every pose comes from deckFrame(sectionProgress). Normal document
 *               scroll drives it, so it is reversible, never scroll-jacked, and a jump lands on a complete state.
 *  - carousel  (tablet, phone): one or two readable cards with Previous / Next controls and native swipe.
 *  - static    (reduced motion): every card readable at once in a grid, no 3D turning, no pinned scroll.
 * Spec: docs/homepage-implementation/XROGA_S01_CAPABILITY_DECK_CLAUDE_BRIEF.md
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, History, MessageSquare, MonitorSmartphone, Plug, Route, ShieldCheck } from 'lucide-react';
import { CAPABILITIES, PLATFORM, PLATFORM_TITLE, SECTION, type CapabilityId } from './capabilities.data';
import { CapabilityCard } from './CapabilityCard';
import { CapabilityDetails } from './CapabilityDetails';
import { TRACK_VH, clamp, computeLayout, deckFrame, restProgress, type DeckLayout } from './deckMotion';
import s from './S01.module.css';

type Mode = 'deck' | 'carousel' | 'static';

function useFlips() {
  const [flipped, setFlipped] = useState<Partial<Record<CapabilityId, boolean>>>({});
  const toggle = useCallback((id: CapabilityId) => setFlipped((f) => ({ ...f, [id]: !f[id] })), []);
  return { flipped, toggle };
}

function Heading({ inStage }: { inStage?: boolean }) {
  return (
    <>
      <p className={s.label}>{SECTION.label}</p>
      <h2 id="s01-title" className={s.title}>
        {SECTION.title}
      </h2>
      <p className={s.intro} data-stage={inStage || undefined}>
        {SECTION.intro}
      </p>
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ deck (desktop) */

interface StageProps {
  layout: DeckLayout;
  flipped: Partial<Record<CapabilityId, boolean>>;
  onFlip: (id: CapabilityId) => void;
  onExplore: (id: CapabilityId, trigger: HTMLButtonElement) => void;
  detail: CapabilityId | null;
}

const transformOf = (c: { x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number }) =>
  `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, ${c.z.toFixed(2)}px) rotateX(${c.rx.toFixed(2)}deg) rotateZ(${c.rz.toFixed(2)}deg) rotateY(${(c.ry + 180).toFixed(2)}deg) scale(${c.s.toFixed(4)})`;

function DeckStage({ layout, flipped, onFlip, onExplore, detail }: StageProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLLIElement | null)[]>([]);
  const shadowRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const lightRef = useRef<HTMLDivElement>(null);
  const [steps, setSteps] = useState<number[]>(() => CAPABILITIES.map(() => 0));
  const readableRef = useRef<boolean[]>(CAPABILITIES.map(() => false));
  const [chapter, setChapter] = useState<'A' | 'B'>('A');

  useEffect(() => {
    let raf = 0;
    let lastSteps = '';
    let lastChapter = '';
    const apply = () => {
      raf = 0;
      const track = trackRef.current;
      if (!track) return;
      const r = track.getBoundingClientRect();
      const dist = Math.max(1, r.height - window.innerHeight);
      const f = deckFrame(clamp(-r.top / dist), layout);
      f.cards.forEach((c, i) => {
        const el = slotRefs.current[i];
        if (!el) return;
        // a fully transparent card is parked below the clipped stage (Chrome can still paint zero-opacity faces in a
        // 3D context); offstage and fading cards are inert, so they can never be focused or clicked
        el.style.transform = c.o > 0.001 ? transformOf(c) : `translate3d(0, ${window.innerHeight * 1.5}px, 0)`;
        const off = c.o < 0.5;
        if (el.inert !== off) el.inert = off;
        // opacity on a preserve-3d element would flatten it, so the faces read it from a variable instead
        el.style.setProperty('--o', c.o.toFixed(3));
        el.style.pointerEvents = c.o > 0.5 ? '' : 'none';
        // light follows geometry: the glint slides with the turn and brightens at grazing angles
        const ang = ((c.ry % 360) + 360) % 360;
        const graze = Math.abs(Math.sin((ang * Math.PI) / 180));
        // the specular band rolls across the face with the turn; the edge highlight peaks only around edge-on
        // (roughly 65 to 115 degrees from either face)
        el.style.setProperty('--glint', (0.15 + 0.7 * ((ang % 180) / 180)).toFixed(3));
        el.style.setProperty('--glintO', Math.pow(clamp((graze - 0.82) / 0.18), 1.4).toFixed(3));
        if (c.readable) el.setAttribute('data-readable', '');
        else el.removeAttribute('data-readable');
        readableRef.current[i] = c.readable;
        const sh = shadowRefs.current[i];
        if (sh) {
          const width = Math.max(0.12, Math.abs(Math.cos((c.ry * Math.PI) / 180))) * c.s;
          sh.style.transform = `translate3d(${(c.x + 16 + c.lift * 18).toFixed(1)}px, ${(c.y + layout.H * 0.47 + c.lift * 26).toFixed(1)}px, 0) scale(${width.toFixed(3)}, 1)`;
          // the shadow softens as the card lifts through scale and opacity only (no per-frame blur filter)
          sh.style.opacity = (c.o * (0.7 - c.lift * 0.38)).toFixed(3);
        }
      });
      // two light pools follow the deck: centred on the visible cards and as wide as their spread
      let wsum = 0;
      let cx = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (const c of f.cards) {
        if (c.o <= 0.001) continue;
        wsum += c.o;
        cx += c.x * c.o;
        lo = Math.min(lo, c.x);
        hi = Math.max(hi, c.x);
      }
      if (lightRef.current && wsum > 0) {
        const spread = clamp((hi - lo + layout.W) / (4 * layout.W + 3 * layout.gap), 0.38, 1.05);
        lightRef.current.style.transform = `translate3d(${(cx / wsum).toFixed(1)}px, 0, 0) scale(${spread.toFixed(3)}, ${(0.8 + spread * 0.2).toFixed(3)})`;
      }
      headRef.current?.style.setProperty('--h', f.heading.toFixed(3));
      rowRef.current?.style.setProperty('--mix', f.chapterMix.toFixed(3));
      rowRef.current?.style.setProperty('--show', clamp((f.heading - 0.55) / 0.45).toFixed(3));
      rowRef.current?.style.setProperty('--cp', f.chapterProgress.toFixed(3));
      const key = f.cards.map((c) => c.step).join('');
      if (key !== lastSteps) {
        lastSteps = key;
        setSteps(f.cards.map((c) => c.step));
      }
      if (f.chapter !== lastChapter) {
        lastChapter = f.chapter;
        setChapter(f.chapter);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    // only listen while the stage is near the viewport
    let listening = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !listening) {
          listening = true;
          window.addEventListener('scroll', onScroll, { passive: true });
          onScroll();
        } else if (!e.isIntersecting && listening) {
          listening = false;
          window.removeEventListener('scroll', onScroll);
        }
      },
      { rootMargin: '25% 0px' },
    );
    if (trackRef.current) io.observe(trackRef.current);
    apply();
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [layout]);

  const goToChapter = (ch: 'A' | 'B') => {
    const track = trackRef.current;
    if (!track) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const dist = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: Math.round(top + restProgress(ch) * dist), behavior: 'auto' });
    // once the chapter has come to rest (two frames: scroll, then the stage update), focus its first card
    const first = CAPABILITIES.find((c) => c.chapter === ch)!.id;
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>(`[data-capability="${first}"] [data-face]:not([aria-hidden]) button`)
          ?.focus({ preventScroll: true }),
      ),
    );
  };

  /** Keyboard users reach a card that is still face down: bring its chapter to rest first. */
  const onFocus = (e: FocusEvent<HTMLOListElement>) => {
    const li = (e.target as HTMLElement).closest('li[data-index]') as HTMLElement | null;
    const track = trackRef.current;
    if (!li || !track) return;
    const i = Number(li.dataset.index);
    if (readableRef.current[i]) return;
    const top = track.getBoundingClientRect().top + window.scrollY;
    const dist = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: Math.round(top + restProgress(CAPABILITIES[i].chapter) * dist), behavior: 'auto' });
  };

  /** Hover: a small lift and tilt toward the pointer, with the light following a decayed position. */
  const onMove = (e: ReactPointerEvent<HTMLLIElement>) => {
    const li = e.currentTarget;
    if (!li.hasAttribute('data-readable') || e.pointerType !== 'mouse') return;
    const card = li.querySelector('article') as HTMLElement | null;
    if (!card) return;
    const r = li.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--hl', '-7px');
    card.style.setProperty('--hy', `${((px - 0.5) * 4.4).toFixed(2)}deg`);
    card.style.setProperty('--hx', `${((0.5 - py) * 3.6).toFixed(2)}deg`);
    card.style.setProperty('--s01-lx', `${(px * 100).toFixed(1)}%`);
    card.style.setProperty('--s01-ly', `${(py * 100).toFixed(1)}%`);
    card.style.setProperty('--s01-light', '0.07');
  };
  const onLeave = (e: ReactPointerEvent<HTMLLIElement>) => {
    const card = e.currentTarget.querySelector('article') as HTMLElement | null;
    if (!card) return;
    for (const k of ['--hl', '--hy', '--hx', '--s01-lx', '--s01-ly', '--s01-light']) card.style.removeProperty(k);
  };

  const stageVars = {
    '--cw': `${layout.W}px`,
    '--chh': `${layout.H}px`,
    '--rowY': `${layout.rowY}px`,
    '--nav': `${layout.navInset}px`,
  } as CSSProperties;

  return (
    <div ref={trackRef} className={s.track} style={{ height: `${(1 + TRACK_VH) * 100}vh` }} data-chapter={chapter}>
      <div className={s.stage} style={stageVars}>
        <header ref={headRef} className={s.head}>
          <Heading inStage />
        </header>
        <div ref={lightRef} className={s.lights} aria-hidden>
          <i data-pool="cool" />
          <i data-pool="warm" />
        </div>
        <div className={s.shadows} aria-hidden>
          {CAPABILITIES.map((cap, i) => (
            <span
              key={cap.id}
              ref={(el) => {
                shadowRefs.current[i] = el;
              }}
            />
          ))}
        </div>
        <ol className={s.deck} aria-label="Xroga capabilities" onFocus={onFocus}>
          {CAPABILITIES.map((cap, i) => (
            <li
              key={cap.id}
              ref={(el) => {
                slotRefs.current[i] = el;
              }}
              className={s.slot}
              data-index={i}
              data-chapter={cap.chapter}
              onPointerMove={onMove}
              onPointerLeave={onLeave}
            >
              <CapabilityCard
                cap={cap}
                step={steps[i]}
                flipped={!!flipped[cap.id]}
                expanded={detail === cap.id}
                onFlip={() => onFlip(cap.id)}
                onExplore={(t) => onExplore(cap.id, t)}
              />
            </li>
          ))}
        </ol>
        <div ref={rowRef} className={s.chapterRow}>
          {(['A', 'B'] as const).map((k) => (
            <span key={k} className={s.chapterName} data-ch={k} aria-hidden>
              <b>{SECTION.chapters[k].name}</b>
              <span>{SECTION.chapters[k].range}</span>
            </span>
          ))}
          {/* the chapter meter doubles as keyboard and pointer navigation between the two resting rows; it follows the
              deck in the DOM so that tabbing past card 04 reaches "cards 05 to 08" */}
          <nav className={s.meter} aria-label="Capability chapters">
            {(['A', 'B'] as const).map((k) => (
              <button
                key={k}
                type="button"
                data-ch={k}
                aria-current={chapter === k ? 'true' : undefined}
                aria-label={`Show cards ${SECTION.chapters[k].range}: ${SECTION.chapters[k].name}`}
                onClick={() => goToChapter(k)}
              >
                <i />
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- carousel (tablet, phone) and static */

interface GalleryProps extends Omit<StageProps, 'layout'> {
  mode: 'carousel' | 'static';
}

function Gallery({ mode, flipped, onFlip, onExplore, detail }: GalleryProps) {
  const railRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState<Set<number>>(() => new Set());
  const [entered, setEntered] = useState<Set<number>>(() => new Set());
  const [steps, setSteps] = useState<number[]>(() => CAPABILITIES.map(() => (mode === 'static' ? 4 : 0)));

  // which cards are on screen: they turn face up once, and only they play their short demo
  useEffect(() => {
    if (mode === 'static') return;
    const rail = railRef.current;
    if (!rail) return;
    const io = new IntersectionObserver(
      (entries) => {
        setInView((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (e.isIntersecting && e.intersectionRatio >= 0.6) next.add(i);
            else next.delete(i);
          }
          return next;
        });
      },
      { threshold: [0, 0.6, 1] },
    );
    rail.querySelectorAll('li[data-index]').forEach((li) => io.observe(li));
    return () => io.disconnect();
  }, [mode]);

  useEffect(() => {
    if (mode === 'static') return;
    setEntered((prev) => {
      let changed = false;
      const next = new Set(prev);
      inView.forEach((i) => {
        if (!next.has(i)) {
          next.add(i);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // a card that leaves the screen resets its demo, so it plays again when it returns
    setSteps((prev) => prev.map((st, i) => (inView.has(i) ? st : 0)));
  }, [inView, mode]);

  // the local demo: one step about every 0.85 s for visible cards, ending on the result; nothing runs offscreen
  useEffect(() => {
    if (mode === 'static' || inView.size === 0) return;
    const id = window.setInterval(() => {
      setSteps((prev) => {
        if (prev.every((st, i) => !inView.has(i) || st >= 4)) {
          window.clearInterval(id);
          return prev;
        }
        return prev.map((st, i) => (inView.has(i) ? Math.min(4, st + 1) : st));
      });
    }, 850);
    return () => window.clearInterval(id);
  }, [inView, mode]);

  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    const first = rail.querySelector('li') as HTMLElement | null;
    if (!first) return;
    const pitch = first.offsetWidth + parseFloat(getComputedStyle(rail).columnGap || '0');
    setActive(clamp(Math.round(rail.scrollLeft / pitch), 0, CAPABILITIES.length - 1));
  };

  const go = (dir: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const first = rail.querySelector('li') as HTMLElement | null;
    const pitch = (first?.offsetWidth ?? 320) + parseFloat(getComputedStyle(rail).columnGap || '0');
    const target = clamp(active + dir, 0, CAPABILITIES.length - 1);
    rail.scrollTo({ left: target * pitch, behavior: 'smooth' });
    setActive(target);
  };

  const card = (i: number) => {
    const cap = CAPABILITIES[i];
    return (
      <li key={cap.id} data-index={i} className={s.item} data-entered={mode === 'static' || entered.has(i) || undefined}>
        <div className={s.turnIn}>
          <CapabilityCard
            cap={cap}
            step={steps[i]}
            flipped={!!flipped[cap.id]}
            expanded={detail === cap.id}
            onFlip={() => onFlip(cap.id)}
            onExplore={(t) => onExplore(cap.id, t)}
            flat={mode === 'static'}
          />
        </div>
      </li>
    );
  };

  if (mode === 'static') {
    return (
      <div className={s.flow}>
        <header className={s.headFlow}>
          <Heading />
        </header>
        {(['A', 'B'] as const).map((k) => (
          <div key={k} className={s.group}>
            <p className={s.groupName}>
              <b>{SECTION.chapters[k].name}</b> <span>{SECTION.chapters[k].range}</span>
            </p>
            <ul className={s.grid} aria-label={SECTION.chapters[k].name}>
              {CAPABILITIES.map((c, i) => (c.chapter === k ? card(i) : null))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const activeCap = CAPABILITIES[active];
  return (
    <div className={s.flow}>
      <header className={s.headFlow}>
        <Heading />
      </header>
      <div className={s.railMeta} aria-hidden>
        <span>
          <b>{SECTION.chapters[activeCap.chapter].name}</b>
        </span>
        <span className={s.count}>
          {String(active + 1).padStart(2, '0')} / {String(CAPABILITIES.length).padStart(2, '0')}
        </span>
      </div>
      <ul ref={railRef} className={s.rail} aria-label="Xroga capabilities" onScroll={onRailScroll}>
        {CAPABILITIES.map((_, i) => card(i))}
      </ul>
      <div className={s.controls}>
        <button type="button" onClick={() => go(-1)} disabled={active === 0} aria-label="Previous capability">
          <ArrowLeft aria-hidden />
        </button>
        <span className={s.dots} aria-hidden>
          {CAPABILITIES.map((c, i) => (
            <i key={c.id} data-on={i === active || undefined} />
          ))}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={active === CAPABILITIES.length - 1}
          aria-label="Next capability"
        >
          <ArrowRight aria-hidden />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- continuity strip */

const PLATFORM_ICONS = [MessageSquare, Route, Plug, MonitorSmartphone, ShieldCheck, History];

function PlatformStrip() {
  return (
    <div className={s.platform} aria-labelledby="s01-platform-title">
      <h3 id="s01-platform-title" className={s.platformTitle}>
        {PLATFORM_TITLE}
      </h3>
      <ul className={s.platformList}>
        {PLATFORM.map((item, i) => {
          const Icon = PLATFORM_ICONS[i];
          return (
            <li key={item.title}>
              <Icon aria-hidden className={s.platformIcon} />
              <b>{item.title}</b>
              <span>{item.text}</span>
            </li>
          );
        })}
      </ul>
      <p className={s.note}>{SECTION.note}</p>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ section */

export function S01CapabilityDeck() {
  const reduce = useReducedMotion();
  const [view, setView] = useState<{ mode: Mode; layout: DeckLayout | null }>({ mode: 'deck', layout: null });
  const { flipped, toggle } = useFlips();
  const [detail, setDetail] = useState<CapabilityId | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const L = computeLayout(window.innerWidth, window.innerHeight);
      const mode: Mode = reduce ? 'static' : L.mode;
      setView((v) => {
        const same =
          v.mode === mode && v.layout && v.layout.W === L.W && v.layout.H === L.H && v.layout.vw === L.vw && v.layout.vh === L.vh;
        return same ? v : { mode, layout: L };
      });
    };
    const onResize = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduce]);

  const onExplore = useCallback((id: CapabilityId, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setDetail(id);
  }, []);
  const onClose = useCallback(() => {
    setDetail(null);
    const t = triggerRef.current;
    // return focus to the button that opened the drawer (its face may have changed while it was open)
    requestAnimationFrame(() => {
      if (t && t.isConnected && !t.closest('[inert]')) t.focus({ preventScroll: true });
      else document.querySelector<HTMLButtonElement>(`[data-capability] button[aria-expanded]`)?.blur();
    });
  }, []);

  const shared = useMemo(() => ({ flipped, onFlip: toggle, onExplore, detail }), [flipped, toggle, onExplore, detail]);

  return (
    <section id="capabilities" className={s.section} aria-labelledby="s01-title" data-mode={view.mode}>
      {view.mode === 'deck' && view.layout ? (
        <DeckStage layout={view.layout} {...shared} />
      ) : view.mode === 'deck' ? (
        // first paint before measuring: a static heading so the section never renders empty
        <div className={s.flow}>
          <header className={s.headFlow}>
            <Heading />
          </header>
        </div>
      ) : (
        <Gallery mode={view.mode} {...shared} />
      )}
      <PlatformStrip />
      <CapabilityDetails id={detail} onClose={onClose} onNavigate={setDetail} />
    </section>
  );
}
