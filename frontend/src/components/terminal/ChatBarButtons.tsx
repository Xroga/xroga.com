'use client';

import { cn } from '@/lib/utils';
import { CloudUpload, Mic } from 'lucide-react';
import { ChatBarShipIcon, type SendButtonState } from './ChatBarShipIcon';

export type { SendButtonState };
export type ChatbarSurface = 'homepage' | 'dashboard' | 'incognito';

export function ChatBarComboAction({
  hasText,
  listening,
  onMicToggle,
  micDisabled,
  sendState = 'idle',
  stopping = false,
  onStop,
  surface = 'homepage',
}: {
  hasText: boolean;
  listening: boolean;
  onMicToggle: () => void;
  micDisabled?: boolean;
  sendState?: SendButtonState;
  stopping?: boolean;
  onStop?: () => void;
  surface?: ChatbarSurface;
}) {
  const busy = stopping || sendState === 'sending' || sendState === 'thinking';
  const launchReady = hasText || sendState === 'launched';

  if (busy) {
    return (
      <button
        type="button"
        onClick={onStop}
        className={cn('xv-combo-action xv-combo-action--stop shrink-0', surface === 'homepage' && 'xv-combo-action--home')}
        aria-label="Stop response"
      >
        <span className="xv-combo-action__icon xv-combo-action__icon--stop">
          <ChatBarShipIcon state={stopping ? 'thinking' : sendState} size={14} />
        </span>
        <span className="xv-combo-action__label">Stop</span>
      </button>
    );
  }

  if (launchReady) {
    return (
      <button
        type="submit"
        className={cn('xv-go-btn shrink-0', surface === 'homepage' && 'xv-go-btn--home')}
        aria-label="Launch"
      >
        <span className="xv-go-btn__liquid" aria-hidden />
        <span className="xv-go-btn__icon">
          <ChatBarShipIcon state={sendState} size={14} />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onMicToggle}
      disabled={micDisabled}
      className={cn(
        'xv-combo-action xv-combo-action--mic shrink-0',
        surface === 'homepage' && 'xv-combo-action--home',
        listening && 'xv-combo-action--listen'
      )}
      title={listening ? 'Stop listening' : 'Speak to text'}
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
    >
      {listening ? (
        <VoiceWaveform active />
      ) : (
        <span className="xv-combo-action__icon xv-combo-action__icon--mic">
          <Mic className="w-4 h-4" />
        </span>
      )}
    </button>
  );
}

export function ChatBarSendButton({
  stopping = false,
  onStop,
  state = 'idle',
  surface = 'dashboard',
  compact: _compact = false,
}: {
  stopping?: boolean;
  onStop?: () => void;
  state?: SendButtonState;
  surface?: ChatbarSurface;
  compact?: boolean;
}) {
  void _compact;
  const busy = stopping || state === 'sending' || state === 'thinking';

  if (busy) {
    return (
      <button
        type="button"
        onClick={onStop}
        className={cn(
          'xv-go-btn xv-go-btn--stop shrink-0',
          surface === 'homepage' && 'xv-go-btn--home',
          surface === 'incognito' && 'xv-go-btn--incognito'
        )}
        aria-label="Stop response"
      >
        <span className="xv-go-btn__liquid xv-go-btn__liquid--stop" aria-hidden />
        <span className="xv-go-btn__icon xv-go-btn__icon--stop">
          <ChatBarShipIcon state={stopping ? 'thinking' : state} size={14} />
        </span>
      </button>
    );
  }

  return (
    <button
      type="submit"
      className={cn(
        'xv-go-btn shrink-0',
        surface === 'homepage' && 'xv-go-btn--home',
        surface === 'incognito' && 'xv-go-btn--incognito'
      )}
      aria-label="Launch"
    >
      <span className="xv-go-btn__liquid" aria-hidden />
      <span className="xv-go-btn__icon">
        <ChatBarShipIcon state={state} size={14} />
      </span>
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

export function GitHubChipIcon({ lightBg = false, white = false, plain = false }: { lightBg?: boolean; white?: boolean; plain?: boolean }) {
  if (plain || white) {
    return (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden>
        <path
          fill="currentColor"
          d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z"
        />
      </svg>
    );
  }
  return (
    <IntegrationLogo
      src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
      alt="GitHub"
      className={cn('w-3.5 h-3.5', lightBg && 'brightness-0', !lightBg && 'dark:invert')}
    />
  );
}

export function GitLabChipIcon({ white = false }: { white?: boolean }) {
  if (white) {
    return (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden>
        <path fill="currentColor" d="m23.6 9.6-.8-2.4a1.2 1.2 0 0 0-1.1-.8h-3.4L16.2 2a1.2 1.2 0 0 0-2.2 0l-2.1 4.4H8.5a1.2 1.2 0 0 0-1.1.8L6.6 9.6a1.2 1.2 0 0 0 .4 1.4l2.7 2-1 3.1a1.2 1.2 0 0 0 1.8 1.3l2.8-2 2.8 2a1.2 1.2 0 0 0 1.8-1.3l-1-3.1 2.7-2a1.2 1.2 0 0 0 .4-1.4Z" />
      </svg>
    );
  }
  return (
    <IntegrationLogo
      src="https://about.gitlab.com/images/press/logo/png/gitlab-icon-rgb.png"
      alt="GitLab"
    />
  );
}

export function VercelChipIcon({ white = false }: { white?: boolean }) {
  return (
    <svg viewBox="0 0 76 65" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <path fill={white ? '#ffffff' : 'currentColor'} d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  );
}

export function ChatBarBrandChip({
  variant,
  label,
  onClick,
  plain = false,
  darkUi = false,
  connected = false,
}: {
  variant: 'github' | 'gitlab' | 'vercel';
  label: string;
  onClick: () => void;
  plain?: boolean;
  darkUi?: boolean;
  connected?: boolean;
}) {
  const icons = {
    github: <GitHubChipIcon lightBg={!plain} white={plain && darkUi} plain={plain} />,
    gitlab: <GitLabChipIcon white={plain} />,
    vercel: <VercelChipIcon white={plain ? darkUi : true} />,
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'xv-brand-chip',
        plain && 'xv-brand-chip--plain',
        darkUi && 'xv-brand-chip--dark-ui',
        `xv-brand-chip--${variant}`
      )}
      aria-label={label}
      title={label}
    >
      {connected ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5" /> : null}
      {icons[variant]}
    </button>
  );
}

export function TwitterChipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden>
      <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
