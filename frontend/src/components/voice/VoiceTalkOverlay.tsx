'use client';

import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  MicOff,
  Volume2,
  VolumeX,
  Captions,
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
    cancelTalk,
    error,
    clearError,
  } = useVoiceTalk();

  const displayName = profile?.display_name?.split(' ')[0] ?? 'there';
  const greeting = useMemo(() => greetingForHour(), []);

  const isWelcome = state === 'idle' && turns.length === 0 && !liveUser && !liveReply;
  const isActive = state !== 'idle';
  const canCancel = isActive;

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
    <div className="xv-voice-overlay fixed inset-0 z-[400] flex flex-col" role="dialog" aria-modal="true" aria-label="XROGA Voice">
      <div className="xv-voice-overlay-bg" aria-hidden />

      {/* Top bar — Close + tools */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5">
        <button
          type="button"
          onClick={closeOverlay}
          className="xv-voice-close-btn"
          aria-label="Close voice screen"
        >
          <X className="w-4 h-4" />
          <span className="text-xs font-medium">Close</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleCaptions}
            className={cn('xv-voice-tool-btn', captionsOn && 'xv-voice-tool-btn--on')}
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
        </div>
      </header>

      {/* Conversation panel — user text + AI speech */}
      <main className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 space-y-4">
          {isWelcome && (
            <div className="text-center space-y-3 pt-8 sm:pt-12 animate-in fade-in duration-500">
              <p className="text-sm sm:text-base text-white/50 font-medium">
                {greeting}{' '}
                <span className="text-pink-300/90 font-semibold">{displayName}!</span>
              </p>
              <h2 className="text-2xl sm:text-3xl font-semibold text-white/95 tracking-tight leading-tight">
                How can I help you today?
              </h2>
              <p className="text-xs text-white/35 pt-2">Tap the orb below to start talking</p>
            </div>
          )}

          {turns.map((turn) =>
            turn.role === 'user' ? (
              <div key={turn.id} className="flex justify-end">
                <div className="xv-voice-bubble xv-voice-bubble--user max-w-[85%]">
                  <span className="xv-voice-bubble-label">You</span>
                  <p>{turn.text}</p>
                </div>
              </div>
            ) : (
              <div key={turn.id} className="flex gap-3 items-start max-w-[90%]">
                <div className="xv-voice-orb-mini shrink-0 mt-1" aria-hidden />
                <div className="xv-voice-bubble xv-voice-bubble--ai">
                  <span className="xv-voice-bubble-label">XROGA</span>
                  {captionsOn && <p>{turn.text}</p>}
                </div>
              </div>
            )
          )}

          {state === 'recording' && (
            <div className="flex justify-end animate-in fade-in">
              <div className="xv-voice-bubble xv-voice-bubble--user xv-voice-bubble--live max-w-[85%]">
                <span className="xv-voice-bubble-label">You</span>
                <p className="text-white/60 italic">Listening to you…</p>
              </div>
            </div>
          )}

          {liveUser && state !== 'recording' && (
            <div className="flex justify-end animate-in fade-in">
              <div className="xv-voice-bubble xv-voice-bubble--user max-w-[85%]">
                <span className="xv-voice-bubble-label">You</span>
                <p>{liveUser}</p>
              </div>
            </div>
          )}

          {(state === 'processing' || state === 'speaking') && liveReply && captionsOn && (
            <div className="flex gap-3 items-start max-w-[90%] animate-in fade-in">
              <div className="xv-voice-orb-mini shrink-0 mt-1" aria-hidden />
              <div className="xv-voice-bubble xv-voice-bubble--ai xv-voice-bubble--live">
                <span className="xv-voice-bubble-label">XROGA</span>
                <p>{liveReply}</p>
              </div>
            </div>
          )}
        </div>

        {/* Orb + status */}
        <div className="shrink-0 flex flex-col items-center gap-3 py-4 px-4">
          <VoiceOrb state={state} size="hero" onClick={orbPress} />
          {statusLabel && (
            <p
              className={cn(
                'text-sm font-medium tracking-wide text-center',
                statusLabel.includes('Searching')
                  ? 'text-cyan-300/90'
                  : state === 'recording'
                    ? 'text-white/75'
                    : 'text-white/50'
              )}
            >
              {statusLabel.includes('Searching') ? `🔍 ${statusLabel}` : statusLabel}
            </p>
          )}
          {state === 'recording' && <div className="xv-voice-listen-bar" aria-hidden />}
        </div>
      </main>

      {/* Bottom control bar */}
      <footer className="relative z-10 px-4 sm:px-8 pb-6 sm:pb-8 pt-2 border-t border-white/5">
        <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
          <button
            type="button"
            onClick={toggleMute}
            className={cn('xv-voice-side-btn', muted && 'xv-voice-side-btn--active')}
            aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
            title="Mute mic"
          >
            <MicOff className="w-5 h-5" />
          </button>

          <VoiceOrb state={state} size="control" onClick={orbPress} />

          {canCancel ? (
            <button
              type="button"
              onClick={cancelTalk}
              className="xv-voice-cancel-btn"
              aria-label="Cancel current talk"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={closeOverlay}
              className="xv-voice-side-btn"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-center text-[10px] text-white/25 mt-3 font-mono">
          Tap orb to talk · Cancel stops current round · Close exits
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
