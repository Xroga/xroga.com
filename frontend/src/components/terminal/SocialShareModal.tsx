'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, ExternalLink, Share2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  buildSocialPlatformPacks,
  shareToPlatform,
  type SocialPlatformId,
  type SocialPlatformPack,
} from '@/lib/socialSharePack';
import { useThemeStore } from '@/store/useThemeStore';
import toast from 'react-hot-toast';

const PLATFORM_STYLES: Record<SocialPlatformId, string> = {
  youtube: 'from-red-600/20 to-red-500/5 border-red-500/30 text-red-500',
  x: 'from-zinc-500/20 to-zinc-400/5 border-zinc-400/30 text-[var(--foreground)]',
  facebook: 'from-blue-600/20 to-blue-500/5 border-blue-500/30 text-blue-500',
  instagram: 'from-pink-600/20 to-purple-500/5 border-pink-500/30 text-pink-500',
  pinterest: 'from-red-700/20 to-red-600/5 border-red-600/30 text-red-600',
  linkedin: 'from-sky-600/20 to-sky-500/5 border-sky-500/30 text-sky-500',
  tiktok: 'from-cyan-500/20 to-pink-500/5 border-cyan-500/30 text-cyan-400',
  threads: 'from-zinc-600/20 to-zinc-500/5 border-zinc-500/30 text-[var(--foreground)]',
};

interface SocialShareModalProps {
  open: boolean;
  onClose: () => void;
  prompt?: string;
  concisePrompt?: string;
  overlayText?: string;
  imageUrls: string[];
  primaryImageUrl?: string;
}

export function SocialShareModal({
  open,
  onClose,
  prompt,
  concisePrompt,
  overlayText,
  imageUrls,
  primaryImageUrl,
}: SocialShareModalProps) {
  const siteTheme = useThemeStore((s) => s.theme);
  const [selected, setSelected] = useState<SocialPlatformId | null>(null);
  const [copiedId, setCopiedId] = useState<SocialPlatformId | null>(null);

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

  const active = packs.find((p) => p.id === selected) ?? packs[0];

  if (!open || typeof document === 'undefined') return null;

  const themeClass =
    siteTheme === 'white'
      ? 'xv-img-lightbox--white'
      : siteTheme === 'black'
        ? 'xv-img-lightbox--black'
        : 'xv-img-lightbox--gray';

  async function handlePlatformClick(pack: SocialPlatformPack) {
    setSelected(pack.id);
    await shareToPlatform(pack);
    toast.success(`Copied for ${pack.name} — composer opened in new tab`);
  }

  async function copyPack(pack: SocialPlatformPack) {
    try {
      await navigator.clipboard.writeText(pack.clipboardText);
      setCopiedId(pack.id);
      toast.success(`Copied ${pack.name} post`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Copy failed');
    }
  }

  return createPortal(
    <div className={cn('fixed inset-0 z-[230] flex items-center justify-center p-2 sm:p-4', themeClass)}>
      <button type="button" className="absolute inset-0 xv-img-lightbox-backdrop" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--card-border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Share2 className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">Post to social media</h2>
              <p className="text-[10px] text-[var(--muted)]">
                Viral title, tags &amp; description — {imageUrls.length} image{imageUrls.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--muted)]/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="p-3 overflow-y-auto flex-1 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Pick a platform</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {packs.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => handlePlatformClick(pack)}
                className={cn(
                  'flex flex-col items-start gap-1 p-2.5 rounded-xl border bg-gradient-to-br text-left transition-all hover:scale-[1.02] hover:shadow-md',
                  PLATFORM_STYLES[pack.id],
                  selected === pack.id && 'ring-2 ring-[var(--accent)]/40'
                )}
              >
                <span className="text-[11px] font-bold">{pack.name}</span>
                <span className="text-[9px] opacity-80 line-clamp-2">{pack.title}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-[var(--foreground)]">{active.name} — viral pack</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => copyPack(active)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border border-[var(--card-border)] hover:bg-[var(--card)]"
                  >
                    {copiedId === active.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePlatformClick(active)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open {active.name}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-[11px]">
                <p>
                  <span className="font-semibold text-[var(--muted)]">Title: </span>
                  {active.title}
                </p>
                <p>
                  <span className="font-semibold text-[var(--muted)]">Tags: </span>
                  {active.tags.slice(0, 8).join(', ')}
                </p>
                <p>
                  <span className="font-semibold text-[var(--muted)]">Hashtags: </span>
                  {active.hashtags}
                </p>
                <pre className="whitespace-pre-wrap text-[10px] text-[var(--foreground)]/90 leading-relaxed max-h-40 overflow-y-auto rounded-lg bg-[var(--card)]/80 p-2 border border-[var(--card-border)]">
                  {active.description}
                </pre>
              </div>
            </div>
          )}
        </div>

        <footer className="px-4 py-2 border-t border-[var(--card-border)] text-[10px] text-[var(--muted)] shrink-0">
          Click a platform to copy title, tags, description &amp; image links, then open that site to paste and upload.
        </footer>
      </div>
    </div>,
    document.body
  );
}
