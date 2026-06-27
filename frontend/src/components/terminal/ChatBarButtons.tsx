'use client';

import { cn } from '@/lib/utils';
import { Rocket, Square } from 'lucide-react';

export type SendButtonState = 'idle' | 'sending' | 'thinking' | 'launched';

export function ChatBarSendButton({
  stopping = false,
  onStop,
  state = 'idle',
}: {
  stopping?: boolean;
  onStop?: () => void;
  state?: SendButtonState;
}) {
  const busy = stopping || state === 'sending' || state === 'thinking';

  if (busy) {
    return (
      <button
        type="button"
        onClick={onStop}
        className="xv-go-btn xv-go-btn--stop shrink-0"
        aria-label="Stop response"
      >
        <span className="xv-go-btn__icon xv-go-btn__icon--stop">
          <Square className="w-3 h-3 fill-current" />
        </span>
        <span className="xv-go-btn__text">Stop</span>
      </button>
    );
  }

  return (
    <button type="submit" className="xv-go-btn shrink-0" aria-label="Launch">
      <span className="xv-go-btn__icon">
        <Rocket className="w-3.5 h-3.5" />
      </span>
      <span className="xv-go-btn__text">GO!</span>
    </button>
  );
}

export function ChatBarUploadButton({
  onClick,
  active,
}: {
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'xv-upload-icon-btn p-2 rounded-lg shrink-0 transition-all',
        active
          ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
          : 'xv-chatbar-secondary-btn border border-[var(--card-border)]/50 hover:bg-white/10 text-[var(--foreground)]'
      )}
      title="Attach files"
      aria-label="Upload files"
      aria-busy={active}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
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
