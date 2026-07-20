'use client';

import { Phone, PhoneCall } from 'lucide-react';
import { useId } from 'react';
import { useVoiceTalk } from '@/context/VoiceTalkContext';
import { openVoiceTalkSession } from '@/components/voice/VoiceTalkOverlay';
import { useThemeStore } from '@/store/useThemeStore';
import type { ThemeId } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface TalkButtonProps {
  variant?: 'header' | 'chatbar' | 'inline';
  className?: string;
}

function UiverseTalkInner({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="xv-talk-uiverse-wrapper">
      <span className="xv-talk-uiverse-label-row">
        <PhoneCall className="w-3.5 h-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
        {label}
      </span>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className={`xv-talk-uiverse-circle xv-talk-uiverse-circle-${i + 1}`} />
      ))}
      {active && <span className="xv-talk-uiverse-live" aria-hidden />}
    </div>
  );
}

function BlackThemeTalkInner({ label }: { label: string }) {
  const filterId = useId().replace(/:/g, '');
  return (
    <>
      <svg className="xv-talk-black-filter" aria-hidden>
        <filter id={filterId} width="3000%" x="-1000%" height="3000%" y="-1000%">
          <feColorMatrix
            values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 3 0"
          />
        </filter>
      </svg>
      <div className="xv-talk-black-a xv-talk-black-l" style={{ filter: `blur(4px) url(#${filterId})` }} />
      <div className="xv-talk-black-a xv-talk-black-r" style={{ filter: `blur(4px) url(#${filterId})` }} />
      <div className="xv-talk-black-a xv-talk-black-t" style={{ filter: `blur(4px) url(#${filterId})` }} />
      <div className="xv-talk-black-a xv-talk-black-b" style={{ filter: `blur(4px) url(#${filterId})` }} />
      <span className="xv-talk-black-text">
        <PhoneCall className="w-3 h-3 shrink-0" strokeWidth={2.25} aria-hidden />
        {label}
      </span>
    </>
  );
}

function GrayThemeTalkInner({ label }: { label: string }) {
  return (
    <>
      <span className="xv-talk-gray-gradient-container">
        <span className="xv-talk-gray-gradient" />
      </span>
      <span className="xv-talk-gray-label">
        <PhoneCall className="w-3 h-3 shrink-0" strokeWidth={2.25} aria-hidden />
        {label}
      </span>
    </>
  );
}

function talkThemeClass(theme: ThemeId): string {
  if (theme === 'black') return 'xv-talk-btn-black';
  if (theme === 'gray') return 'xv-talk-btn-gray';
  if (theme === 'white') return 'xv-talk-btn-uiverse xv-talk-btn-uiverse--white';
  return 'xv-talk-btn-uiverse';
}

export function TalkButton({ variant = 'chatbar', className }: TalkButtonProps) {
  const router = useRouter();
  const theme = useThemeStore((s) => s.theme);
  const { openOverlay, overlayOpen, state } = useVoiceTalk();

  const handleClick = () => {
    void openVoiceTalkSession(openOverlay, () => router.push('/auth/login'));
  };

  const isLive = overlayOpen && state !== 'idle';
  const label = isLive ? 'Live' : 'Call AI';

  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'xv-talk-btn-header shrink-0',
          (overlayOpen || isLive) && 'xv-talk-btn-header--active',
          className
        )}
        aria-label="Talk with Xroga AI — voice call"
        title="Talk with Xroga AI (voice call)"
      >
        <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.25} />
        <span className="hidden sm:inline font-medium">{isLive ? 'Live' : 'Call AI'}</span>
      </button>
    );
  }

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'xv-talk-inline-btn xv-talk-inline-btn--call shrink-0',
          theme === 'black' && 'xv-talk-inline-btn--black',
          theme === 'gray' && 'xv-talk-inline-btn--gray',
          theme === 'white' && 'xv-talk-inline-btn--white',
          isLive && 'xv-talk-inline-btn--live',
          className
        )}
        aria-label="Talk with Xroga AI — voice call"
        title="Talk with Xroga AI (voice call) — not voice-to-text"
      >
        <span className="xv-talk-call-pulse" aria-hidden />
        <PhoneCall className="w-3.5 h-3.5 shrink-0 xv-talk-call-icon" strokeWidth={2.35} />
        <span>{label}</span>
      </button>
    );
  }

  const themeClass = talkThemeClass(theme);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn('xv-talk-chatbar-btn', themeClass, isLive && 'xv-talk-chatbar-btn--live', className)}
      aria-label="Talk with Xroga AI — voice call"
      title="Talk with Xroga AI (voice call)"
    >
      {theme === 'black' ? (
        <BlackThemeTalkInner label={label} />
      ) : theme === 'gray' ? (
        <GrayThemeTalkInner label={label} />
      ) : (
        <UiverseTalkInner label={label} active={isLive} />
      )}
    </button>
  );
}
