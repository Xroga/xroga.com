'use client';

import { useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatBarPortalPopover } from '@/components/ui/ChatBarPortalPopover';
import styles from './WorkspaceControls.module.css';
import { ModelAppPermissions } from './ModelAppPermissions';

/** One model, with its existing approval boundary unchanged. */
export function BlackHoleVButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div className={cn('relative shrink-0', className)}>
      <ChatBarPortalPopover open={open} onClose={() => setOpen(false)} anchorRef={btnRef} width={250}>
        <div className={styles.modelPanel} data-testid="black-hole-model-panel">
          <div className={styles.modelHeading}><strong>Auto</strong><span>ON</span></div>
          <p>No manual model selection needed. Xroga automatically routes your request through available capabilities.</p>
          <div className={styles.modelSafety}><ShieldCheck size={14} /><span>Sensitive actions require approval.</span></div>
          {open ? <ModelAppPermissions /> : null}
        </div>
      </ChatBarPortalPopover>
      <button ref={btnRef} type="button" onClick={() => setOpen(value => !value)}
        className={cn(styles.modelButton, compact && styles.compactModel)}
        aria-label="Automatic model and tool routing" aria-haspopup="menu" aria-expanded={open}>
        <span className={styles.modelText}>Black Hole V∞</span>


      </button>
    </div>
  );
}
