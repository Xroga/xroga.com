'use client';

import { useRef, useState } from 'react';
import { X, Upload, Check, Sparkles, Zap } from 'lucide-react';
import { XROGA_PROFILE_AVATARS } from '@/lib/profileAvatars';
import { cn } from '@/lib/utils';

interface AvatarPickerModalProps {
  open: boolean;
  onClose: () => void;
  currentUrl?: string | null;
  onSelect: (url: string) => void | Promise<void>;
  onUpload?: (file: File) => void | Promise<void>;
}

function AvatarGrid({
  items,
  currentUrl,
  picking,
  onPick,
}: {
  items: typeof XROGA_PROFILE_AVATARS;
  currentUrl?: string | null;
  picking: string | null;
  onPick: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-2.5 sm:gap-3">
      {items.map((avatar, i) => {
        const selected = currentUrl === avatar.url;
        const loading = picking === avatar.url;
        return (
          <button
            key={`${avatar.url}-${avatar.label}`}
            type="button"
            disabled={!!picking}
            onClick={() => onPick(avatar.url)}
            className={cn(
              'group relative aspect-square rounded-2xl overflow-hidden border-2 transition-all',
              'hover:scale-[1.06] hover:shadow-lg hover:shadow-[var(--accent)]/20',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
              selected
                ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40 scale-[1.02]'
                : 'border-[var(--card-border)]/50 hover:border-[var(--accent)]/60',
              avatar.group === 'hero' && 'ring-1 ring-purple-500/20'
            )}
            title={avatar.label}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar.url}
              alt={avatar.label}
              className="w-full h-full object-cover bg-[var(--background)]"
              loading={i < 8 ? 'eager' : 'lazy'}
              decoding="async"
            />
            <span className="absolute bottom-0 inset-x-0 py-0.5 text-[8px] font-bold text-center bg-black/55 text-white/90 truncate px-1">
              {avatar.label}
            </span>
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
          </button>
        );
      })}
    </div>
  );
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

  const photos = XROGA_PROFILE_AVATARS.filter((a) => a.group === 'photo');
  const heroes = XROGA_PROFILE_AVATARS.filter((a) => a.group === 'hero');

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
        className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[min(90vh,720px)] rounded-t-3xl sm:rounded-3xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_24px_80px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden"
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
                {XROGA_PROFILE_AVATARS.length} avatars · {photos.length} photos + {heroes.length} heroes
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

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5 space-y-6">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> Profile photos
            </h3>
            <AvatarGrid items={photos} currentUrl={currentUrl} picking={picking} onPick={(u) => void pick(u)} />
          </section>
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-purple-400" /> Hero avatars
            </h3>
            <AvatarGrid items={heroes} currentUrl={currentUrl} picking={picking} onPick={(u) => void pick(u)} />
          </section>
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
