import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import styles from './response-v2.module.css';
import { statusToneV2, type StatusToneV2 } from './status';

const icons = { success: CheckCircle2, danger: XCircle, warning: Loader2, info: Info } as const;
const names: Record<StatusToneV2, string> = { success: 'Success', danger: 'Problem', warning: 'In progress or needs attention', info: 'Information', neutral: '' };

/** Colour is never the only signal: each tone also has its own icon and the text itself. */
export function StatusBadgeV2({ label, tone }: { label: string; tone?: StatusToneV2 }) {
  const resolved = tone ?? statusToneV2(label);
  if (resolved === 'neutral') return <span className={styles.statusBadge} data-tone="neutral">{label}</span>;
  const Icon = resolved === 'warning' && /\b(?:partial|estimat|hypothet|draft|stale|deprecated|review)/i.test(label) ? AlertTriangle : icons[resolved];
  return <span className={styles.statusBadge} data-tone={resolved} title={names[resolved]}><Icon size={13} aria-hidden="true" />{label}</span>;
}
