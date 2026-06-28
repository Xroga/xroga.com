'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { getIncognitoAvatarUrl } from '@/lib/incognito';

const SIZE_CLASS = {
  sidebar: 'w-12 h-12 sm:w-14 sm:h-14',
  sidebarCompact: 'w-10 h-10 sm:w-11 sm:h-11',
  terminal: 'w-11 h-11 sm:w-12 sm:h-12',
  modal: 'w-10 h-10',
} as const;

export function IncognitoProfileBox({
  size = 'sidebar',
  className,
}: {
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'xv-incognito-profile-box rounded-lg overflow-hidden shrink-0',
        'ring-1 ring-violet-400/35 shadow-[0_0_12px_rgba(139,92,246,0.2)]',
        'bg-black',
        SIZE_CLASS[size],
        className
      )}
    >
      <Image
        src={getIncognitoAvatarUrl()}
        alt="Incognito"
        width={56}
        height={56}
        unoptimized
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
}
