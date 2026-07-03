'use client';

import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  MicOff,
  Volume2,
  VolumeX,
  Captions,
  SlidersHorizontal,
} from 'lucide-react';
import { useVoiceTalk } from '@/context/VoiceTalkContext';
import { VoiceOrb } from '@/components/voice/VoiceOrb';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getAccessToken } from '@/lib/api';

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function VoiceTalkOverlay() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const {
    overlayOpen,
    closeOverlay,
    state,
    statusLabel,
    turns,
    liveReply,
    liveUser,
    captionsOn,
    speakerOn,
    muted,
    toggleCaptions,
    toggleSpeaker,
    toggleMute,
    orbPress,
    error,
    clearError,
  } = useVoiceTalk();

  const displayName = profile?.display_name?.split(' ')[0] ?? 'there';
  const greeting = useMemo(() => greetingForHour(), []);

  const isWelcome = state === 'idle' && turns.length === 0;
  const isActive = state !== 'idle';

  useEffect(() => {
    if (!error) return;
    if (error.includes('Sign in')) {
      toast.error('Sign in to use voice talk');
      closeOverlay();
      router.push('/auth/login');
    } else {
      toast.error(error);
    }
    clearError();
  }, [error, clearError, closeOverlay, router]);

  if (!overlayOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="xv-voice-overlay fixed inset-0 z-[400] flex flex-col">
      <div className="xv-voice-overlay-bg" aria-hidden />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5">
        <div className="w-10" />
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleCaptions}
            className={cn(
              'xv-voice-tool-btn',
              captionsOn && 'xv-voice-tool-btn--on'
            )}
            aria-label="Toggle captions"
            title="Captions"
          >
            <Captions className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleSpeaker}
            className="xv-voice-tool-btn"
            aria-label={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
            title="Speaker"
          >
            {speakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            type="button"
            className="xv-voice-tool-btn opacity-50 cursor-default"
            aria-hidden
            tabIndex={-1}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main stage */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 sm:px-8 pb-36 min-h-0 overflow-y-auto">
        {isWelcome && (
          <div className="text-center space-y-3 mb-8 sm:mb-12 animate-in fade-in duration-500">
            <p className="text-sm sm:text-base text-white/50 font-medium">
              {greeting}{' '}
              <span className="text-pink-300/90 font-semibold">{displayName}!</span>
            </p>
            <h2 className="text-2xl sm:text-4xl font-semibold text-white/95 tracking-tight leading-tight max-w-md mx-auto">
              How can I help you today?
            </h2>
          </div>
        )}

        {/* Conversation history */}
        {!isWelcome && (
          <div className="w-full max-w-lg space-y-5 mb-6 sm:mb-10">
            {turns.slice(-4).map((turn) =>
              turn.role === 'user' ? (
                <p
                  key={turn.id}
                  className="text-right text-sm sm:text-base text-white/45 leading-relaxed ml-8"
                >
                  {turn.text}
                </p>
              ) : (
                <div key={turn.id} className="flex gap-3 items-start">
                  <div className="xv-voice-orb-mini shrink-0 mt-1" aria-hidden />
                  {captionsOn && (
                    <p className="text-base sm:text-lg text-amber-100/90 leading-relaxed font-medium">
                      {turn.text}
                    </p>
                  )}
                </div>
              )
            )}

            {isActive && liveUser && state !== 'recording' && (
              <p className="text-right text-sm text-white/40 ml-8 italic">{liveUser}</p>
            )}
          </div>
        )}

        {/* Central orb — hero on welcome, smaller when in conversation */}
        <div className={cn('flex flex-col items-center gap-6', !isWelcome && turns.length > 0 && 'scale-90 sm:scale-95')}>
          <VoiceOrb state={state} size="hero" onClick={orbPress} />

          {/* Live status */}
          <div className="text-center space-y-2">
            {statusLabel && (
              <p
                className={cn(
                  'text-sm font-medium tracking-wide',
                  statusLabel.includes('Searching')
                    ? 'text-cyan-300/90'
                    : state === 'recording'
                      ? 'text-white/70'
                      : 'text-white/50'
                )}
              >
                {statusLabel.includes('Searching') ? `🔍 ${statusLabel}` : statusLabel}
              </p>
            )}
            {state === 'recording' && (
              <div className="xv-voice-listen-bar" aria-hidden />
            )}
          </div>
        </div>

        {/* AI speaking caption */}
        {state === 'speaking' && captionsOn && liveReply && (
          <p className="mt-8 text-center text-lg sm:text-xl text-amber-100/85 max-w-lg leading-relaxed font-medium animate-in fade-in">
            {liveReply}
          </p>
        )}
      </main>

      {/* Bottom control bar */}
      <footer className="relative z-10 px-6 sm:px-10 pb-8 sm:pb-10 pt-4">
        <div className="flex items-center justify-center gap-8 sm:gap-14 max-w-md mx-auto">
          <button
            type="button"
            onClick={toggleMute}
            className={cn('xv-voice-side-btn', muted && 'xv-voice-side-btn--active')}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
          >
            <MicOff className="w-5 h-5" />
          </button>

          <VoiceOrb state={state} size="control" onClick={orbPress} />

          <button
            type="button"
            onClick={closeOverlay}
            className="xv-voice-side-btn"
            aria-label="Close voice assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-center text-[10px] text-white/25 mt-4 font-mono">
          Tap the orb to talk · XROGA Voice
        </p>
      </footer>
    </div>,
    document.body
  );
}

/** Opens overlay after auth check — used by header Talk pill */
export async function openVoiceTalkSession(
  open: () => void,
  onNeedLogin: () => void
) {
  const token = await getAccessToken();
  if (!token) {
    onNeedLogin();
    return;
  }
  open();
}
