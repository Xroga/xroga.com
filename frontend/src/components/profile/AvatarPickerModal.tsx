'use client';

import { useRef, useState } from 'react';
import { X, Upload, Check, Camera, Loader2 } from 'lucide-react';
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
  const [uploading, setUploading] = useState(false);
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

  async function handleFile(file: File) {
    if (!onUpload) return;
    setUploading(true);
    try {
      await onUpload(file);
      onClose();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-picker-title"
        className="relative w-full sm:max-w-md max-h-[92vh] rounded-t-[28px] sm:rounded-[28px] border border-white/10 bg-[#1a1b26] shadow-[0_32px_80px_rgba(0,0,0,0.55)] flex flex-col overflow-hidden"
      >
        <div className="shrink-0 px-5 py-5 border-b border-white/8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-[#5865f2] to-[#006aff] flex items-center justify-center">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/70">
                  Profile
                </span>
              </div>
              <h2 id="avatar-picker-title" className="font-bold text-xl tracking-tight text-white">
                Choose your avatar
              </h2>
              <p className="text-xs text-white/55 mt-1 max-w-sm">
                Pick a profile photo or upload your own
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/15 text-white/80"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/45 mb-2.5">
              Profile photos
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
              {XROGA_PROFILE_AVATARS.map((avatar, i) => {
                const selected = currentUrl === avatar.url;
                const loading = picking === avatar.url;
                return (
                  <button
                    key={avatar.url}
                    type="button"
                    disabled={!!picking || uploading}
                    onClick={() => void pick(avatar.url)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        'relative w-full aspect-square max-w-[88px] rounded-xl overflow-hidden border-2 transition-all hover:scale-105 block',
                        selected
                          ? 'border-[#fffc00] ring-2 ring-[#fffc00]/40'
                          : 'border-white/15 hover:border-[#5865f2]/60'
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar.url}
                        alt={avatar.label}
                        className="w-full h-full object-cover"
                        loading={i < 5 ? 'eager' : 'lazy'}
                      />
                      {selected && (
                        <span className="absolute inset-0 bg-[#5865f2]/30 flex items-center justify-center">
                          <Check className="w-5 h-5 text-white" />
                        </span>
                      )}
                      {loading && (
                        <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </span>
                      )}
                    </span>
                    <span className="text-[9px] font-semibold text-white/50">{avatar.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="shrink-0 px-4 sm:px-5 py-4 border-t border-white/8 bg-[#1e1f2a]">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={uploading || !!picking}
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#5865f2] to-[#006aff] text-white text-sm font-bold shadow-lg shadow-[#5865f2]/25 hover:opacity-95 transition-opacity disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading…' : 'Upload custom photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
