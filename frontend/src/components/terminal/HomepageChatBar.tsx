'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { ChatbarShell } from '@/components/ui/Uiverse';
import {
  ChatBarDragOverlay,
  ChatBarFileStrip,
  ChatBarInputControls,
  ChatBarSuggestions,
  useSpeechToText,
} from './ChatBarParts';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const MAX_ROWS = 8;
const LINE_HEIGHT = 22;

export function HomepageChatBar() {
  const [prompt, setPrompt] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  const appendSpeech = useCallback((text: string) => setPrompt((p) => (p ? `${p} ${text}` : text)), []);
  const speech = useSpeechToText(appendSpeech);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    const incoming = Array.from(list);
    setTimeout(() => {
      setFiles((prev) => [...prev, ...incoming]);
      setUploading(false);
    }, Math.min(1200, 300 + incoming.length * 150));
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = LINE_HEIGHT * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [prompt]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text && files.length === 0) return;
    localStorage.setItem(PENDING_PROMPT_KEY, text || 'Build with attached files');
    router.push('/auth/signup');
  }

  return (
    <div className="w-full max-w-3xl mx-auto relative">
      <ChatBarSuggestions
        prompt={prompt}
        visible={showSuggestions}
        onSelect={(s) => {
          setPrompt(s.text);
          setShowSuggestions(false);
        }}
      />

      <form onSubmit={handleSubmit} className="w-full">
        <ChatbarShell
          className={cn('relative xv-home-chatbar-shell', dragOver && 'ring-2 ring-[var(--accent)]/50')}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <ChatBarDragOverlay active={dragOver} />

          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--card-border)]/40">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span className="text-[10px] sm:text-xs font-terminal text-[var(--muted)]">
              50 free actions · Swarm online
            </span>
          </div>

          <ChatBarFileStrip files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))} />

          <div className="px-3 py-3">
            <div className="relative flex items-end gap-1">
              <span className="absolute left-2 bottom-3 text-sm font-terminal text-[var(--foreground)] opacity-50 z-10">
                &gt;
              </span>
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Ask Xroga AI to do everything..."
                rows={1}
                className={cn(
                  'flex-1 pl-7 pr-2 py-2.5 rounded-xl resize-none max-h-[176px]',
                  'bg-transparent focus:outline-none text-sm font-terminal leading-[22px]',
                  'text-[var(--foreground)] placeholder:text-[var(--muted)]'
                )}
              />
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <ChatBarInputControls
                uploading={uploading}
                onUploadClick={() => fileRef.current?.click()}
                listening={listening}
                onMicToggle={() => {
                  if (!speech.supported) {
                    toast.error('Voice input not supported in this browser');
                    return;
                  }
                  speech.toggle(listening, setListening);
                }}
                micDisabled={!speech.supported}
                loading={false}
                canSend={!!prompt.trim() || files.length > 0}
              />
            </div>
          </div>
        </ChatbarShell>
      </form>
    </div>
  );
}
