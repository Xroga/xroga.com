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
