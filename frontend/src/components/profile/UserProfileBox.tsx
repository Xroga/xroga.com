'use client';

import { cn } from '@/lib/utils';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';

const SIZE_CLASS = {
  sidebar: 'w-11 h-11 sm:w-12 sm:h-12',
  sidebarCompact: 'w-8 h-8',
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
  const inner = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url || XROGA_PROFILE_AVATARS[0].url} alt="" className="w-full h-full object-cover object-center" />
  );
  void initial;

  const boxClass = cn(
    'xv-user-profile-box rounded-full overflow-hidden shrink-0 ring-1 ring-[var(--card-border)] bg-black/20',
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
