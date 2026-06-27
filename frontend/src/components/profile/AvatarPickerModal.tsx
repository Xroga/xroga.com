'use client';

import { useRef, useState } from 'react';
import { X, Upload, Check, Sparkles } from 'lucide-react';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { cn } from '@/lib/utils';

interface AvatarPickerModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onSelect: (url: string) => void | Promise<void>;
  onUpload?: (file: File) => void | Promise<void>;
}

export function AvatarPickerModal({
  open,
  onClose,
  currentUrl,
  onSelect,
  onUpload,
}: AvatarPickerModalProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function pick(url: string) {
    setPicking(url);
    try {
      await onSelect(url);
      onClose();
    } finally {
      setPicking(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
        className="relative w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[min(90vh,820px)] rounded-t-3xl sm:rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
      >
        <div className="shrink-0 px-5 sm:px-6 py-5 border-b border-[var(--card-border)]/50 bg-gradient-to-r from-[var(--accent)]/10 via-transparent to-purple-500/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--accent)]">
                  Profile
                </span>
              </div>
              <h2 id="avatar-picker-title" className="font-bold text-xl sm:text-2xl tracking-tight">
                Choose your avatar
              </h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
                {XROGA_PROFILE_AVATARS.length} curated avatars · or upload your own
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 border border-transparent hover:border-[var(--card-border)] transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5">
          <div className="grid grid-cols-4 xs:grid-cols-5 sm:grid-cols-6 md:grid-cols-7 gap-2 sm:gap-2.5">
            {XROGA_PROFILE_AVATARS.map((url, i) => {
              const selected = currentUrl === url;
              const loading = picking === url;
              return (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  disabled={!!picking}
                  onClick={() => void pick(url)}
                  className={cn(
                    'group relative aspect-square rounded-2xl overflow-hidden border-2 transition-all',
                    'hover:scale-[1.06] hover:shadow-lg hover:shadow-[var(--accent)]/20',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                    selected
                      ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40 scale-[1.02]'
                      : 'border-[var(--card-border)]/50 hover:border-[var(--accent)]/60'
                  )}
                  title={`Avatar ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Avatar option ${i + 1}`}
                    className="w-full h-full object-cover"
                    loading={i < 14 ? 'eager' : 'lazy'}
                    decoding="async"
                  />
                  {selected && (
                    <span className="absolute inset-0 bg-[var(--accent)]/25 flex items-center justify-center backdrop-blur-[1px]">
                      <Check className="w-5 h-5 text-white drop-shadow-md" />
                    </span>
                  )}
                  {loading && (
                    <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </span>
                  )}
                  <span className="absolute bottom-1 right-1 text-[8px] font-bold px-1 py-0.5 rounded bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-[var(--card-border)]/50 bg-[var(--background)]/40 backdrop-blur-sm">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onUpload) void onUpload(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-[var(--card-border)] bg-white/[0.04] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 text-sm font-semibold transition-all"
          >
            <Upload className="w-4 h-4" /> Upload custom photo
          </button>
        </div>
      </div>
    </div>
  );
}
