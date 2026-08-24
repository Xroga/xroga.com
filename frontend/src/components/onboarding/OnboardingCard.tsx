'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

export interface OnboardingArtwork {
  src: string;
  alt: string;
  /**
   * Per-image, not a shared centre. These four photographs put their subject in
   * different places, and the card crops hard — a landscape centred on its horizon
   * and a castle centred on its keep survive very different crops.
   */
  position: string;
  /** Mobile lays the image across the top, so the useful crop is a different one. */
  positionMobile?: string;
}

/**
 * The shell every onboarding stage renders into.
 *
 * The artwork is bled to three edges rather than floated inside padding: the card
 * owns the radius and clips the image, so the photograph reaches the card's own
 * corners instead of sitting in a white box with a rounded rectangle inside it.
 */
export function OnboardingCard({
  artwork,
  eyebrow,
  headline,
  description,
  children,
  footer,
  priority = false,
}: {
  artwork: OnboardingArtwork;
  eyebrow?: React.ReactNode;
  headline: string;
  description: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  priority?: boolean;
}) {
  return (
    <div className="xv-onb-card">
      <div className="xv-onb-card__art">
        <Image
          src={artwork.src}
          alt={artwork.alt}
          fill
          sizes="(max-width: 767px) 100vw, 44vw"
          priority={priority}
          className="xv-onb-card__img"
          style={{ objectPosition: 'var(--xv-onb-pos)' }}
        />
        {/* Only enough to keep a light photograph from washing out the card's edge —
            the artwork is the point and is not dimmed to make room for text. */}
        <span className="xv-onb-card__art-edge" aria-hidden="true" />
      </div>

      <div className="xv-onb-card__body">
        {eyebrow ? <div className="xv-onb-card__eyebrow">{eyebrow}</div> : null}
        <h1 className="xv-onb-card__headline">{headline}</h1>
        <p className="xv-onb-card__desc">{description}</p>
        {children ? <div className="xv-onb-card__content">{children}</div> : null}
        {footer ? <div className="xv-onb-card__footer">{footer}</div> : null}
      </div>

      <style jsx>{`
        .xv-onb-card {
          --xv-onb-pos: ${artwork.position};
        }
        @media (max-width: 767px) {
          .xv-onb-card {
            --xv-onb-pos: ${artwork.positionMobile ?? artwork.position};
          }
        }
      `}</style>
    </div>
  );
}

/** A pill that reads as chosen without needing a native radio to say so. */
export function OnboardingChoice({
  selected,
  onSelect,
  icon,
  label,
  size = 'default',
}: {
  selected: boolean;
  onSelect: () => void;
  icon?: React.ReactNode;
  label: string;
  size?: 'default' | 'small';
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      // Radio semantics without a radio: this is a single-choice group, so screen
      // readers get the same contract the pointer does.
      role="radio"
      aria-checked={selected}
      className={cn(
        'xv-onb-choice',
        size === 'small' && 'xv-onb-choice--sm',
        selected && 'is-selected',
      )}
    >
      {icon ? <span className="xv-onb-choice__icon" aria-hidden="true">{icon}</span> : null}
      <span className="xv-onb-choice__label">{label}</span>
    </button>
  );
}
