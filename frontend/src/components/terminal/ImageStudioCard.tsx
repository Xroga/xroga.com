'use client';

import type { ComponentType } from 'react';
import { useState } from 'react';
import {
  Download,
  Copy,
  Share2,
  Wand2,
  Sparkles,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyImageToClipboard, downloadImage } from '@/lib/imageStudioUtils';
import { ImageEditModal } from './ImageEditModal';
import toast from 'react-hot-toast';

interface ImageStudioCardProps {
  src: string;
  alt?: string;
  provider?: string;
  caption?: string;
  generating?: boolean;
  className?: string;
}

export function ImageGeneratingAnimation({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'xv-image-gen-card relative overflow-hidden rounded-2xl border border-[#006aff]/25 bg-gradient-to-br from-[#006aff]/10 via-purple-500/5 to-transparent p-6',
        className
      )}
    >
      <div className="absolute inset-0 xv-image-shimmer pointer-events-none" />
      <div className="relative flex flex-col items-center justify-center gap-4 min-h-[220px]">
        <div className="relative">
          <span className="absolute inset-0 rounded-full bg-[#006aff]/30 animate-ping" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#006aff]/20 border border-[#006aff]/40">
            <Sparkles className="h-7 w-7 text-[#60a5fa] xv-image-sparkle" />
          </span>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-[var(--foreground)]">Generating your image</p>
          <p className="text-[11px] text-[var(--muted)]">Agnes AI · rendering pixels…</p>
        </div>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-[#006aff]/60 xv-image-dot"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ImageStudioCard({
  src,
  alt = 'Generated image',
  provider,
  caption,
  generating,
  className,
}: ImageStudioCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);

  if (generating) {
    return <ImageGeneratingAnimation className={className} />;
  }

  function handlePost() {
    toast('Post flow — connect social in Integrations', { icon: '📤' });
  }

  return (
    <>
      <div
        className={cn(
          'xv-image-studio-card group my-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] shadow-xl shadow-black/20',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/8 bg-black/20">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#006aff]/20">
              <Sparkles className="h-3.5 w-3.5 text-[#60a5fa]" />
            </span>
            <span className="text-[11px] font-semibold text-[var(--foreground)] truncate">Image Studio</span>
            {provider && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-[var(--muted)] shrink-0">
                {provider}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="inline-flex items-center gap-0.5 text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
              <ShieldCheck className="h-2.5 w-2.5" />
              Personal
            </span>
            <span className="inline-flex items-center gap-0.5 text-[8px] font-medium px-1.5 py-0.5 rounded-full bg-[#006aff]/15 text-[#93c5fd] border border-[#006aff]/25">
              <Briefcase className="h-2.5 w-2.5" />
              Commercial
            </span>
          </div>
        </div>

        <div className="relative p-2 sm:p-3">
          <div className="relative overflow-hidden rounded-xl bg-black/30 xv-image-reveal-wrap">
            {!revealed && <div className="absolute inset-0 z-10 xv-image-reveal-scan" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className={cn(
                'w-full max-h-[420px] object-contain mx-auto transition-all duration-700',
                revealed ? 'opacity-100 scale-100 xv-image-revealed' : 'opacity-0 scale-[0.98]'
              )}
              loading="lazy"
              onLoad={() => setRevealed(true)}
            />
          </div>
        </div>

        {caption && (
          <p className="px-3 pb-1 text-[11px] text-[var(--muted)] line-clamp-2">{caption}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-1">
          <ActionBtn icon={Download} label="Download" onClick={() => downloadImage(src, 'xroga-image.png')} />
          <ActionBtn icon={Copy} label="Copy" onClick={() => copyImageToClipboard(src)} />
          <ActionBtn icon={Share2} label="Post" onClick={handlePost} accent="emerald" />
          <ActionBtn
            icon={Wand2}
            label="AI Edit"
            onClick={() => setEditOpen(true)}
            accent="primary"
            className="ml-auto"
          />
        </div>
      </div>

      <ImageEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        src={src}
        alt={alt}
      />
    </>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  accent,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: 'primary' | 'emerald';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all hover:scale-[1.02] active:scale-[0.98]',
        accent === 'primary' &&
          'border-[#006aff]/40 bg-[#006aff]/15 text-[#93c5fd] hover:bg-[#006aff]/25',
        accent === 'emerald' &&
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
        !accent && 'border-white/10 bg-white/5 text-[var(--foreground)]/80 hover:bg-white/10',
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
