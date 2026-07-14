import { format, formatDistanceToNow } from 'date-fns';

export function safeDate(value?: string | number | Date | null): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatSafeDistance(
  value?: string | number | Date | null,
  fallback = 'recently'
): string {
  const d = safeDate(value);
  if (!d) return fallback;
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return fallback;
  }
}

/** Compact relative time for dense sidebars: 12m, 6d, 2h */
export function formatCompactAgo(
  value?: string | number | Date | null,
  fallback = ''
): string {
  const d = safeDate(value);
  if (!d) return fallback;
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${Math.max(1, sec)}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 60) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function formatSafeDate(
  value: string | number | Date | null | undefined,
  pattern: string,
  fallback = '—'
): string {
  const d = safeDate(value);
  if (!d) return fallback;
  try {
    return format(d, pattern);
  } catch {
    return fallback;
  }
}
