import { cn } from '@/lib/utils';

export function Progress({
  value,
  label,
  tone = 'accent',
  className,
}: {
  /** 0–100 */
  value: number;
  label?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fillVar =
    tone === 'success'
      ? 'var(--success)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'danger'
          ? 'var(--danger)'
          : 'var(--accent)';

  return (
    <div className={cn('w-full', className)}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-inset)]"
      >
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%`, backgroundColor: fillVar }}
        />
      </div>
    </div>
  );
}
