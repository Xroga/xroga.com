'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatBarPortalPopover } from '@/components/ui/ChatBarPortalPopover';
import styles from './WorkspaceControls.module.css';
import { ModelAppPermissions } from './ModelAppPermissions';
import { BlackHoleMark } from './BlackHoleMark';
import { api } from '@/lib/api';

/** One model, with its existing approval boundary unchanged. */
export function BlackHoleVButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<{ capacityRemainingPercent: number | null; availableNowPercent: number | null } | null>(null);
  const [usageError, setUsageError] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUsage(null);
    setUsageError(false);
    void api.billing.entitlement().then(result => {
      if (!cancelled) setUsage(result);
    }).catch(() => { if (!cancelled) setUsageError(true); });
    return () => { cancelled = true; };
  }, [open]);
  return (
    <div className={cn('relative shrink-0', className)}>
      <ChatBarPortalPopover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={250}>
        <div className={styles.modelPanel} data-testid="black-hole-model-panel">
          <div className={styles.modelHeading}><strong>Xroga · Black Hole</strong><span>Auto</span></div>
          <p>Super Intelligence for your work. Describe what you need; Xroga chooses the available capabilities automatically.</p>
          <div className={styles.modelSafety}><ShieldCheck size={14} /><span>Sensitive actions require approval.</span></div>
          <div className={styles.usageMeters} aria-live="polite">
            {usageError ? <span>Usage is unavailable right now.</span> : ([
              ['Capacity remaining', usage?.capacityRemainingPercent],
              ['Available now', usage?.availableNowPercent],
            ] as const).map(([label, value]) => <div className={styles.usageMeter} key={label}>
              <div><span>{label}</span><strong>{usage ? value == null ? 'Unavailable' : `${Math.round(value)}%` : 'Checking…'}</strong></div>
              <div className={styles.usageTrack} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value == null ? undefined : Math.round(value)}>
                <span className={usage ? undefined : styles.usageLoading} style={usage ? { width: `${Math.max(0, Math.min(100, value ?? 0))}%` } : undefined} />
              </div>
            </div>)}
          </div>
          <a href="/dashboard#plan-usage" className={styles.modelSafety}>View plan and usage</a>
          {open ? <ModelAppPermissions /> : null}
        </div>
      </ChatBarPortalPopover>
      <button ref={btnRef} type="button" onClick={() => setOpen(value => !value)}
        className={cn(styles.modelButton, compact && styles.compactModel)}
        aria-label="Black Hole model and usage" aria-haspopup="menu" aria-expanded={open}>
        <BlackHoleMark active={open} />


      </button>
    </div>
  );
}
