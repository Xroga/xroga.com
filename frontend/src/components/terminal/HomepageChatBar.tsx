'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Mic, Send, Sparkles } from 'lucide-react';
import { PENDING_PROMPT_KEY } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function HomepageChatBar() {
  const [prompt, setPrompt] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text && files.length === 0) return;
    localStorage.setItem(PENDING_PROMPT_KEY, text || 'Build with attached files');
    router.push('/auth/signup');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl mx-auto xv-home-chatbar"
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
      <div
        className={cn(
          'xv-home-chatbox rounded-2xl border backdrop-blur-xl transition-all duration-300',
          dragOver && 'ring-2 ring-[var(--accent)]/60 scale-[1.01]'
        )}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-black/10 md:border-white/10">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs font-terminal xv-home-chatbar-meta">
            <Sparkles className="w-3 h-3 text-[var(--accent)]" />
            <span>50 free actions</span>
            <span className="opacity-40">·</span>
            <span className="hidden sm:inline">Swarm online</span>
          </div>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-black/5 md:border-white/10">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="text-[10px] px-2 py-1 rounded-lg bg-black/10 md:bg-white/10 xv-home-chatbar-meta truncate max-w-[140px]"
              >
                {f.name}
              </span>
            ))}
          </div>
        )}

        <div className="relative flex items-center px-3 py-3 gap-2">
          <span className="xv-home-chatbar-prompt font-terminal text-sm shrink-0">&gt;</span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask XROGA to build anything..."
            className="flex-1 bg-transparent text-sm font-terminal focus:outline-none min-w-0 xv-home-chatbar-input"
          />
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-2 rounded-lg xv-home-chatbar-icon hover:bg-black/5 md:hover:bg-white/10 transition-colors group relative"
            title="Upload any file — images, video, audio, documents. No size limit."
            aria-label="Attach files"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button type="button" className="p-2 rounded-lg xv-home-chatbar-icon hidden sm:block" aria-label="Voice">
            <Mic className="w-4 h-4" />
          </button>
          <button
            type="submit"
            disabled={!prompt.trim() && files.length === 0}
            className="p-2.5 rounded-xl bg-[var(--accent)] text-[var(--background)] disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform shrink-0"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
