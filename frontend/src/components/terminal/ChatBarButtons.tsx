'use client';

import { cn } from '@/lib/utils';
import { Rocket, Square } from 'lucide-react';
import { UploadAnimButton } from '@/components/ui/UploadAnimButton';

export type SendButtonState = 'idle' | 'sending' | 'thinking' | 'launched';
export type ChatbarSurface = 'homepage' | 'dashboard';

export function ChatBarSendButton({
  stopping = false,
  onStop,
  state = 'idle',
  surface = 'dashboard',
}: {
  stopping?: boolean;
  onStop?: () => void;
  state?: SendButtonState;
  surface?: ChatbarSurface;
}) {
  const busy = stopping || state === 'sending' || state === 'thinking';

  if (busy) {
    return (
      <button
        type="button"
        onClick={onStop}
        className={cn('xv-go-btn xv-go-btn--stop shrink-0', surface === 'homepage' && 'xv-go-btn--home')}
        aria-label="Stop response"
      >
        <span className="xv-go-btn__icon xv-go-btn__icon--stop">
          <Square className="w-2.5 h-2.5 fill-current" />
        </span>
        <span className="xv-go-btn__text">Stop</span>
      </button>
    );
  }

  return (
    <button
      type="submit"
      className={cn('xv-go-btn shrink-0', surface === 'homepage' && 'xv-go-btn--home')}
      aria-label="Launch"
    >
      <span className="xv-go-btn__icon">
        <Rocket className="w-3 h-3" />
      </span>
      <span className="xv-go-btn__text">GO!</span>
    </button>
  );
}

export function ChatBarUploadButton({
  onClick,
  active,
  surface = 'dashboard',
}: {
  onClick: () => void;
  active?: boolean;
  surface?: ChatbarSurface;
}) {
  return (
    <div className={cn('xv-power-smash-upload shrink-0', surface === 'homepage' && 'xv-power-smash-upload--home')}>
      <button
        type="button"
        onClick={onClick}
        className="xv-power-smash-upload__shell"
        title="Attach files"
        aria-label="Upload files"
        aria-busy={active}
      >
        <span className="xv-power-smash-upload__shine" aria-hidden />
        <span className="xv-power-smash-upload__gloss" aria-hidden />
        <UploadAnimButton active={!!active} decorative className="xv-upload-anim--compact xv-upload-anim--in-smash" />
      </button>
    </div>
  );
}

export function VoiceWaveform({ active }: { active: boolean }) {
  return (
    <span className="xv-voice-wave flex items-end justify-center gap-0.5 h-4 w-5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn('xv-wave-bar w-0.5 rounded-full bg-red-400', active && 'xv-wave-bar--active')}
          style={{ animationDelay: `${i * 0.12}s`, height: active ? undefined : '4px' }}
        />
      ))}
    </span>
  );
}
