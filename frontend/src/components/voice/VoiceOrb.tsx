'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { TalkState } from '@/context/VoiceTalkContext';
import { XROGA_LOGO } from '@/context/VoiceTalkContext';

interface VoiceOrbProps {
  state: TalkState;
  onClick?: () => void;
  size?: 'hero' | 'control';
  className?: string;
}

export function VoiceOrb({ state, onClick, size = 'hero', className }: VoiceOrbProps) {
  const isRecording = state === 'recording';
  const isProcessing =
    state === 'connecting' || state === 'processing' || state === 'speaking';
  const isSearching = state === 'processing';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isProcessing}
      className={cn(
        'xv-voice-orb group relative rounded-full border-0 bg-transparent p-0 outline-none',
        size === 'hero' ? 'xv-voice-orb--hero' : 'xv-voice-orb--control',
        isRecording && 'xv-voice-orb--recording',
        isProcessing && 'xv-voice-orb--busy',
        isSearching && 'xv-voice-orb--searching',
        className
      )}
      aria-label={
        isRecording ? 'Stop listening' : isProcessing ? 'Processing' : 'Start talking'
      }
    >
      <span className="xv-voice-orb-glow" aria-hidden />
      <span className="xv-voice-orb-ring xv-voice-orb-ring--1" aria-hidden />
      <span className="xv-voice-orb-ring xv-voice-orb-ring--2" aria-hidden />
      <span className="xv-voice-orb-shimmer" aria-hidden />
      <span className="xv-voice-orb-core">
        <span className="xv-voice-orb-logo-wrap">
          <Image
            src={XROGA_LOGO}
            alt="XROGA AI"
            width={size === 'hero' ? 96 : 52}
            height={size === 'hero' ? 96 : 52}
            className={cn(
              'xv-voice-orb-logo',
              size === 'hero' ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-10 h-10',
              isProcessing && 'xv-voice-orb-logo--busy'
            )}
            priority
          />
        </span>
      </span>
    </button>
  );
}
