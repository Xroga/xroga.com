'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { autocorrectText } from '@/lib/chatSuggestions';
import {
  ChatBarDragOverlay,
  ChatBarFileStrip,
  ChatBarInputRow,
  useSpeechToText,
} from '@/components/terminal/ChatBarParts';
import type { SendButtonState } from '@/components/terminal/ChatBarButtons';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const MAX_ROWS = 6;
const LINE_HEIGHT = 22;

export function HomepageChatBar() {
  const [prompt, setPrompt] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [sendState, setSendState] = useState<SendButtonState>('idle');
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

  function handleBlur() {
    if (prompt.trim()) {
      const fixed = autocorrectText(prompt);
      if (fixed !== prompt) setPrompt(fixed);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = autocorrectText(prompt.trim());
    setSendState('sending');
    localStorage.setItem(PENDING_PROMPT_KEY, text || 'Build with attached files');
    setTimeout(() => setSendState('launched'), 400);
    setTimeout(() => router.push('/auth/signup'), 900);
  }

  return (
    <div className="w-full max-w-2xl mx-auto relative">
      <form onSubmit={handleSubmit} className="w-full">
        <div
          className={cn(
            'xv-home-chatbox relative rounded-2xl overflow-hidden transition-all duration-300',
            'bg-white text-black border-2 border-[#006aff]/35',
            'shadow-[0_16px_56px_rgba(0,106,255,0.15),0_8px_24px_rgba(0,0,0,0.12)]',
            dragOver && 'ring-2 ring-[#006aff]/50 scale-[1.01] border-[#006aff]/60'
          )}
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

          <ChatBarFileStrip files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))} />

          <div className="px-3 sm:px-4 py-3 sm:py-4 xv-home-chatbar-inner">
            <ChatBarInputRow
              surface="homepage"
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
              sendState={sendState}
            >
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="Describe what you want to build…"
                rows={2}
                className={cn(
                  'w-full px-1 py-2 resize-none min-h-[52px] max-h-[140px]',
                  'bg-transparent focus:outline-none text-sm sm:text-base leading-relaxed',
                  'text-black placeholder:text-neutral-500 font-medium'
                )}
              />
            </ChatBarInputRow>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>
        </div>
      </form>
    </div>
  );
}
