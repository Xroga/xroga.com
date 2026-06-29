'use client';

import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  sidebar: 'w-14 h-14 sm:w-16 sm:h-16',
  sidebarCompact: 'w-12 h-12',
  terminal: 'w-14 h-14 sm:w-16 sm:h-16',
} as const;

interface UserProfileBoxProps {
  url?: string | null;
  initial?: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  onClick?: () => void;
  title?: string;
}

export function UserProfileBox({
  url,
  initial = 'U',
  size = 'sidebar',
  className,
  onClick,
  title,
}: UserProfileBoxProps) {
  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="w-full h-full object-cover object-center" />
  ) : (
    <span className="w-full h-full flex items-center justify-center text-sm sm:text-base font-bold bg-[var(--accent)]/15 text-[var(--foreground)]">
      {initial}
    </span>
  );

  const boxClass = cn(
    'xv-user-profile-box rounded-lg overflow-hidden shrink-0 ring-1 ring-white/12 bg-black/20',
    SIZE_CLASS[size],
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={boxClass} title={title ?? 'Change avatar'}>
        {inner}
      </button>
    );
  }

  return <div className={boxClass}>{inner}</div>;
}
