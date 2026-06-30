'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, Copy, Check, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSocialPlatformPacks, type SocialPlatformPack } from '@/lib/socialSharePack';
import { shareToPlatform } from '@/lib/shareImage';

interface SocialShareModalProps {
  open: boolean;
  onClose: () => void;
  prompt?: string;
  concisePrompt?: string;
  overlayText?: string;
  imageUrls: string[];
  primaryImageUrl?: string;
  contentType?: string;
  aspectFormat?: string;
}

const PLATFORM_STYLES: Record<SocialPlatformPack['id'], string> = {
  youtube: 'from-red-500/15 to-red-600/5 border-red-500/25 hover:border-red-500/50',
  x: 'from-[var(--foreground)]/5 to-transparent border-[var(--card-border)] hover:border-[var(--foreground)]/20',
  facebook: 'from-blue-500/15 to-blue-600/5 border-blue-500/25 hover:border-blue-500/50',
  instagram: 'from-pink-500/15 via-purple-500/10 to-orange-500/5 border-pink-500/25 hover:border-pink-500/50',
  pinterest: 'from-red-600/15 to-red-700/5 border-red-600/25 hover:border-red-600/50',
  linkedin: 'from-sky-500/15 to-sky-600/5 border-sky-500/25 hover:border-sky-500/50',
  tiktok: 'from-cyan-500/15 to-pink-500/10 border-cyan-500/25 hover:border-cyan-500/50',
  threads: 'from-[var(--foreground)]/5 to-transparent border-[var(--card-border)] hover:border-[var(--foreground)]/20',
};

export function SocialShareModal({
  open,
  onClose,
  prompt,
  concisePrompt,
  overlayText,
  imageUrls,
  primaryImageUrl,
  contentType,
  aspectFormat,
}: SocialShareModalProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const previewUrl = primaryImageUrl || imageUrls[0] || '';
  const previewAspect =
    aspectFormat === '16:9' || contentType === 'thumbnail' ? 'aspect-video' : aspectFormat === '9:16' ? 'aspect-[9/16] max-h-36' : 'aspect-square max-h-36';

  const packs = useMemo(
    () =>
      buildSocialPlatformPacks({
        prompt,
        concisePrompt,
        overlayText,
        imageUrls,
        primaryImageUrl,
        contentType,
      }),
    [prompt, concisePrompt, overlayText, imageUrls, primaryImageUrl, contentType],
  );

  if (!open || typeof document === 'undefined') return null;

  async function handlePick(pack: SocialPlatformPack) {
    setPicked(pack.id);
    await shareToPlatform(pack, previewUrl || undefined);
    setTimeout(() => {
      setPicked(null);
      onClose();
    }, 700);
  }

  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div
        role="dialog"
        aria-label="Share to social media"
        className="relative z-10 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--card-border)] bg-gradient-to-r from-[var(--accent)]/8 to-transparent">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)]/15">
              <Share2 className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Post to social</p>
              <p className="text-[10px] text-[var(--muted)] truncate">
                Tap a platform — viral copy + image copied automatically
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--muted)]/10 shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {previewUrl && (
          <div className="px-4 pt-3">
            <div className={cn('overflow-hidden rounded-xl border border-[var(--card-border)] bg-black/5', previewAspect)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            </div>
          </div>
        )}

        <div className="p-3 sm:p-4 space-y-2 max-h-[min(55vh,400px)] overflow-y-auto">
          <div className="grid grid-cols-2 gap-2">
            {packs.map((pack) => {
              const isPicked = picked === pack.id;
              const isExpanded = expanded === pack.id;
              return (
                <div key={pack.id} className="flex flex-col">
                  <button
                    type="button"
                    disabled={isPicked}
                    onClick={() => handlePick(pack)}
                    className={cn(
                      'text-left rounded-xl border bg-gradient-to-br px-3 py-2.5 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60',
                      PLATFORM_STYLES[pack.id],
                    )}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-bold flex items-center gap-1">
                        <span className="text-xs opacity-80">{pack.emoji}</span>
                        {pack.name}
                      </span>
                      {isPicked ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <ExternalLink className="h-3 w-3 opacity-40" />
                      )}
                    </div>
                    <p className="text-[10px] font-medium mt-1 line-clamp-2 leading-snug opacity-90">{pack.title}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : pack.id)}
                    className="mt-0.5 flex items-center gap-0.5 text-[9px] text-[var(--muted)] hover:text-[var(--foreground)] px-1"
                  >
                    <Copy className="h-2.5 w-2.5" />
                    {isExpanded ? 'Hide preview' : 'Preview caption'}
                  </button>
                  {isExpanded && (
                    <p className="mt-1 text-[9px] text-[var(--muted)] leading-relaxed px-1 line-clamp-4 whitespace-pre-wrap">
                      {pack.clipboardText.slice(0, 280)}
                      {pack.clipboardText.length > 280 ? '…' : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
