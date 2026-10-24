import React from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, RotateCcw, Send, XCircle, type LucideIcon } from 'lucide-react';
import styles from './XrogaStatusBadge.module.css';

type Tone = 'amber' | 'blue' | 'violet' | 'green' | 'red' | 'gray';
type BadgeSpec = { label: string; tone: Tone; Icon: LucideIcon };

const STATUS: Record<string, BadgeSpec> = {
  pending: { label: 'Pending', tone: 'amber', Icon: AlertTriangle },
  waiting: { label: 'Waiting', tone: 'amber', Icon: Clock3 },
  running: { label: 'In progress', tone: 'blue', Icon: CircleDashed },
  current: { label: 'In progress', tone: 'blue', Icon: CircleDashed },
  submitted: { label: 'Submitted', tone: 'violet', Icon: Send },
  review: { label: 'In review', tone: 'amber', Icon: RotateCcw },
  'in-review': { label: 'In review', tone: 'amber', Icon: RotateCcw },
  completed: { label: 'Success', tone: 'green', Icon: CheckCircle2 },
  confirmed: { label: 'Confirmed', tone: 'green', Icon: CheckCircle2 },
  success: { label: 'Success', tone: 'green', Icon: CheckCircle2 },
  'availability-checked': { label: 'Checked', tone: 'green', Icon: CheckCircle2 },
  failed: { label: 'Failed', tone: 'red', Icon: XCircle },
  blocked: { label: 'Blocked', tone: 'red', Icon: XCircle },
  error: { label: 'Error', tone: 'red', Icon: XCircle },
  unavailable: { label: 'Unavailable', tone: 'red', Icon: XCircle },
  expired: { label: 'Expired', tone: 'gray', Icon: Clock3 },
  'search-result': { label: 'Source result', tone: 'blue', Icon: CircleDashed },
  offer: { label: 'Offer', tone: 'blue', Icon: CircleDashed },
  demo: { label: 'Example', tone: 'violet', Icon: CircleDashed },
};

export function XrogaStatusBadge({ status, label }: { status: string; label?: string }) {
  const spec = STATUS[status] ?? { label: status.replaceAll('-', ' '), tone: 'gray' as const, Icon: Clock3 };
  const Icon = spec.Icon;
  return <span className={`${styles.badge} ${styles[spec.tone]}`}><Icon size={14} className={status === 'running' ? styles.spin : undefined} aria-hidden="true" /><span>{label ?? spec.label}</span></span>;
}
