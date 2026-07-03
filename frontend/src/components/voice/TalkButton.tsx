'use client';

import { Mic } from 'lucide-react';
import { useVoiceTalk } from '@/context/VoiceTalkContext';
import { openVoiceTalkSession } from '@/components/voice/VoiceTalkOverlay';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface TalkButtonProps {
  variant?: 'header' | 'large';
  className?: string;
}

export function TalkButton({ variant = 'header', className }: TalkButtonProps) {
  const router = useRouter();
  const { openOverlay, overlayOpen, state } = useVoiceTalk();

  const handleClick = () => {
    void openVoiceTalkSession(
      openOverlay,
      () => router.push('/auth/login')
    );
  };

  const isLive = overlayOpen && state !== 'idle';

  if (variant === 'large') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'xv-talk-btn-large select-none',
          isLive && 'xv-talk-btn-large--active',
          className
        )}
        aria-label="Open XROGA Voice"
      >
        <Mic className="w-8 h-8" />
        <span className="text-sm font-semibold tracking-wide">Talk</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'xv-talk-btn-header shrink-0',
        (overlayOpen || isLive) && 'xv-talk-btn-header--active',
        className
      )}
      aria-label="Open XROGA Voice"
      title="Talk with XROGA Voice"
    >
      <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      <span className="hidden sm:inline font-medium">Talk</span>
      <span className="sm:hidden font-medium text-[10px]">Talk</span>
    </button>
  );
}
