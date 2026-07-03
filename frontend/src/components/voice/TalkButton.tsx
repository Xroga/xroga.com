'use client';

import { Mic, Loader2, Volume2, Square } from 'lucide-react';
import { usePushToTalk, type TalkState } from '@/hooks/usePushToTalk';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import toast from 'react-hot-toast';

interface TalkButtonProps {
  /** Compact pill for header; large for hero areas */
  variant?: 'header' | 'large';
  className?: string;
}

const STATE_LABEL: Record<TalkState, string> = {
  idle: 'Talk',
  connecting: 'Connecting…',
  recording: 'Listening…',
  processing: 'Thinking…',
  speaking: 'Speaking…',
};

export function TalkButton({ variant = 'header', className }: TalkButtonProps) {
  const router = useRouter();
  const { state, statusLabel, error, toggleTalk, startTalk, stopTalk, clearError } = usePushToTalk();

  useEffect(() => {
    if (error) {
      if (error.includes('Sign in')) {
        toast.error('Sign in to use voice talk');
        router.push('/auth/login');
      } else {
        toast.error(error);
      }
      clearError();
    }
  }, [error, clearError, router]);

  const isActive = state === 'recording';
  const isSearching = statusLabel?.toLowerCase().includes('searching');
  const isBusy = state === 'connecting' || state === 'processing' || state === 'speaking';
  const label = statusLabel ?? STATE_LABEL[state];

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (state === 'idle') void startTalk();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (state === 'recording') stopTalk();
  };

  const handleClick = () => {
    if (variant === 'header') toggleTalk();
  };

  const Icon =
    state === 'speaking' ? Volume2 : isBusy ? Loader2 : isActive ? Square : Mic;

  if (variant === 'large') {
    return (
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={isActive ? stopTalk : undefined}
        className={cn(
          'xv-talk-btn-large select-none touch-none',
          isActive && 'xv-talk-btn-large--active',
          isBusy && 'xv-talk-btn-large--busy',
          className
        )}
        aria-pressed={isActive}
        aria-label={label}
      >
        <span className={cn('xv-talk-btn-large-ring', isActive && 'xv-talk-btn-large-ring--on')} />
        <Icon className={cn('w-8 h-8', isBusy && 'animate-spin')} />
        <span className="text-sm font-semibold tracking-wide">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'xv-talk-btn-header shrink-0',
        isActive && 'xv-talk-btn-header--active',
        isBusy && 'xv-talk-btn-header--busy',
        isSearching && 'xv-talk-btn-header--searching',
        className
      )}
      aria-pressed={isActive || isBusy}
      aria-label={label}
      title="Push to talk with XROGA Voice"
    >
      <Icon className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', isBusy && 'animate-spin')} />
      <span className="hidden sm:inline font-medium">{label}</span>
      <span className="sm:hidden font-medium text-[10px]">{isActive ? 'Stop' : 'Talk'}</span>
    </button>
  );
}
