'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSocialPlatformPacks, shareToPlatform, type SocialPlatformPack } from '@/lib/socialSharePack';
import toast from 'react-hot-toast';

interface SocialShareModalProps {
  open: boolean;
  onClose: () => void;
  prompt?: string;
  concisePrompt?: string;
  overlayText?: string;
  imageUrls: string[];
  primaryImageUrl?: string;
}

const PLATFORMS: Array<{ id: SocialPlatformPack['id']; label: string; color: string }> = [
  { id: 'youtube', label: 'YouTube', color: 'text-red-500 border-red-500/30 bg-red-500/10' },
  { id: 'x', label: 'X', color: 'text-[var(--foreground)] border-[var(--card-border)] bg-[var(--card)]' },
  { id: 'facebook', label: 'Facebook', color: 'text-blue-500 border-blue-500/30 bg-blue-500/10' },
  { id: 'instagram', label: 'Instagram', color: 'text-pink-500 border-pink-500/30 bg-pink-500/10' },
  { id: 'pinterest', label: 'Pinterest', color: 'text-red-600 border-red-600/30 bg-red-600/10' },
  { id: 'linkedin', label: 'LinkedIn', color: 'text-sky-500 border-sky-500/30 bg-sky-500/10' },
  { id: 'tiktok', label: 'TikTok', color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' },
  { id: 'threads', label: 'Threads', color: 'text-[var(--foreground)] border-[var(--card-border)] bg-[var(--card)]' },
];

export function SocialShareModal({
  open,
  onClose,
  prompt,
  concisePrompt,
  overlayText,
  imageUrls,
  primaryImageUrl,
}: SocialShareModalProps) {
  const [picked, setPicked] = useState<string | null>(null);

  const packs = useMemo(
    () =>
      buildSocialPlatformPacks({
        prompt,
        concisePrompt,
        overlayText,
        imageUrls,
        primaryImageUrl,
      }),
    [prompt, concisePrompt, overlayText, imageUrls, primaryImageUrl]
  );

  if (!open || typeof document === 'undefined') return null;

  async function handlePick(pack: SocialPlatformPack) {
    setPicked(pack.id);
    await shareToPlatform(pack);
    toast.success(`${pack.name}: title, tags & description copied`);
    setTimeout(() => {
      setPicked(null);
      onClose();
    }, 600);
  }

  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close" />
      <div
        role="dialog"
        aria-label="Share to social media"
        className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-[var(--accent)]" />
            <p className="text-sm font-bold">Post to social</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--muted)]/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3 space-y-2 max-h-[min(70vh,420px)] overflow-y-auto">
          <p className="text-[10px] text-[var(--muted)]">
            Tap a platform — viral title, tags &amp; description copy automatically, then the site opens.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {packs.map((pack) => {
              const meta = PLATFORMS.find((p) => p.id === pack.id);
              return (
                <button
                  key={pack.id}
                  type="button"
                  disabled={picked === pack.id}
                  onClick={() => handlePick(pack)}
                  className={cn(
                    'text-left rounded-xl border px-3 py-2.5 transition-all hover:scale-[1.01] disabled:opacity-60',
                    meta?.color ?? 'border-[var(--card-border)]'
                  )}
                >
                  <p className="text-[11px] font-bold">{pack.name}</p>
                  <p className="text-[9px] opacity-80 line-clamp-2 mt-0.5">{pack.title}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
