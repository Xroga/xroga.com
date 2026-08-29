'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Entitlement = {
  state: string;
  pacing: string | null;
  capacityRemainingPercent: number | null;
  availableNowPercent: number | null;
  nextUnlockAt: string | null;
};

/**
 * Usage, shown when Smoky is clicked.
 *
 * Smoky was made decorative and `aria-hidden` when the old control panel — voice
 * toggles, a status readout, dictation, a feed control — was removed for being
 * intrusive over a work surface. Bringing back a click means bringing back a button,
 * so the character is focusable and labelled again. What it opens is deliberately one
 * thing rather than that panel: current capacity, and a link to the full page.
 *
 * Every figure here comes from `/api/billing/entitlement`. Nothing is estimated or
 * filled in while loading — a usage number that is wrong is worse than one that is
 * briefly absent, so a null percentage renders as "not available" rather than 0%.
 */
export function CompanionUsagePopover({
  onClose,
  style,
}: {
  onClose: () => void;
  style?: CSSProperties;
}) {
  const [data, setData] = useState<Entitlement | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.billing
      .entitlement()
      .then((result) => {
        if (!cancelled) setData(result as Entitlement);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="xv-companion-usage" role="dialog" aria-label="Usage" style={style}>
      <div className="xv-companion-usage__head">
        <p className="xv-companion-usage__title">Usage</p>
        <button type="button" onClick={onClose} aria-label="Close usage">×</button>
      </div>

      {loading && <p className="xv-companion-usage__muted">Checking…</p>}

      {!loading && error && (
        <p className="xv-companion-usage__muted">
          Usage is unavailable right now. The billing service did not respond.
        </p>
      )}

      {!loading && !error && data && (
        <>
          <UsageBar label="Capacity remaining" value={data.capacityRemainingPercent} />
          <UsageBar label="Available now" value={data.availableNowPercent} />
          <p className="xv-companion-usage__muted">
            Pacing: {data.pacing ? data.pacing.replace(/_/g, ' ') : 'not active'}
          </p>
        </>
      )}

      <Link href="/dashboard#plan-usage" onClick={onClose} className="xv-companion-usage__link">
        Full plan &amp; usage
      </Link>
    </div>
  );
}

function UsageBar({ label, value }: { label: string; value: number | null }) {
  // A null percentage is genuinely unknown. Rendering it as an empty bar would read
  // as "you have none left", which is a different and alarming claim.
  const known = typeof value === 'number' && Number.isFinite(value);
  const clamped = known ? Math.max(0, Math.min(100, value)) : 0;

  return (
    <div className="xv-companion-usage__row">
      <span className="xv-companion-usage__label">
        {label}
        <b>{known ? `${Math.round(clamped)}%` : 'not available'}</b>
      </span>
      <span className={cn('xv-companion-usage__track', !known && 'is-unknown')} aria-hidden="true">
        {known && <i style={{ width: `${clamped}%` }} />}
      </span>
    </div>
  );
}
