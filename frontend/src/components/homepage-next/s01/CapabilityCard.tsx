/**
 * One physical capability card: a dark titanium front with a smoked-glass demo window, a soft titanium back that
 * carries the engraved deck pattern until the visitor turns the card, and two chassis edges that show its thickness
 * when it rotates. Purely presentational: pose, step and flip state come from the parent.
 *
 * Contract (the same in every mode): "Explore feature" opens the details drawer; the turn button shows the other
 * face. The card body itself is not a control. Only the face being shown is exposed to assistive technology.
 */
import Image from 'next/image';
import { useEffect, useRef } from 'react';
import type { CSSProperties, Ref } from 'react';
import { ArrowRight, RotateCw } from 'lucide-react';
import type { Capability } from './capabilities.data';
import { VIGNETTES } from './Vignettes';
import c from './Card.module.css';

/** `inert` keeps the hidden face out of focus and the accessibility tree. React 18 has no prop for it, so it is
 * set on the element directly. */
const inertRef = (on: boolean) => (el: HTMLElement | null) => {
  if (el) el.inert = on;
};

export interface CapabilityCardProps {
  cap: Capability;
  step: number;
  flipped: boolean;
  expanded: boolean;
  onFlip: () => void;
  onExplore: (trigger: HTMLButtonElement) => void;
  exploreRef?: Ref<HTMLButtonElement>;
  /** reduced motion: the faces swap in place, with no 3D turn */
  flat?: boolean;
}

/** Micro-engraving on the Obsidian Titanium back: an inset machined frame, a dial of fine ticks around the medallion
 * and corner registration marks. Drawn once as static SVG; nothing here repaints while the card turns. */
function DeckPattern() {
  const ticks = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r1 = i % 4 === 0 ? 27.5 : 28.6;
    const r2 = 30.2;
    const f = (n: number) => n.toFixed(2);
    return `M${f(50 + Math.cos(a) * r1)} ${f(73 + Math.sin(a) * r1 * 1)}L${f(50 + Math.cos(a) * r2)} ${f(73 + Math.sin(a) * r2)}`;
  }).join('');
  return (
    <svg className={c.patternSvg} viewBox="0 0 100 146" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <path d="M9 6h82l3 3v128l-3 3H9l-3-3V9z" data-frame />
      <path d="M12.5 9.5h75l2 2v123l-2 2h-75l-2-2v-123z" data-fine />
      <path d={ticks} data-tick />
      <circle cx="50" cy="73" r="33.5" data-fine />
      <path d="M16 17h6M16 17v6M84 17h-6M84 17v6M16 129h6M16 129v-6M84 129h-6M84 129v-6" data-reg />
      <path d="M50 40v-9M50 106v9M17 73h-0M83 73h0" data-fine />
      {Array.from({ length: 7 }, (_, i) => (
        <path key={i} d={`M${34 + i * 5.33} 120v6`} data-slat />
      ))}
    </svg>
  );
}

export function CapabilityCard({ cap, step, flipped, expanded, onFlip, onExplore, exploreRef, flat }: CapabilityCardProps) {
  const Vignette = VIGNETTES[cap.id];
  const titleId = `s01-${cap.id}-title`;
  // turning the card hides the face that holds the button, so focus follows to the turn button on the new face
  const articleRef = useRef<HTMLElement>(null);
  const focusTurn = useRef(false);
  const turn = () => {
    focusTurn.current = articleRef.current?.contains(document.activeElement) ?? false;
    onFlip();
  };
  useEffect(() => {
    if (!focusTurn.current) return;
    focusTurn.current = false;
    const id = requestAnimationFrame(() => {
      articleRef.current?.querySelector<HTMLButtonElement>(`[data-face="${flipped ? 'back' : 'front'}"] [data-turn]`)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [flipped]);
  const stageText = `${cap.demoLabel}, illustrated: ${cap.stages.join(', ')}. Result: ${cap.result}.`;

  return (
    <article
      ref={articleRef}
      className={c.card}
      data-flipped={flipped || undefined}
      data-flat={flat || undefined}
      style={{ '--accent': cap.accent } as CSSProperties}
      aria-labelledby={titleId}
      data-capability={cap.id}
    >
      <div className={c.body}>
        <div className={c.front} data-face="front" aria-hidden={flipped || undefined} ref={inertRef(flipped)}>
          <div className={c.frontInner}>
            <div className={c.top}>
              <span className={c.num}>{cap.number}</span>
              <Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={18} height={18} className={c.mark} />
            </div>
            <div className={c.window}>
              <div className={c.windowHead}>
                <span>{cap.demoLabel}</span>
                <i aria-hidden />
              </div>
              <div className={c.stageArea} role="img" aria-label={stageText}>
                <div aria-hidden>
                  <Vignette step={step} />
                </div>
              </div>
              <ol className={c.stages} aria-hidden>
                {cap.stages.map((label, i) => (
                  <li key={label} data-on={step === i + 1 || undefined} data-done={step > i + 1 || undefined}>
                    {label}
                  </li>
                ))}
              </ol>
            </div>
            <h3 id={titleId} className={c.title}>
              {cap.title}
            </h3>
            <p className={c.benefit}>{cap.benefit}</p>
            <div className={c.actions}>
              <button
                type="button"
                ref={exploreRef}
                className={c.explore}
                aria-haspopup="dialog"
                aria-expanded={expanded}
                aria-label={`Explore feature: ${cap.title}`}
                onClick={(e) => onExplore(e.currentTarget)}
              >
                Explore feature
                <ArrowRight aria-hidden className={c.arrow} />
              </button>
              <button
                type="button"
                className={c.turn}
                aria-label={`Turn the ${cap.title} card to see what it covers`}
                data-turn
                onClick={turn}
              >
                <RotateCw aria-hidden />
              </button>
            </div>
          </div>
          <span className={c.glint} aria-hidden />
        </div>

        <div className={c.back} data-face="back" aria-hidden={!flipped || undefined} ref={inertRef(!flipped)}>
          <div className={c.backInner}>
            <span className={c.spec} aria-hidden />
            <div className={c.pattern} aria-hidden>
              <DeckPattern />
              <span className={c.medal}>
                <span className={c.medalWell}>
                  <Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={96} height={96} className={c.medalMark} />
                </span>
                <span className={c.medalGlint} />
              </span>
              <span className={c.engrave}>XROGA</span>
            </div>
            <div className={c.print}>
              <span className={c.numDark}>{cap.number}</span>
              <h4 className={c.revTitle}>{cap.reverseTitle}</h4>
              <ul className={c.clusters}>
                {cap.clusters.map((text, i) => (
                  <li key={text}>
                    <span aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                    {text}
                  </li>
                ))}
              </ul>
              <div className={c.actions}>
                <button
                  type="button"
                  className={`${c.explore} ${c.exploreDark}`}
                  aria-haspopup="dialog"
                  aria-expanded={expanded}
                  aria-label={`Explore feature: ${cap.title}`}
                  onClick={(e) => onExplore(e.currentTarget)}
                >
                  Explore feature
                  <ArrowRight aria-hidden className={c.arrow} />
                </button>
                <button
                  type="button"
                  className={`${c.turn} ${c.turnDark}`}
                  aria-label={`Turn the ${cap.title} card back to the front`}
                  data-turn
                onClick={turn}
                >
                  <RotateCw aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>
        <span className={`${c.edge} ${c.edgeL}`} aria-hidden />
        <span className={`${c.edge} ${c.edgeR}`} aria-hidden />
      </div>
    </article>
  );
}
