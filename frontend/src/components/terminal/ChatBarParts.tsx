'use client';

import { useEffect, useRef } from 'react';
import { X, FileText, Image as ImageIcon, Film, Mic, MicOff } from 'lucide-react';
import { UploadAnimButton } from '@/components/ui/UploadAnimButton';
import { SendDiscoverButton } from '@/components/ui/Uiverse';
import { getChatSuggestions, type ChatSuggestion } from '@/lib/chatSuggestions';
import { cn } from '@/lib/utils';

const FILE_ROWS = 4;

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
                className="relative flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg bg-white/5 border border-[var(--card-border)] w-[120px]"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                ) : (
                  <Icon className="w-4 h-4 text-[var(--muted)] shrink-0" />
                )}
                <span className="flex-1 truncate text-[var(--foreground)]">{f.name}</span>
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
      <div className="xv-drag-drop-card px-6 py-4 rounded-2xl border border-[var(--accent)]/40 bg-[var(--card)]/90 shadow-xl text-center animate-pulse">
        <p className="text-sm font-semibold text-[var(--foreground)]">Drag & drop</p>
        <p className="text-[10px] text-[var(--muted)] mt-1">Images, video, audio, documents</p>
      </div>
    </div>
  );
}

export function ChatBarSuggestions({
  prompt,
  visible,
  onSelect,
}: {
  prompt: string;
  visible: boolean;
  onSelect: (s: ChatSuggestion) => void;
}) {
  if (!visible || prompt.trim().length < 1) return null;
  const suggestions = getChatSuggestions(prompt, 5);
  if (suggestions.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 bottom-full mb-2 z-30 px-1">
      <div className="xv-chat-suggestions rounded-xl border border-[var(--card-border)] bg-[var(--card)]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s)}
            className="w-full text-left px-3 py-2.5 text-xs hover:bg-white/5 flex items-center gap-2 border-b border-[var(--card-border)]/30 last:border-0 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="font-medium text-[var(--foreground)] shrink-0">{s.label}</span>
            <span className="text-[var(--muted)] truncate">{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatBarMicButton({
  listening,
  onToggle,
  disabled,
}: {
  listening: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'xv-mic-btn p-2 rounded-xl border transition-all shrink-0',
        listening
          ? 'border-red-400/60 bg-red-500/15 text-red-400 animate-pulse'
          : 'border-[var(--card-border)]/60 hover:bg-white/10 text-[var(--foreground)]'
      )}
      title={listening ? 'Stop listening' : 'Speak to text'}
      aria-label={listening ? 'Stop voice input' : 'Start voice input'}
    >
      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}

export function ChatBarInputControls({
  uploading,
  onUploadClick,
  listening,
  onMicToggle,
  micDisabled,
  loading,
  canSend,
}: {
  uploading: boolean;
  onUploadClick: () => void;
  listening: boolean;
  onMicToggle: () => void;
  micDisabled?: boolean;
  loading: boolean;
  canSend: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <UploadAnimButton active={uploading} onClick={onUploadClick} className="xv-upload-anim--compact" />
      <div className="flex items-center gap-1">
        <ChatBarMicButton listening={listening} onToggle={onMicToggle} disabled={micDisabled || loading} />
        {loading ? (
          <div className="w-10 h-10 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <SendDiscoverButton disabled={!canSend} loading={loading} />
        )}
      </div>
    </div>
  );
}

export function useSpeechToText(onResult: (text: string) => void) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

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

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: { results: Iterable<{ 0: { transcript: string } }> }) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      if (transcript) onResult(transcript);
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
