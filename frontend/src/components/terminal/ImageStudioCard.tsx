'use client';

import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';
import {
  Download,
  Copy,
  Trash2,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  ThumbsUp,
  Star,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyImageToClipboard, downloadImage } from '@/lib/imageStudioUtils';
import { ImageEditModal } from './ImageEditModal';
import { ImagePreviewModal } from './ImagePreviewModal';
import { TextGeneratingAnimation } from './TextGeneratingAnimation';
import { isPlaceholderImage } from '@/lib/parseImageContent';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';

export interface RejectedImage {
  imageUrl: string;
  provider: string;
  matchScore: number;
  issues?: string[];
  scoresByVerifier?: Record<string, number>;
  variantLabel?: string;
  variantIndex?: number;
  userVoted?: boolean;
  selected?: boolean;
  failed?: boolean;
  blocked?: boolean;
}

const VARIANT_SLOTS = 4;

const FORMAT_LABELS: Record<string, string> = {
  '1:1': 'Post (1:1)',
  '4:5': 'Portrait (4:5)',
  '16:9': 'Landscape (16:9)',
  '9:16': 'Story (9:16)',
  '3:4': 'Portrait (3:4)',
  '4:3': 'Standard (4:3)',
};

export interface ImageOutputData {
  type: 'image';
  imageUrl: string;
  provider?: string;
  prompt?: string;
  verified?: boolean;
  matchScore?: number;
  rejectedImages?: RejectedImage[];
  allAttempts?: RejectedImage[];
  isYoutubeThumbnail?: boolean;
  aspectFormat?: string;
  followUps?: string[];
  variantCount?: number;
  isStyleTransfer?: boolean;
  sourceImageUrl?: string;
}

interface ImageStudioCardProps {
  data: ImageOutputData;
  messageId?: string;
  onDelete?: () => void;
  className?: string;
  generating?: boolean;
  message?: string;
  step?: string;
}

