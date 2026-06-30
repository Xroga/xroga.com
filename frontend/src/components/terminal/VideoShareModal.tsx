'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildVideoPlatformPacks, shareVideoToPlatform, type VideoPlatformPack } from '@/lib/videoSharePack';
import type { VideoFormatId } from '@/lib/videoFormat';
import toast from 'react-hot-toast';

interface VideoShareModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  videoUrl: string;
  videoFormat: VideoFormatId;
}

const STYLES: Partial<Record<VideoPlatformPack['id'], string>> = {
  youtube_shorts: 'from-red-500/15 border-red-500/30',
  youtube: 'from-red-500/15 border-red-500/30',
  instagram_reels: 'from-pink-500/15 border-pink-500/30',
  tiktok: 'from-cyan-500/15 border-cyan-500/30',
  facebook_reels: 'from-blue-500/15 border-blue-500/30',
  facebook_video: 'from-blue-500/15 border-blue-500/30',
};

export function VideoShareModal({ open, onClose, title, videoUrl, videoFormat }: VideoShareModalProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const packs = useMemo(() => buildVideoPlatformPacks(title, videoFormat), [title, videoFormat]);

  if (!open || typeof document === 'undefined') return null;

  async function handlePick(pack: VideoPlatformPack) {
    setPicked(pack.id);
    await shareVideoToPlatform(pack, videoUrl);
    toast.success(`${pack.name}: opened — upload your video file`, { duration: 4500 });
    setTimeout(() => {
      setPicked(null);
      onClose();
    }, 600);
  }

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/55" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-[var(--accent)]" />
            <p className="text-sm font-bold">Post video to social</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--muted)]/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-4 pt-2 text-[10px] text-[var(--muted)]">
          {videoFormat === 'shorts_reels'
            ? 'Shorts / Reels platforms — caption copied, upload your MP4'
            : 'YouTube & landscape video platforms'}
        </p>
        <div className="p-3 grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              disabled={picked === pack.id}
              onClick={() => void handlePick(pack)}
              className={cn(
                'text-left rounded-xl border bg-gradient-to-br px-3 py-2.5 transition-all hover:scale-[1.02]',
                STYLES[pack.id] ?? 'border-[var(--card-border)]',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold">{pack.emoji} {pack.name}</span>
                {picked === pack.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <ExternalLink className="h-3 w-3 opacity-40" />}
              </div>
              <p className="text-[9px] mt-1 line-clamp-2 opacity-80">{pack.title}</p>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
