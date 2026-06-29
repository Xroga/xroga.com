'use client';

import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  sidebar: 'w-11 h-11 sm:w-12 sm:h-12',
  sidebarCompact: 'w-9 h-9',
  terminal: 'w-8 h-8 sm:w-9 sm:h-9',
  terminalCompact: 'w-7 h-7',
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
