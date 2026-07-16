'use client';

import { useEffect, useRef } from 'react';
import { X, FileText, Image as ImageIcon, Film, Mic } from 'lucide-react';
import { ChatBarSendButton, ChatBarUploadButton, ChatBarComboAction, VoiceWaveform, type SendButtonState, type ChatbarSurface } from './ChatBarButtons';
import { cn } from '@/lib/utils';

const FILE_ROWS = 2;

function filePreviewIcon(type: string) {
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('video/')) return Film;
  return FileText;
}

export function ChatBarFileStrip({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div className="border-b border-[var(--card-border)]/30 px-3 py-2">
      <div className="xv-chatbar-files-scroll overflow-x-auto overflow-y-hidden scrollbar-hide">
        <div
          className="grid grid-flow-col gap-2 w-max"
          style={{ gridTemplateRows: `repeat(${FILE_ROWS}, minmax(0, auto))` }}
        >
          {files.map((f, i) => {
            const Icon = filePreviewIcon(f.type);
            const isImage = f.type.startsWith('image/');
            const url = isImage ? URL.createObjectURL(f) : null;
            return (
              <div
                key={`${f.name}-${i}`}
                className="relative flex flex-col items-center gap-1 text-[10px] px-2 py-2 rounded-xl bg-white/5 border border-[var(--card-border)] w-[100px] sm:w-[120px] shrink-0"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-white/5 flex items-center justify-center">
                    <Icon className="w-6 h-6 text-[var(--muted)]" />
                  </div>
                )}
                <span className="w-full truncate text-center text-[var(--foreground)]">{f.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="p-0.5 hover:text-red-400 shrink-0"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChatBarDragOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] bg-[var(--accent)]/8 backdrop-blur-[2px] border-2 border-dashed border-[var(--accent)]/50 pointer-events-none">
      <div className="xv-drag-drop-card px-6 py-4 rounded-2xl border border-[var(--accent)]/40 bg-[var(--card)]/90 shadow-xl text-center">
        <p className="text-sm font-semibold text-[var(--foreground)]">Drag & drop</p>
        <p className="text-[10px] text-[var(--muted)] mt-1">Images, video, audio, documents</p>
      </div>
    </div>
  );
}

export function ChatBarMicButton({
  listening,
  onToggle,
  disabled,
  surface = 'dashboard',
}: {
  listening: boolean;
  onToggle: () => void;
  disabled?: boolean;
  surface?: ChatbarSurface;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'xv-mic-btn relative p-1.5 rounded-xl transition-all shrink-0',
        surface === 'homepage' && 'xv-mic-btn--home',
        surface === 'incognito' && 'xv-mic-btn--incognito',
        listening
          ? 'bg-red-500/15 text-red-400'
          : surface === 'incognito'
            ? 'border border-white/25 text-white hover:bg-white/10'
            : 'xv-chatbar-secondary-btn hover:bg-white/10 text-[var(--foreground)]'
      )}
      title={listening ? 'Stop listening' : 'Speak to text'}
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
    >
      {listening ? <VoiceWaveform active /> : <Mic className="w-4 h-4" />}
    </button>
  );
}

export function ChatBarInputRow({
  uploading,
  onUploadClick,
  listening,
  onMicToggle,
  micDisabled,
  sendState,
  stopping,
  onStop,
  surface = 'dashboard',
  hideUpload = false,
  compactGo = false,
  comboAction = false,
  goOnly = false,
  hasText = false,
  children,
}: {
  uploading: boolean;
  onUploadClick: () => void;
  listening: boolean;
  onMicToggle: () => void;
  micDisabled?: boolean;
  sendState: SendButtonState;
  stopping?: boolean;
  onStop?: () => void;
  surface?: ChatbarSurface;
  hideUpload?: boolean;
  compactGo?: boolean;
  comboAction?: boolean;
  goOnly?: boolean;
  hasText?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('relative flex items-end gap-1.5', surface === 'homepage' && 'xv-chatbar-row--home')}>
      {!hideUpload && <ChatBarUploadButton onClick={onUploadClick} active={uploading} surface={surface} />}
      <div className="flex-1 min-w-0 relative">{children}</div>
      <div className="xv-chatbar-actions flex items-center gap-1.5 shrink-0">
        {goOnly ? (
          <ChatBarSendButton stopping={stopping} onStop={onStop} state={sendState} surface={surface} compact={compactGo} />
        ) : comboAction ? (
          <ChatBarComboAction
            hasText={hasText}
            listening={listening}
            onMicToggle={onMicToggle}
            micDisabled={micDisabled}
            sendState={sendState}
            stopping={stopping}
            onStop={onStop}
            surface={surface}
          />
        ) : (
          <>
            <ChatBarMicButton listening={listening} onToggle={onMicToggle} disabled={micDisabled || stopping} surface={surface} />
            <ChatBarSendButton stopping={stopping} onStop={onStop} state={sendState} surface={surface} compact={compactGo} />
          </>
        )}
      </div>
    </div>
  );
}

export function useSpeechToText(onResult: (text: string) => void) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  /** Latest full transcript for this speech session (replace, don't append). */
  const sessionTranscriptRef = useRef('');

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggle(listening: boolean, setListening: (v: boolean) => void) {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    sessionTranscriptRef.current = '';
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: {
      resultIndex: number;
      results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
    }) => {
      let interim = '';
      let finalPiece = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i]?.[0]?.transcript ?? '';
        if (e.results[i]?.isFinal) finalPiece += piece;
        else interim += piece;
      }
      if (finalPiece) {
        sessionTranscriptRef.current = `${sessionTranscriptRef.current} ${finalPiece}`.trim();
      }
      const next = `${sessionTranscriptRef.current}${interim ? ` ${interim}` : ''}`.trim();
      if (next) onResult(next);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  const supported =
    typeof window !== 'undefined' &&
    !!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  return { toggle, supported };
}

/** Modern pill chips for GitHub / Deploy toolbar */
export function ChatBarToolChip({
  icon,
  label,
  onClick,
  accent,
  connected,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: string;
  connected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="xv-chatbar-chip flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium border transition-all hover:-translate-y-px"
      style={
        accent
          ? { borderColor: `${accent}44`, background: `${accent}12`, color: 'var(--foreground)' }
          : undefined
      }
    >
      {connected ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" /> : null}
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ChatBarFuelMeter({
  remaining,
  estimate,
  onClick,
}: {
  remaining: number;
  estimate: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="xv-fuel-meter flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--card-border)]/50 bg-white/[0.03] text-[9px] sm:text-[10px] font-terminal hover:border-[var(--accent)]/40 transition-colors shrink-0"
    >
      <span className="w-1 h-1 rounded-full bg-[var(--accent)]" />
      <span className="font-semibold text-[var(--foreground)] whitespace-nowrap">
        {remaining} actions · Est. {estimate}
      </span>
    </button>
  );
}
