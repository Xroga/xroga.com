'use client';

import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Mic, MicOff, Volume2, VolumeX, Captions, PhoneOff } from 'lucide-react';
import Image from 'next/image';
import { useVoiceTalk, XROGA_LOGO } from '@/context/VoiceTalkContext';
import { VoiceOrb } from '@/components/voice/VoiceOrb';
import { VoiceWaveform } from '@/components/voice/VoiceWaveform';
import { VoiceLiveCaption } from '@/components/voice/VoiceLiveCaption';
import { useAppStore } from '@/store/useAppStore';
import { useThemeStore } from '@/store/useThemeStore';
import { voiceThemeStyle } from '@/lib/voiceTheme';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { getAccessToken } from '@/lib/api';

function formatCallTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function VoiceTalkOverlay() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const theme = useThemeStore((s) => s.theme);
  const {
    overlayOpen,
    closeOverlay,
    state,
    statusLabel,
    turns,
    welcomeText,
    liveReply,
    liveUser,
    interimUser,
    liveStream,
    callSeconds,
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
  const themeStyle = voiceThemeStyle(theme);

  const userLiveText =
    state === 'recording' ? interimUser || liveUser || '' : liveUser || '';

  const aiLiveText = (() => {
    if (state === 'speaking' && welcomeText && !liveReply && turns.length === 0) {
      return welcomeText;
    }
    if (state === 'speaking' || state === 'processing') {
      if (liveReply) return liveReply;
      if (state === 'processing' && statusLabel?.includes('Searching')) return statusLabel;
    }
    return liveReply || welcomeText || '';
  })();

  const showUserCaption =
    captionsOn && (state === 'recording' || Boolean(userLiveText && state !== 'idle'));
  const showAiCaption =
    captionsOn &&
    (Boolean(aiLiveText) ||
      state === 'speaking' ||
      state === 'processing' ||
      Boolean(welcomeText && turns.length === 0));

  const connectionLive = state !== 'idle' && state !== 'connecting';

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
    <div
      className={cn('xv-voice-overlay fixed inset-0 z-[400] flex flex-col', `xv-voice-theme-${theme}`)}
      style={themeStyle}
      role="dialog"
      aria-modal="true"
      aria-label="XROGA Voice Call"
    >
      <div className="xv-voice-overlay-bg" aria-hidden />
      <div className="xv-voice-overlay-noise" aria-hidden />

      {/* Call header */}
      <header className="relative z-10 px-4 sm:px-6 pt-5 pb-2">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'xv-voice-call-dot shrink-0',
                connectionLive ? 'xv-voice-call-dot--live' : 'xv-voice-call-dot--idle'
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-widest uppercase xv-voice-muted">
                XROGA AI · Voice Call
              </p>
              <p className="text-sm font-medium xv-voice-title truncate">
                {statusLabel || 'Connected'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="xv-voice-call-timer font-mono text-xs xv-voice-muted">
              {formatCallTime(callSeconds)}
            </span>
            <button type="button" onClick={closeOverlay} className="xv-voice-close-btn" aria-label="End call">
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Center stage — orb + waveform */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 min-h-0">
        <div className="flex flex-col items-center gap-6 w-full max-w-md">
          {!turns.length && state === 'idle' && !welcomeText && (
            <div className="text-center space-y-2 mb-2 animate-in fade-in">
              <p className="text-sm xv-voice-muted">
                {greeting}, <span className="xv-voice-accent font-semibold">{displayName}</span>
              </p>
              <h2 className="text-xl sm:text-2xl font-semibold xv-voice-title">Talk with XROGA AI</h2>
            </div>
          )}

          <VoiceOrb state={state} size="hero" onClick={orbPress} />

          <VoiceWaveform stream={liveStream} active={state === 'recording'} />

          <p className="text-center text-sm xv-voice-muted min-h-[1.25rem]">
            {state === 'idle' && 'Tap orb to speak'}
            {state === 'recording' && 'Tap orb again when you finish speaking'}
            {state === 'processing' && (statusLabel || 'Processing…')}
            {state === 'speaking' && 'XROGA is responding…'}
            {state === 'connecting' && 'Connecting…'}
          </p>
        </div>

        {/* Scrollable history (compact) */}
        {turns.length > 0 && (
          <div className="w-full max-w-lg mt-6 max-h-32 overflow-y-auto px-2 space-y-2 opacity-80">
            {turns.slice(-4).map((turn) => (
              <div
                key={turn.id}
                className={cn(
                  'text-xs px-3 py-2 rounded-xl border',
                  turn.role === 'user'
                    ? 'xv-voice-history-user ml-8'
                    : 'xv-voice-history-ai mr-8 flex gap-2 items-start'
                )}
              >
                {turn.role === 'assistant' && (
                  <Image src={XROGA_LOGO} alt="" width={16} height={16} className="rounded-full shrink-0 mt-0.5" />
                )}
                <span>{turn.text}</span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Live captions — phone call subtitle strip */}
      <section className="relative z-10 px-4 pb-3 space-y-2 max-w-lg mx-auto w-full">
        <VoiceLiveCaption
          speaker="user"
          label="You"
          text={userLiveText}
          live={state === 'recording'}
          placeholder={state === 'recording' ? 'Start speaking…' : undefined}
          visible={showUserCaption}
        />
        <VoiceLiveCaption
          speaker="ai"
          label="XROGA"
          text={aiLiveText}
          live={state === 'speaking' || state === 'processing'}
          placeholder={state === 'processing' ? 'Thinking…' : undefined}
          visible={showAiCaption}
        />
      </section>

      {/* Phone-style control bar */}
      <footer className="relative z-10 px-4 sm:px-8 pb-8 pt-3">
        <div className="xv-voice-control-dock max-w-md mx-auto">
          <button
            type="button"
            onClick={toggleCaptions}
            className={cn('xv-voice-dock-btn', captionsOn && 'xv-voice-dock-btn--on')}
            aria-label="Captions"
          >
            <Captions className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className={cn('xv-voice-dock-btn', muted && 'xv-voice-dock-btn--danger')}
            aria-label={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              if (state === 'idle' || state === 'recording') orbPress();
              else cancelTalk();
            }}
            className={cn(
              'xv-voice-dock-btn xv-voice-dock-btn--primary',
              state === 'recording' && 'xv-voice-dock-btn--recording'
            )}
            aria-label={state === 'recording' ? 'Send message' : state === 'idle' ? 'Start speaking' : 'Cancel'}
          >
            {state === 'idle' ? (
              <Mic className="w-6 h-6" />
            ) : state === 'recording' ? (
              <span className="text-[10px] font-bold tracking-wide">SEND</span>
            ) : (
              <X className="w-5 h-5" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleSpeaker}
            className="xv-voice-dock-btn"
            aria-label={speakerOn ? 'Mute speaker' : 'Unmute speaker'}
          >
            {speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          <button type="button" onClick={closeOverlay} className="xv-voice-dock-btn xv-voice-dock-btn--danger" aria-label="End call">
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>,
    document.body
  );
}

export async function openVoiceTalkSession(open: () => void, onNeedLogin: () => void) {
  const token = await getAccessToken();
  if (!token) {
    onNeedLogin();
    return;
  }
  open();
}
