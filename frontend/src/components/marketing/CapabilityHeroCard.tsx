'use client';

import { useRef } from 'react';
import { GitBranch, ShieldCheck, TerminalSquare } from 'lucide-react';
import { capabilityIdentity } from '@/lib/capabilityPageArt';

/**
 * The hero's floating surface.
 *
 * This is the "3D" the page asked for, built from CSS perspective and pointer
 * tracking rather than WebGL — a real 3D scene means a canvas, a render loop, and a
 * library, which is the wrong trade on a page that shares a site with a homepage
 * that was just measured and cut down to 2 font preloads. `transform-style:
 * preserve-3d` plus a `rotateX/rotateY` tied to the pointer gets the same read —
 * a surface that leans toward you — at effectively zero runtime cost, and degrades
 * to perfectly flat if JS never runs at all.
 *
 * The content is a generic representation of the product loop this page's copy
 * describes — a command line, a check, a branch — not a screenshot or a mockup of
 * any real interface, so it never goes stale against the actual app.
 */
export function CapabilityHeroCard({ slug }: { slug: string }) {
  // Looked up here rather than accepted as a component prop: this is a client
  // component, and its server-component parent cannot pass a function reference
  // (the icon component itself) across that boundary — React has no way to
  // serialize it. Passing the slug and resolving the icon locally sidesteps that
  // entirely, and keeps `capabilityPageArt.ts` as the single source for the mapping.
  const { icon: Icon } = capabilityIdentity(slug);
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card || event.pointerType === 'touch') return;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      card.style.setProperty('--xv-tilt-x', `${(-py * 10).toFixed(2)}deg`);
      card.style.setProperty('--xv-tilt-y', `${(px * 12).toFixed(2)}deg`);
      card.style.setProperty('--xv-glow-x', `${(px + 0.5) * 100}%`);
      card.style.setProperty('--xv-glow-y', `${(py + 0.5) * 100}%`);
    });
  }

  function handlePointerLeave() {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty('--xv-tilt-x', '0deg');
    card.style.setProperty('--xv-tilt-y', '0deg');
  }

  return (
    <div className="xv-cap-hero-stage">
      <div
        ref={cardRef}
        className="xv-cap-hero-card"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <div className="xv-cap-hero-card__glow" aria-hidden="true" />
        <div className="xv-cap-hero-card__layer xv-cap-hero-card__layer--back" aria-hidden="true" />
        <div className="xv-cap-hero-card__layer xv-cap-hero-card__layer--mid" aria-hidden="true" />

        <div className="xv-cap-hero-card__face" aria-hidden="true">
          <div className="xv-cap-hero-card__titlebar">
            <span />
            <span />
            <span />
            <Icon className="ml-auto h-3.5 w-3.5 opacity-70" />
          </div>
          <div className="xv-cap-hero-card__row">
            <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
            <span className="xv-cap-hero-card__line xv-cap-hero-card__line--full" />
          </div>
          <div className="xv-cap-hero-card__row">
            <span className="xv-cap-hero-card__dot xv-cap-hero-card__dot--pending" />
            <span className="xv-cap-hero-card__line xv-cap-hero-card__line--long" />
          </div>
          <div className="xv-cap-hero-card__row">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 xv-cap-hero-card__ok" />
            <span className="xv-cap-hero-card__line xv-cap-hero-card__line--mid" />
          </div>
          <div className="xv-cap-hero-card__row">
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span className="xv-cap-hero-card__line xv-cap-hero-card__line--short" />
          </div>
          <div className="xv-cap-hero-card__footer">
            <span className="xv-cap-hero-card__pill">Build</span>
            <span className="xv-cap-hero-card__pill xv-cap-hero-card__pill--ok">Verified</span>
          </div>
        </div>
      </div>
    </div>
  );
}
