'use client';

import {
  useEffect,
  useState,
  type CSSProperties,
} from 'react';

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

interface CompanionUsagePopoverProps {
  onClose: () => void;

  onMouseEnter?: () => void;

  onMouseLeave?: () => void;

  style?: CSSProperties;
}

/**
 * Usage, shown when Smoky is hovered or clicked.
 *
 * Every figure here comes from `/api/billing/entitlement`.
 * Nothing is estimated or filled in while loading — a usage
 * number that is wrong is worse than one that is briefly absent,
 * so a null percentage renders as "not available" rather than 0%.
 */
export function CompanionUsagePopover({
  onClose,
  onMouseEnter,
  onMouseLeave,
  style,
}: CompanionUsagePopoverProps) {
  const [data, setData] =
    useState<Entitlement | null>(null);

  const [error, setError] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  /**
   * Load current billing / capacity information.
   */
  useEffect(() => {
    let cancelled = false;

    api.billing
      .entitlement()
      .then((result) => {
        if (!cancelled) {
          setData(
            result as Entitlement,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Escape still provides an immediate keyboard close.
   */
  useEffect(() => {
    const onKey = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener(
      'keydown',
      onKey,
    );

    return () => {
      document.removeEventListener(
        'keydown',
        onKey,
      );
    };
  }, [onClose]);

  return (
    <div
      className="xv-companion-usage"
      role="dialog"
      aria-label="Usage"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="xv-companion-usage__head">
        <p className="xv-companion-usage__title">
          Usage
        </p>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close usage"
        >
          ×
        </button>
      </div>

      {loading && (
        <p className="xv-companion-usage__muted">
          Checking…
        </p>
      )}

      {!loading &&
        error && (
          <p className="xv-companion-usage__muted">
            Usage is unavailable right
            now. The billing service did
            not respond.
          </p>
        )}

      {!loading &&
        !error &&
        data && (
          <>
            <UsageBar
              label="Capacity remaining"
              value={
                data.capacityRemainingPercent
              }
            />

            <UsageBar
              label="Available now"
              value={
                data.availableNowPercent
              }
            />

            <p className="xv-companion-usage__muted">
              Pacing:{' '}
              {data.pacing
                ? data.pacing.replace(
                    /_/g,
                    ' ',
                  )
                : 'not active'}
            </p>
          </>
        )}

      <Link
        href="/dashboard#plan-usage"
        onClick={onClose}
        className="xv-companion-usage__link"
      >
        Full plan &amp; usage
      </Link>
    </div>
  );
}

function UsageBar({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  /**
   * A null percentage is genuinely unknown.
   *
   * Rendering it as an empty bar would read as
   * "you have none left", which would be a different
   * and incorrect claim.
   */
  const known =
    typeof value === 'number' &&
    Number.isFinite(value);

  const clamped = known
    ? Math.max(
        0,
        Math.min(
          100,
          value,
        ),
      )
    : 0;

  return (
    <div className="xv-companion-usage__row">
      <span className="xv-companion-usage__label">
        {label}

        <b>
          {known
            ? `${Math.round(clamped)}%`
            : 'not available'}
        </b>
      </span>

      <span
        className={cn(
          'xv-companion-usage__track',
          !known && 'is-unknown',
        )}
        aria-hidden="true"
      >
        {known && (
          <i
            style={{
              width: `${clamped}%`,
            }}
          />
        )}
      </span>
    </div>
  );
}
