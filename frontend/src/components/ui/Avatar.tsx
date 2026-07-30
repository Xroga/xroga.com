import { User } from 'lucide-react';
import { cn } from '@/lib/utils';

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-20 w-20',
} as const;

const iconSizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const;

export function Avatar({
  src,
  name,
  size = 'md',
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border border-[var(--border-subtle)] bg-[var(--surface-inset)]',
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ? `${name}'s avatar` : 'Account avatar'} className="h-full w-full object-cover" />
      ) : (
        <User className={cn('text-[var(--text-muted)]', iconSizeClasses[size])} aria-hidden="true" />
      )}
    </span>
  );
}
