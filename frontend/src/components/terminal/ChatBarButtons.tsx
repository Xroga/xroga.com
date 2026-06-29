'use client';

import { cn } from '@/lib/utils';
import { Rocket, Square, CloudUpload } from 'lucide-react';

export type SendButtonState = 'idle' | 'sending' | 'thinking' | 'launched';
export type ChatbarSurface = 'homepage' | 'dashboard' | 'incognito';

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
        className={cn('xv-go-btn xv-go-btn--stop shrink-0', surface === 'homepage' && 'xv-go-btn--home', surface === 'incognito' && 'xv-go-btn--incognito')}
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
      className={cn('xv-go-btn shrink-0', surface === 'homepage' && 'xv-go-btn--home', surface === 'incognito' && 'xv-go-btn--incognito')}
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
        className={cn('xv-power-smash-upload__shell', active && 'xv-power-smash-upload__shell--active')}
        title="Attach files"
        aria-label="Upload files"
        aria-busy={active}
      >
        <span className="xv-power-smash-upload__shine" aria-hidden />
        <span className="xv-power-smash-upload__gloss" aria-hidden />
        <CloudUpload
          className={cn(
            'w-4 h-4 relative z-[1] transition-transform',
            active && 'xv-cloud-upload-bounce text-white'
          )}
          strokeWidth={2.25}
        />
        {active && <span className="xv-upload-pulse-ring" aria-hidden />}
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

function IntegrationLogo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={cn('w-4 h-4 object-contain shrink-0', className)} />
  );
}

export function GitHubChipIcon() {
  return (
    <IntegrationLogo
      src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
      alt="GitHub"
      className="dark:invert"
    />
  );
}

export function GitLabChipIcon() {
  return (
    <IntegrationLogo
      src="https://about.gitlab.com/images/press/logo/png/gitlab-icon-rgb.png"
      alt="GitLab"
    />
  );
}

export function VercelChipIcon() {
  return (
    <svg viewBox="0 0 76 65" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <path fill="currentColor" d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

export function TwitterChipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
