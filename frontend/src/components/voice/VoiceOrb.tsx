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
  const isBusy = state === 'connecting' || state === 'processing';
  const isSpeaking = state === 'speaking';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isBusy}
      className={cn(
        'xv-voice-orb group relative rounded-full border-0 bg-transparent p-0 outline-none',
        size === 'hero' ? 'xv-voice-orb--hero' : 'xv-voice-orb--control',
        isRecording && 'xv-voice-orb--recording',
        isBusy && 'xv-voice-orb--busy',
        isSpeaking && 'xv-voice-orb--speaking',
        className
      )}
      aria-label={
        isRecording
          ? 'Stop and send your message'
          : isBusy
            ? 'Processing'
            : isSpeaking
              ? 'XROGA is speaking'
              : 'Tap to speak'
      }
    >
      <span className="xv-voice-orb-glow" aria-hidden />
      <span className="xv-voice-orb-ring xv-voice-orb-ring--1" aria-hidden />
      <span className="xv-voice-orb-ring xv-voice-orb-ring--2" aria-hidden />
      <span className="xv-voice-orb-ring xv-voice-orb-ring--3" aria-hidden />
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
              size === 'hero' ? 'w-16 h-16 sm:w-24 sm:h-24' : 'w-11 h-11',
              (isBusy || isSpeaking) && 'xv-voice-orb-logo--busy'
            )}
            priority
          />
        </span>
      </span>
    </button>
  );
}
