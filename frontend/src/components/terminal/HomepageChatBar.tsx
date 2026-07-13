'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { autocorrectText } from '@/lib/chatSuggestions';
import {
  ChatBarDragOverlay,
  ChatBarInputRow,
  useSpeechToText,
} from '@/components/terminal/ChatBarParts';
import { ChatBarFileGrid } from '@/components/terminal/ChatBarFileGrid';
import type { SendButtonState } from '@/components/terminal/ChatBarButtons';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const MAX_ROWS = 6;
const LINE_HEIGHT = 22;

const TYPEWRITER_FEATURES = [
  'Build a full-stack SaaS with auth and billing…',
  'Generate images, code, and deploy to Vercel…',
  'Run browser automations with zero API cost…',
  'Create games, apps, and automations with AI Swarm…',
  'Scrape data, write scripts, and ship in minutes…',
];

function renameFile(file: File, newName: string) {
  return new File([file], newName, { type: file.type, lastModified: file.lastModified });
}

function useTypewriterPlaceholder(active: boolean) {
  const [text, setText] = useState('');
  const idxRef = useRef(0);
  const charRef = useRef(0);
  const deletingRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    const tick = (): number => {
      const phrases = TYPEWRITER_FEATURES;
      const phrase = phrases[idxRef.current % phrases.length];
      if (!deletingRef.current) {
        charRef.current += 1;
        setText(phrase.slice(0, charRef.current));
        if (charRef.current >= phrase.length) {
          deletingRef.current = true;
          return 2200;
        }
        return 42;
      }
      charRef.current -= 1;
      setText(phrase.slice(0, charRef.current));
      if (charRef.current <= 0) {
        deletingRef.current = false;
        idxRef.current += 1;
        return 400;
      }
      return 24;
    };

    let timeout: ReturnType<typeof setTimeout>;
    const run = (delay: number) => {
      timeout = setTimeout(() => run(tick()), delay);
    };
    run(600);
    return () => clearTimeout(timeout);
  }, [active]);

  return text;
}

export function HomepageChatBar() {
  const [prompt, setPrompt] = useState('');
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [sendState, setSendState] = useState<SendButtonState>('idle');
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const typewriter = useTypewriterPlaceholder(!prompt && !focused);

  const appendSpeech = useCallback((text: string) => setPrompt((p) => (p ? `${p} ${text}` : text)), []);
  const speech = useSpeechToText(appendSpeech);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    const incoming = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (!incoming.length) {
      setUploading(false);
      return;
    }
    setTimeout(() => {
      setFiles((prev) => [...prev, ...incoming]);
      setUploading(false);
    }, Math.min(1200, 300 + incoming.length * 150));
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item?.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        const dt = new DataTransfer();
        imageFiles.forEach((f) => dt.items.add(f));
        addFiles(dt.files);
        toast.success(imageFiles.length === 1 ? 'Image pasted' : `${imageFiles.length} images pasted`);
      }
    },
    [addFiles]
  );

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = LINE_HEIGHT * MAX_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  }, [prompt]);

  function handleBlur() {
    setFocused(false);
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
            'xv-home-chatbar-shell xv-home-chatbox relative rounded-2xl overflow-hidden transition-all duration-300',
            'bg-transparent backdrop-blur-md border border-[#006aff]/35',
            'shadow-[0_16px_56px_rgba(0,106,255,0.12),0_4px_16px_rgba(0,0,0,0.08)]',
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

          <ChatBarFileGrid
            files={files}
            onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))}
            onRename={(i, name) =>
              setFiles((prev) => prev.map((f, j) => (j === i ? renameFile(f, name) : f)))
            }
          />

          <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 pt-0 xv-home-chatbar-inner">
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
              comboAction
              hasText={!!prompt.trim()}
            >
              <div className="relative w-full">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onPaste={handlePaste}
                  onBlur={handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder=""
                  rows={2}
                  className={cn(
                    'w-full px-1 py-1 resize-none min-h-[44px] max-h-[120px]',
                    'bg-transparent focus:outline-none text-sm sm:text-base leading-relaxed',
                    'xv-home-chatbar-input font-medium'
                  )}
                />
                {!prompt && !focused && (
                  <div
                    className="absolute left-1 top-1 right-1 pointer-events-none text-sm sm:text-base leading-relaxed text-white/45 font-medium xv-typewriter-cursor line-clamp-2"
                    aria-hidden
                  >
                    {typewriter}
                  </div>
                )}
              </div>
            </ChatBarInputRow>
            <p className="text-[10px] text-white/45 font-medium mt-1 pl-1">
              Describe what you want to build
            </p>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
          </div>
        </div>
      </form>
    </div>
  );
}
