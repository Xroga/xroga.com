'use client';

import { useRef, useState } from 'react';
import { Check, Puzzle, Sparkles, X } from 'lucide-react';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import styles from './ComposerToolChip.module.css';

type Tone = 'blue' | 'orange' | 'red' | 'green' | 'purple' | 'gray';

export function ComposerToolChip({ label, category, description, tone, onRemove }: {
  label: string; category: string; description: string; tone: Tone; onRemove: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const Icon = category === 'Connected plugin' ? Puzzle : category === 'Active skill' ? Sparkles : Check;

  return <span className={styles.chip} data-tone={tone}
    onMouseEnter={() => setDetailsOpen(true)} onMouseLeave={() => setDetailsOpen(false)}>
    <button ref={anchorRef} type="button" className={styles.label} aria-label={'About ' + label}
      aria-expanded={detailsOpen} onFocus={() => setDetailsOpen(true)}
      onBlur={() => setDetailsOpen(false)} onClick={() => setDetailsOpen(open => !open)}>
      <Icon size={13} aria-hidden="true" /><strong>{label}</strong>
    </button>
    <button type="button" className={styles.remove} aria-label={'Remove ' + label + ' selection'}
      onClick={onRemove}><X size={13} aria-hidden="true" /></button>
    <AnchoredPortalPopover open={detailsOpen} onClose={() => setDetailsOpen(false)}
      anchorRef={anchorRef} placement="top-start" width={260} ariaLabel={label + ' details'} className={styles.detail}>
      <div className={styles.detailHead}><Icon size={18} aria-hidden="true" /><strong>{label}</strong></div>
      <p>{description}</p>
      <span className={styles.category}>{category}</span>
      <span className={styles.help}>Selected for this draft · execution starts only when you send</span>
    </AnchoredPortalPopover>
  </span>;
}
