'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatBarPortalPopover } from '@/components/ui/ChatBarPortalPopover';
import styles from './WorkspaceControls.module.css';

/** One model, with its existing approval boundary unchanged. */
export function BlackHoleVButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div className={cn('relative shrink-0', className)}>
      <ChatBarPortalPopover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={300}>
        <div className={styles.modelPanel} data-testid="black-hole-model-panel">
          <div className={styles.modelHeading}><strong>Black Hole V</strong><span>ACTIVE</span></div>
          <p>Our first and last model — every update ships in this one model. All Xroga AI capabilities, balanced for complex tasks.</p>
          <div className={styles.modelSafety}><ShieldCheck size={16} /><span>Safe tasks can continue automatically</span></div>
          <p>Production, destructive, paid, or irreversible actions remain blocked until the required approval is recorded.</p>
          <div className={styles.modelFoot}><span>Sensitive-action approvals</span><strong>Required</strong></div>
        </div>
      </ChatBarPortalPopover>
      <button ref={btnRef} type="button" onClick={() => setOpen(value => !value)}
        className={cn(styles.modelButton, compact && styles.compactModel)}
        title="Black Hole V" aria-label="Black Hole V model" aria-haspopup="menu" aria-expanded={open}>
        <span className={styles.modelText}>Black Hole V</span>
        <svg className={styles.mobileModelIcon} viewBox="0 0 32 32" aria-hidden="true" data-testid="mobile-model-icon">
          <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <ellipse cx="16" cy="16" rx="14" ry="4.5" transform="rotate(-24 16 16)" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 10a8 8 0 0 1 12 6" fill="none" stroke="currentColor" strokeWidth="3" opacity=".35" />
        </svg>
        <ChevronDown className={styles.chevron} />
      </button>
    </div>
  );
}