export function ImageGeneratingAnimation({
  className,
  message,
  step,
  liveAttempts = [],
}: {
  className?: string;
  message?: string;
  step?: string;
  liveAttempts?: RejectedImage[];
}) {
  const slots = Array.from({ length: VARIANT_SLOTS }, (_, i) => liveAttempts[i] ?? null);

  return (
    <div className={cn('my-3 space-y-2', className)}>
      <TextGeneratingAnimation message={message} step={step} mode="image" sublabel="Xroga AI · 4 variants" />
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/50 p-2">
        <p className="text-[10px] font-medium text-[var(--muted)] mb-1.5 px-1">
          Generating {VARIANT_SLOTS} variants… ({liveAttempts.length}/{VARIANT_SLOTS})
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {slots.map((img, i) => (
            <div
              key={img?.variantIndex ?? `slot-${i}`}
              className="relative rounded-md overflow-hidden border border-[var(--card-border)] aspect-square bg-[var(--muted)]/10"
            >
              {img ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[7px] text-white px-1 py-0.5 truncate">
                    {img.variantLabel ?? img.provider} · {img.matchScore}%
                  </span>
                </>
              ) : (
                <div className="w-full h-full animate-pulse bg-[var(--muted)]/20" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ImageStudioCard({
  data,
  messageId,
  onDelete,
  className,
  generating,
  message,
  step,
}: ImageStudioCardProps) {
  const { setPrompt, submit, deleteTurn, updateFeatureOutput } = useTerminalChat();
  const [editOpen, setEditOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [revealed, setRevealed] = useState(true);
  const [editSrc, setEditSrc] = useState('');
  const [hiddenUrls, setHiddenUrls] = useState<Set<string>>(new Set());
  const [activeUrl, setActiveUrl] = useState(data.imageUrl);

  const {
    imageUrl: defaultSrc,
    provider,
    prompt,
    verified,
    matchScore,
    rejectedImages,
    allAttempts: allAttemptsProp,
    aspectFormat,
    isStyleTransfer,
  } = data;

  const allAttempts = useMemo(() => {
    if (allAttemptsProp?.length) {
      return [...allAttemptsProp].sort((a, b) => (a.variantIndex ?? 99) - (b.variantIndex ?? 99));
    }
    const list: RejectedImage[] = [];
    const seen = new Set<string>();
    const add = (img: RejectedImage) => {
      if (!img.imageUrl || seen.has(img.imageUrl)) return;
      seen.add(img.imageUrl);
      list.push(img);
    };
    if (defaultSrc && !isPlaceholderImage(defaultSrc)) {
      add({
        imageUrl: defaultSrc,
        provider: provider ?? 'Selected',
        matchScore: matchScore ?? 0,
        selected: true,
      });
    }
    for (const r of rejectedImages ?? []) add(r);
    return list.slice(0, VARIANT_SLOTS);
  }, [defaultSrc, provider, matchScore, rejectedImages, allAttemptsProp]);

  const successfulVariants = useMemo(
    () => allAttempts.filter((v) => Boolean(v.imageUrl) && !v.failed && !v.blocked && !hiddenUrls.has(v.imageUrl)),
    [allAttempts, hiddenUrls]
  );

  const visibleVariants = successfulVariants.length > 0 ? successfulVariants : allAttempts.filter((v) => !v.failed && !v.blocked);
  const gridCols =
    successfulVariants.length <= 1
      ? 'grid-cols-1'
      : successfulVariants.length === 2
        ? 'grid-cols-2'
        : successfulVariants.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-4';
  const activeVariant = visibleVariants.find((v) => v.imageUrl === activeUrl) ?? visibleVariants[0];
  const previewSrc = activeVariant?.imageUrl ?? defaultSrc;

  if (generating) {
    return <ImageGeneratingAnimation className={className} message={message} step={step} />;
  }

  if (hidden) return null;

  if (isPlaceholderImage(defaultSrc)) {
    return (
      <div className={cn('my-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-center', className)}>
        <p className="text-sm font-medium text-red-600 dark:text-red-300">Image generation failed</p>
        <p className="text-xs text-red-700/80 dark:text-red-200/70 mt-1">Please try again with a clearer prompt.</p>
      </div>
    );
  }

  function persistSelection(url: string, voted: boolean) {
    if (!messageId) return;
    const nextAttempts = allAttempts.map((a) => ({
      ...a,
      selected: a.imageUrl === url,
      userVoted: a.imageUrl === url ? voted : a.userVoted,
    }));
    updateFeatureOutput(messageId, {
      ...data,
      imageUrl: url,
      provider: nextAttempts.find((a) => a.imageUrl === url)?.provider ?? provider,
      matchScore: nextAttempts.find((a) => a.imageUrl === url)?.matchScore ?? matchScore,
      allAttempts: nextAttempts,
    });
  }

  function handleVote(url: string) {
    setActiveUrl(url);
    persistSelection(url, true);
  }

  function handleSelect(url: string) {
    setActiveUrl(url);
    persistSelection(url, false);
  }

  function handleRemoveVariant(url: string) {
    setHiddenUrls((prev) => new Set(prev).add(url));
    if (activeUrl === url) {
      const next = visibleVariants.find((v) => v.imageUrl !== url);
      if (next) setActiveUrl(next.imageUrl);
    }
  }

  function handleDelete() {
    if (messageId) deleteTurn(messageId);
    else onDelete?.();
    setHidden(true);
    setDeleteOpen(false);
  }

  function handlePostSocial() {
    const text = `[Post] Share this image to Twitter, LinkedIn, and Instagram: ${previewSrc}${prompt ? `\nCaption: ${prompt}` : ''}`;
    setPrompt(text);
    void submit(text);
  }

  function openPreview(url = previewSrc) {
    setEditSrc(url);
    setPreviewOpen(true);
  }

  function openEditor(url = previewSrc) {
    setPreviewOpen(false);
    setEditSrc(url);
    setEditOpen(true);
  }

  const formatLabel = aspectFormat ? (FORMAT_LABELS[aspectFormat] ?? aspectFormat) : 'Post (1:1)';

  return (
    <>
      <div
        className={cn(
          'my-3 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--card-border)] bg-[var(--background)]/50">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span className="text-xs font-semibold">
              {isStyleTransfer ? 'Style transfer' : 'Image'} · {successfulVariants.length || 1} variant{successfulVariants.length === 1 ? '' : 's'}
            </span>
            <span className="text-[10px] text-[var(--muted)]">{formatLabel}</span>
            {verified !== false ? (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                {activeVariant?.matchScore != null ? `${activeVariant.matchScore}%` : 'OK'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                <AlertTriangle className="h-3 w-3" />
                Best effort
              </span>
            )}
          </div>
        </div>

        {previewSrc && (
          <div className="p-2 bg-[var(--background)] border-b border-[var(--card-border)]">
            <button
              type="button"
              onClick={() => openPreview(previewSrc)}
              className="w-full overflow-hidden rounded-lg border border-[var(--card-border)] cursor-zoom-in hover:ring-2 hover:ring-[var(--accent)]/25 transition-shadow"
              aria-label="Open selected variant"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt={prompt ?? 'Selected variant'}
                className={cn(
                  'w-full max-h-[280px] object-contain mx-auto transition-opacity duration-500',
                  revealed ? 'opacity-100' : 'opacity-0',
                )}
                loading="lazy"
                onLoad={() => setRevealed(true)}
              />
            </button>
            <p className="text-[10px] text-center text-[var(--muted)] mt-1">
              {activeVariant?.userVoted ? '★ Your pick' : 'Preview'} — {activeVariant?.variantLabel ?? activeVariant?.provider ?? 'Selected'}
            </p>
          </div>
        )}

        {successfulVariants.length > 0 && (
        <div className="px-2 py-2">
          <p className="text-[10px] font-medium text-[var(--muted)] mb-1.5 px-0.5">
            {successfulVariants.length > 1 ? 'Vote for the best' : 'Generated by'} ·{' '}
            {successfulVariants.map((v) => v.variantLabel ?? v.provider).join(' · ')}
          </p>
          <div className={cn('grid gap-1.5', gridCols)}>
            {successfulVariants.map((img, i) => {
              const hasImage = Boolean(img.imageUrl);
              const isActive = hasImage && img.imageUrl === activeUrl;
              const isVoted = img.userVoted || (img.selected && isActive);

              return (
                <div
                  key={`variant-${img.variantIndex ?? i}-${img.provider ?? 'slot'}`}
                  className={cn(
                    'relative rounded-md overflow-hidden border aspect-square group',
                    isActive
                      ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30'
                      : 'border-[var(--card-border)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(img.imageUrl)}
                    className="absolute inset-0 z-0"
                    aria-label={`Preview ${img.variantLabel ?? img.provider}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                  </button>

                  <div className="absolute top-0 inset-x-0 flex items-center justify-between p-0.5 z-10">
                    <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-black/60 text-white truncate max-w-[60%]">
                      {img.variantLabel ?? img.provider}
                    </span>
                    <button
                      type="button"
                      title="Vote best"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(img.imageUrl);
                      }}
                      className={cn(
                        'p-0.5 rounded bg-black/60',
                        isVoted ? 'text-amber-400' : 'text-white/80 hover:text-amber-300',
                      )}
                    >
                      {isVoted ? <Star className="h-3 w-3 fill-current" /> : <ThumbsUp className="h-3 w-3" />}
                    </button>
                  </div>

                  <div className="absolute bottom-0 inset-x-0 flex gap-0.5 p-0.5 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <MiniBtn icon={Download} title="Download" onClick={() => downloadImage(img.imageUrl, `xroga-${i + 1}.png`)} />
                    <MiniBtn icon={Wand2} title="Edit" onClick={() => openEditor(img.imageUrl)} />
                    <MiniBtn icon={Trash2} title="Remove" danger onClick={() => handleRemoveVariant(img.imageUrl)} />
                  </div>

                  <span className="absolute bottom-0 right-0 text-[7px] text-white/90 bg-black/50 px-1 py-0.5 z-[5] pointer-events-none">
                    {img.matchScore}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        )}

        <div className="flex items-center gap-1 px-2 py-2 border-t border-[var(--card-border)]">
          <button
            type="button"
            title="Post to social media"
            onClick={handlePostSocial}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/20 transition-colors"
          >
            <Share2 className="h-3.5 w-3.5" />
            Post to social
          </button>
          <div className="w-px h-5 bg-[var(--card-border)] mx-0.5" />
          <IconBtn icon={Download} title="Download selected" onClick={() => downloadImage(previewSrc, 'xroga-image.png')} />
          <IconBtn icon={Copy} title="Copy selected" onClick={() => copyImageToClipboard(previewSrc)} />
          <IconBtn icon={Wand2} title="Edit selected" accent onClick={() => openEditor()} />
          <IconBtn
            icon={Trash2}
            title="Delete all"
            danger
            className="ml-auto"
            onClick={() => setDeleteOpen(true)}
          />
        </div>
      </div>

      <ImagePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        src={editSrc || previewSrc}
        alt={prompt ?? 'Image'}
        label={activeVariant?.variantLabel ?? activeVariant?.provider}
        onEdit={() => openEditor(editSrc || previewSrc)}
      />

      <ImageEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        src={editSrc || previewSrc}
        alt={prompt ?? 'Image'}
        variants={successfulVariants}
      />

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete this image?"
        message="This permanently removes the image, your prompt, and all variants from chat and AI Media."
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}

function MiniBtn({
  icon: Icon,
  title,
  onClick,
  danger,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex-1 flex items-center justify-center py-1 rounded bg-white/10 hover:bg-white/20',
        danger && 'text-red-300',
      )}
    >
      <Icon className="h-3 w-3 text-white" />
    </button>
  );
}

function IconBtn({
  icon: Icon,
  title,
  onClick,
  active,
  accent,
  danger,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
  active?: boolean;
  accent?: boolean;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        'p-2 rounded-lg border transition-colors',
        active && 'border-emerald-500/40 bg-emerald-500/10',
        accent && 'border-[var(--accent)]/35 bg-[var(--accent)]/10',
        danger && 'border-red-500/30 text-red-500 hover:bg-red-500/10',
        !active && !accent && !danger && 'border-transparent hover:bg-[var(--muted)]/10',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
