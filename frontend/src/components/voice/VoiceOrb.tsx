'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TalkState } from '@/context/VoiceTalkContext';

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
      <span className="xv-voice-orb-core">
        <Sparkles
          className={cn(
            'xv-voice-orb-icon',
            size === 'hero' ? 'w-10 h-10 sm:w-12 sm:h-12' : 'w-7 h-7',
            isProcessing && 'animate-spin'
          )}
          strokeWidth={1.5}
        />
      </span>
    </button>
  );
}
