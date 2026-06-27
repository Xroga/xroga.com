'use client';

import { cn } from '@/lib/utils';
import { Rocket, Loader2, Check } from 'lucide-react';

export type SendButtonState = 'idle' | 'sending' | 'thinking' | 'launched';

export function ChatBarSendButton({
  disabled,
  state = 'idle',
}: {
  disabled?: boolean;
  state?: SendButtonState;
}) {
  const busy = state === 'sending' || state === 'thinking';

  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className={cn(
        'xv-send-btn-box relative flex items-center justify-center gap-1 shrink-0',
        'rounded-lg border-2 font-semibold transition-all duration-300',
        state === 'idle' && 'bg-[#006aff] border-[#c0dfff] text-white hover:bg-[#1b7aff]',
        state === 'sending' && 'xv-send-btn--sending bg-[#006aff] border-white/40 text-white',
        state === 'thinking' && 'xv-send-btn--thinking bg-[#006aff]/90 border-[#c0dfff]/60 text-white',
        state === 'launched' && 'bg-emerald-600 border-emerald-400/50 text-white',
        disabled && state === 'idle' && 'opacity-40 pointer-events-none'
      )}
      aria-label={
        state === 'sending' ? 'Launching' : state === 'launched' ? 'Launched' : state === 'thinking' ? 'AI responding' : 'Launch'
      }
    >
      {state === 'sending' && (
        <>
          <Rocket className="w-4 h-4 xv-rocket-launch" />
          <span className="text-[10px] sm:text-xs hidden xs:inline">Start</span>
        </>
      )}
      {state === 'thinking' && <Loader2 className="w-4 h-4 animate-spin" />}
      {state === 'launched' && (
        <>
          <Check className="w-4 h-4" />
          <span className="text-[10px] sm:text-xs">Launched</span>
        </>
      )}
      {state === 'idle' && <Rocket className="w-4 h-4 sm:w-5 sm:h-5" />}
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
        'xv-upload-icon-btn p-2 rounded-lg border shrink-0 transition-all',
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
