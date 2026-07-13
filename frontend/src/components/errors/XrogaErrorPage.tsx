'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Infinity } from 'lucide-react';
import '@/styles/xroga-system-error.css';

export interface XrogaErrorPageProps {
  code?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}

export function XrogaErrorPage({
  code = 'ERR',
  title,
  description,
  actions,
  backHref,
  backLabel = '← Back to XROGA AI',
}: XrogaErrorPageProps) {
  return (
    <div className="xv-system-error">
      <div className="xv-system-error__glow" aria-hidden />
      <div className="xv-system-error__orb" aria-hidden>
        <span className="xv-system-error__ring xv-system-error__ring--outer" />
        <span className="xv-system-error__ring xv-system-error__ring--inner" />
        <span className="xv-system-error__core" />
      </div>

      <div className="xv-system-error__panel">
        <p className="xv-system-error__code font-remixa">{code}</p>
        <p className="xv-system-error__brand font-goga" aria-hidden>
          Black Hole <span className="xv-system-error__v">V</span>
          <Infinity className="inline w-[0.85em] h-[0.85em] -mt-px" strokeWidth={2.5} />
        </p>
        <h1 className="xv-system-error__title font-azurio">{title}</h1>
        <p className="xv-system-error__desc font-goga">{description}</p>
        {actions ? <div className="xv-system-error__actions-wrap">{actions}</div> : null}
        {backHref && !actions ? (
          <Link href={backHref} className="xv-system-error__link font-goga">
            {backLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function XrogaErrorActions({
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
    <div
      className="xv-system-error__actions"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', justifyContent: 'center' }}
    >
      <button type="button" onClick={onPrimary} className="xv-system-error__btn xv-system-error__btn--primary font-goga">
        {primaryLabel}
      </button>
      {secondaryLabel && onSecondary ? (
        <button
          type="button"
          onClick={onSecondary}
          className="xv-system-error__btn xv-system-error__btn--secondary font-goga"
        >
          {secondaryLabel}
        </button>
      ) : null}
    </div>
  );
}
