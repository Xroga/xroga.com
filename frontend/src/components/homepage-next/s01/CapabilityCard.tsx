/**
 * One physical capability card: a dark titanium front with a smoked-glass demo window, the Obsidian Titanium back
 * that faces up in the deck, and two chassis edges that show its thickness when it turns. Presentational: pose and
 * demo step come from the parent.
 *
 * Contract (the same in every mode): "Explore feature" lifts this card out, turns it over and shows its full
 * capabilities on the reverse (CapabilityFocus). "Replay" restarts this card's demo from the beginning. The card body
 * itself is not a control. The back face is decoration only and is never exposed to assistive technology.
 */
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { Capability } from './capabilities.data';
import { VIGNETTES } from './Vignettes';
import c from './Card.module.css';

export interface CapabilityCardProps {
  cap: Capability;
  step: number;
  expanded: boolean;
  onExplore: (trigger: HTMLButtonElement) => void;
  /** restart the demo; omitted where a replay makes no sense (reduced motion, the focus card) */
  onReplay?: () => void;
  /** reduced motion: no 3D, the front only */
  flat?: boolean;
  /** a passive copy (the front face of the focus card): no controls in the tab order */
  passive?: boolean;
}

/** Micro-engraving on the Obsidian Titanium back: an inset machined frame, a dial of fine ticks around the medallion
 * and corner registration marks. Drawn once as static SVG; nothing here repaints while the card turns. */
export function DeckPattern({ className }: { className?: string }) {
  const ticks = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r1 = i % 4 === 0 ? 27.5 : 28.6;
    const r2 = 30.2;
    const f = (n: number) => n.toFixed(2);
    return `M${f(50 + Math.cos(a) * r1)} ${f(73 + Math.sin(a) * r1)}L${f(50 + Math.cos(a) * r2)} ${f(73 + Math.sin(a) * r2)}`;
  }).join('');
  return (
    <svg className={className ?? c.patternSvg} viewBox="0 0 100 146" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <path d="M9 6h82l3 3v128l-3 3H9l-3-3V9z" data-frame />
      <path d="M12.5 9.5h75l2 2v123l-2 2h-75l-2-2v-123z" data-fine />
      <path d={ticks} data-tick />
      <circle cx="50" cy="73" r="33.5" data-fine />
      <path d="M16 17h6M16 17v6M84 17h-6M84 17v6M16 129h6M16 129v-6M84 129h-6M84 129v-6" data-reg />
      <path d="M50 40v-9M50 106v9" data-fine />
      {Array.from({ length: 7 }, (_, i) => (
        <path key={i} d={`M${34 + i * 5.33} 120v6`} data-slat />
      ))}
    </svg>
  );
}

export function CapabilityCard({ cap, step, expanded, onExplore, onReplay, flat, passive }: CapabilityCardProps) {
  const Vignette = VIGNETTES[cap.id];
  const titleId = `s01-${cap.id}-title${passive ? '-focus' : ''}`;
  const stageText = `${cap.demoLabel}, illustrated: ${cap.stages.join(', ')}. Result: ${cap.result}.`;

  return (
    <article
      className={c.card}
      data-flat={flat || undefined}
      style={{ '--accent': cap.accent } as CSSProperties}
      aria-labelledby={passive ? undefined : titleId}
      aria-hidden={passive || undefined}
      data-capability={passive ? undefined : cap.id}
    >
      <div className={c.body}>
        <div className={c.front} data-face="front">
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
                className={c.explore}
                aria-haspopup="dialog"
                aria-expanded={expanded}
                aria-label={`Explore feature: ${cap.title}`}
                tabIndex={passive ? -1 : undefined}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onExplore(e.currentTarget);
                }}
              >
                Explore feature
                <ArrowRight aria-hidden className={c.arrow} />
              </button>
              {onReplay && !passive && (
                <button
                  type="button"
                  className={c.replay}
                  aria-label={`Replay the ${cap.title} demo`}
                  title="Replay demo"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplay();
                  }}
                >
                  <RotateCcw aria-hidden />
                </button>
              )}
            </div>
          </div>
          <span className={c.glint} aria-hidden />
          <span className={c.tracer} aria-hidden />
        </div>

        <div className={c.back} data-face="back" aria-hidden>
          <div className={c.backInner}>
            <span className={c.spec} />
            <div className={c.pattern}>
              <DeckPattern />
              <span className={c.medal}>
                <span className={c.medalWell}>
                  <Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={96} height={96} className={c.medalMark} />
                </span>
                <span className={c.medalGlint} />
              </span>
              <span className={c.engrave}>XROGA</span>
            </div>
          </div>
        </div>
        <span className={`${c.edge} ${c.edgeL}`} aria-hidden />
        <span className={`${c.edge} ${c.edgeR}`} aria-hidden />
      </div>
    </article>
  );
}
