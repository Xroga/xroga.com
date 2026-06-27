'use client';

import { cn } from '@/lib/utils';
import { ArrowUp, Loader2 } from 'lucide-react';

export type SendButtonState = 'idle' | 'sending' | 'thinking';

export function ChatBarSendButton({
  disabled,
  state = 'idle',
}: {
  disabled?: boolean;
  state?: SendButtonState;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || state === 'thinking'}
      className={cn(
        'xv-send-btn-compact relative flex items-center justify-center rounded-full shrink-0',
        'border-2 transition-all duration-300',
        state === 'idle' && 'bg-[var(--accent)] border-[var(--accent)]/40 text-white hover:scale-105',
        state === 'sending' && 'xv-send-btn--sending bg-[var(--accent)] border-white/30 text-white scale-95',
        state === 'thinking' && 'xv-send-btn--thinking bg-[var(--accent)]/80 border-[var(--accent)]/50 text-white',
        disabled && state === 'idle' && 'opacity-40 pointer-events-none'
      )}
      aria-label={state === 'thinking' ? 'AI responding' : 'Send'}
    >
      {state === 'thinking' ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <ArrowUp className={cn('w-3.5 h-3.5', state === 'sending' && 'xv-send-arrow-burst')} />
      )}
      {state === 'sending' && <span className="xv-send-ring" aria-hidden />}
      {state === 'thinking' && <span className="xv-send-pulse" aria-hidden />}
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
        'xv-upload-icon-btn p-2 rounded-xl border shrink-0 transition-all',
        active
          ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
          : 'border-[var(--card-border)]/50 hover:bg-white/10 text-[var(--foreground)]'
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
