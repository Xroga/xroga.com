'use client';

import { useRef, useState } from 'react';
import { X, Upload, Check } from 'lucide-react';
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg max-h-[90vh] rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]/60 shrink-0">
          <div>
            <h2 className="font-bold text-lg">Choose profile photo</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">Pick an avatar or upload your own</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
            {XROGA_PROFILE_AVATARS.map((url, i) => {
              const selected = currentUrl === url;
              const loading = picking === url;
              return (
                <button
                  key={url}
                  type="button"
                  disabled={!!picking}
                  onClick={() => void pick(url)}
                  className={cn(
                    'relative aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105',
                    selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40' : 'border-[var(--card-border)]/60 hover:border-[var(--accent)]/50'
                  )}
                  title={`Avatar ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {selected && (
                    <span className="absolute inset-0 bg-[var(--accent)]/20 flex items-center justify-center">
                      <Check className="w-5 h-5 text-white drop-shadow" />
                    </span>
                  )}
                  {loading && (
                    <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 px-5 py-4 border-t border-[var(--card-border)]/60 flex gap-2">
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
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--card-border)] hover:border-[var(--accent)]/40 text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload custom photo
          </button>
        </div>
      </div>
    </div>
  );
}
