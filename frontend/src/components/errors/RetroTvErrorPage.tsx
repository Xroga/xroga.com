import type { ReactNode } from 'react';
import Link from 'next/link';
import { RetroTvErrorAnimation } from './RetroTvErrorAnimation';

export interface RetroTvErrorPageProps {
  screenText?: string;
  overlayDigits?: [string, string, string];
  hideOverlay?: boolean;
  title?: string;
  description?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function RetroTvErrorPage({
  screenText = 'NOT FOUND',
  overlayDigits = ['4', '0', '4'],
  hideOverlay = false,
  title,
  description,
  actions,
  backHref = '/',
  backLabel = '← Back to XROGA AI',
  className,
}: RetroTvErrorPageProps) {
  return (
    <div className={`xv-retro-tv-page ${className ?? ''}`.trim()}>
      <RetroTvErrorAnimation
        screenText={screenText}
        overlayDigits={overlayDigits}
        hideOverlay={hideOverlay}
      />
      {(title || description || actions) && (
        <div className="xv-retro-tv-page__message">
          {title && <h1 className="xv-retro-tv-page__title">{title}</h1>}
          {description && <p className="xv-retro-tv-page__desc">{description}</p>}
          {actions && <div className="xv-retro-tv-page__actions">{actions}</div>}
        </div>
      )}
      {backHref && !actions && (
        <Link href={backHref} className="xv-retro-tv-page__link">
          {backLabel}
        </Link>
      )}
    </div>
  );
}

export function RetroTvErrorActions({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <>
      <button type="button" onClick={onPrimary} className="xv-retro-tv-page__btn xv-retro-tv-page__btn--primary">
        {primaryLabel}
      </button>
      {secondaryLabel && onSecondary && (
        <button type="button" onClick={onSecondary} className="xv-retro-tv-page__btn xv-retro-tv-page__btn--secondary">
          {secondaryLabel}
        </button>
      )}
    </>
  );
}
