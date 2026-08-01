'use client';

import { useRef } from 'react';
import { PixelGlyph } from '@/components/crypto-builder/PixelArt';
import { capabilityIdentity } from '@/lib/capabilityPageArt';

/**
 * The hero's console block.
 *
 * A terminal rendered as a Minecraft panel: hard edges, a two-pixel bevel lit from
 * the top-left, and a stack of blocks behind it for depth. The tilt is CSS
 * perspective driven by pointer position — a real 3D scene means a canvas, a render
 * loop and a library, which is the wrong trade on a site that was just measured down
 * to two font preloads. `preserve-3d` plus pointer-tracked `rotateX/rotateY` gets the
 * same read for effectively nothing, and lies perfectly flat if JS never runs.
 *
 * The content is a generic build → verify → ship transcript matching the copy on
 * these pages, drawn from pixel glyphs. It is not a screenshot of any real interface,
 * so it cannot go stale against the actual product.
 */
export function CapabilityHeroCard({ slug }: { slug: string }) {
  // Resolved here rather than accepted as a prop: this is a client component, and its
  // server-component parent cannot pass a component reference across that boundary —
  // React has no way to serialize it. Passing the slug sidesteps that entirely.
  const { glyph } = capabilityIdentity(slug);
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
      card.style.setProperty('--xv-tilt-x', `${(-py * 9).toFixed(2)}deg`);
      card.style.setProperty('--xv-tilt-y', `${(px * 11).toFixed(2)}deg`);
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
        className="xv-cap-console"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <span className="xv-cap-console__shadow" aria-hidden="true" />
        <span className="xv-cap-console__stack xv-cap-console__stack--back" aria-hidden="true" />
        <span className="xv-cap-console__stack xv-cap-console__stack--mid" aria-hidden="true" />

        <div className="xv-cap-console__face" aria-hidden="true">
          <div className="xv-cap-console__bar">
            <span className="xv-cap-console__title">
              &gt;_ xroga@build
            </span>
            <PixelGlyph name={glyph} size={12} className="xv-cap-console__badge" />
          </div>

          <div className="xv-cap-console__body">
            <p className="xv-cap-console__line">
              <span className="xv-cap-console__prompt">$</span>
              <span className="xv-cap-console__bar-fill xv-cap-console__bar-fill--lg" />
            </p>
            <p className="xv-cap-console__line">
              <PixelGlyph name="pick" size={10} className="xv-cap-console__mark" />
              <span className="xv-cap-console__bar-fill xv-cap-console__bar-fill--md" />
            </p>
            <p className="xv-cap-console__line">
              <PixelGlyph name="shield" size={10} className="xv-cap-console__mark xv-cap-console__mark--ok" />
              <span className="xv-cap-console__bar-fill xv-cap-console__bar-fill--sm" />
            </p>
            <p className="xv-cap-console__line">
              <PixelGlyph name="branch" size={10} className="xv-cap-console__mark" />
              <span className="xv-cap-console__bar-fill xv-cap-console__bar-fill--xs" />
              <span className="xv-cap-console__caret" />
            </p>
          </div>

          <div className="xv-cap-console__footer">
            <span className="xv-cap-chip">BUILD</span>
            <span className="xv-cap-chip xv-cap-chip--ok">VERIFIED</span>
          </div>
        </div>
      </div>
    </div>
  );
}
