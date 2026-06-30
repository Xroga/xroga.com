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
  Star,
  Share2,
  ChevronLeft,
  ChevronRight,
  UserCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyImageToClipboard, downloadImage } from '@/lib/imageStudioUtils';
import { setProfileFromImageUrl } from '@/lib/setProfileFromImage';
import { useAvatarUpdate } from '@/hooks/useAvatarUpdate';
import { ImageEditModal } from './ImageEditModal';
import { SocialShareModal } from './SocialShareModal';
import { TextGeneratingAnimation } from './TextGeneratingAnimation';
import { isPlaceholderImage } from '@/lib/parseImageContent';
import { useTerminalChat } from '@/context/TerminalChatContext';
import toast from 'react-hot-toast';
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
  '16:9': 'YouTube Thumbnail (16:9)',
  '9:16': 'Story (9:16)',
  '3:4': 'Portrait (3:4)',
  '4:3': 'Standard (4:3)',
};

export interface ImageOutputData {
  type: 'image';
  imageUrl: string;
  provider?: string;
  prompt?: string;
  concisePrompt?: string;
  enhancedPrompt?: string;
  overlayText?: string;
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
  promptHint,
}: {
  className?: string;
  message?: string;
  step?: string;
  liveAttempts?: RejectedImage[];
  promptHint?: string;
}) {
  const slots = Array.from({ length: VARIANT_SLOTS }, (_, i) => liveAttempts[i] ?? null);

  return (
    <div className={cn('my-3 space-y-2', className)}>
      <TextGeneratingAnimation message={message} step={step} mode="image" sublabel="Xroga AI · 4 variants" />
      {promptHint && (
        <div className="rounded-lg border border-[var(--card-border)] bg-[var(--card)]/60 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)] mb-0.5">Your command</p>
          <p className="text-[11px] text-[var(--foreground)] leading-snug">{promptHint}</p>
        </div>
      )}
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
  const { deleteTurn, updateFeatureOutput } = useTerminalChat();
  const { setAvatarUrl, uploadAvatarFile } = useAvatarUpdate();
  const [settingProfile, setSettingProfile] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [editSrc, setEditSrc] = useState('');
  const [activeUrl, setActiveUrl] = useState(data.imageUrl);

  const {
    imageUrl: defaultSrc,
    provider,
    prompt,
    concisePrompt,
    enhancedPrompt,
    overlayText,
    verified,
    matchScore,
    rejectedImages,
    allAttempts: allAttemptsProp,
    aspectFormat,
    isStyleTransfer,
    isYoutubeThumbnail,
  } = data;

  const displayPrompt = concisePrompt || enhancedPrompt || prompt;

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
    () => allAttempts.filter((v) => Boolean(v.imageUrl) && !v.failed && !v.blocked),
    [allAttempts]
  );

  const allImageUrls = useMemo(
    () => successfulVariants.map((v) => v.imageUrl).filter(Boolean),
    [successfulVariants]
  );

  const visibleVariants = successfulVariants.length > 0 ? successfulVariants : allAttempts.filter((v) => !v.failed && !v.blocked);
  const activeVariant = visibleVariants.find((v) => v.imageUrl === activeUrl) ?? visibleVariants[0];
  const previewSrc = activeVariant?.imageUrl ?? defaultSrc;

  /** Small grid — only other variants (never repeat the main preview) */
  const gridVariants = useMemo(() => {
    if (successfulVariants.length <= 1) return [];
    return successfulVariants.filter((v) => v.imageUrl !== previewSrc);
  }, [successfulVariants, previewSrc]);

  const activeIndex = Math.max(
    0,
    successfulVariants.findIndex((v) => v.imageUrl === activeUrl)
  );

  if (generating) {
    return (
      <ImageGeneratingAnimation
        className={className}
        message={message}
        step={step}
        promptHint={displayPrompt}
      />
    );
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

  function handleDelete() {
    if (messageId) deleteTurn(messageId);
    else onDelete?.();
    setHidden(true);
    setDeleteOpen(false);
  }

  function openEditor(url = previewSrc) {
    setEditSrc(url);
    setActiveUrl(url);
    persistSelection(url, false);
    setEditOpen(true);
  }

  async function handleSetProfilePic(url = previewSrc) {
    setSettingProfile(true);
    try {
      await setProfileFromImageUrl(url, { setAvatarUrl, uploadAvatarFile });
    } catch {
      toast.error('Could not set profile photo — try Download first');
    } finally {
      setSettingProfile(false);
    }
  }

  function slideVariant(delta: number) {
    if (successfulVariants.length < 2) return;
    const next = (activeIndex + delta + successfulVariants.length) % successfulVariants.length;
    const v = successfulVariants[next];
    if (v) handleSelect(v.imageUrl);
  }

  const formatLabel = isYoutubeThumbnail
    ? 'YouTube Thumbnail (16:9)'
    : aspectFormat
      ? (FORMAT_LABELS[aspectFormat] ?? aspectFormat)
      : 'Post (1:1)';

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
              {isStyleTransfer ? 'Style transfer' : isYoutubeThumbnail ? 'Thumbnail' : 'Image'} ·{' '}
              {successfulVariants.length || 1} variant{successfulVariants.length === 1 ? '' : 's'}
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

        {displayPrompt && (
          <div className="px-3 py-2 border-b border-[var(--card-border)] bg-[var(--background)]/30">
            <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)] mb-0.5">
              Groq prompt
            </p>
            <p className="text-[11px] text-[var(--foreground)] leading-snug">{displayPrompt}</p>
            {overlayText && (
              <p className="text-[10px] text-[var(--accent)] mt-1">
                On-image text: <span className="font-semibold">&ldquo;{overlayText}&rdquo;</span>
              </p>
            )}
          </div>
        )}

        {previewSrc && (
          <div className="p-2 bg-[var(--background)] border-b border-[var(--card-border)]">
            <button
              type="button"
              onClick={() => openEditor(previewSrc)}
              className="w-full overflow-hidden rounded-lg border border-[var(--card-border)] cursor-pointer hover:ring-2 hover:ring-[var(--accent)]/25 transition-shadow bg-[var(--card)]/30"
              aria-label="Open AI image editor"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt={prompt ?? 'Selected variant'}
                className="w-full max-h-[min(42vw,200px)] object-contain mx-auto"
                loading="lazy"
              />
            </button>

            {successfulVariants.length > 1 && (
              <div className="mt-1.5 px-1 flex items-center gap-1.5">
                <button type="button" onClick={() => slideVariant(-1)} className="p-0.5 rounded border border-[var(--card-border)]" aria-label="Previous">
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={successfulVariants.length - 1}
                  value={activeIndex}
                  onChange={(e) => {
                    const v = successfulVariants[Number(e.target.value)];
                    if (v) handleSelect(v.imageUrl);
                  }}
                  className="flex-1 h-1 accent-[var(--accent)]"
                  aria-label="Browse variants"
                />
                <button type="button" onClick={() => slideVariant(1)} className="p-0.5 rounded border border-[var(--card-border)]" aria-label="Next">
                  <ChevronRight className="h-3 w-3" />
                </button>
                <span className="text-[9px] text-[var(--muted)] shrink-0">
                  {activeIndex + 1}/{successfulVariants.length}
                </span>
              </div>
            )}

            <div className="flex items-center justify-center gap-1 mt-2 flex-wrap">
              <ActionPill icon={Wand2} label="AI Edit" accent onClick={() => openEditor(previewSrc)} />
              <ActionPill
                icon={UserCircle}
                label={settingProfile ? '…' : 'Profile pic'}
                onClick={() => void handleSetProfilePic(previewSrc)}
              />
              <ActionPill icon={Share2} label="Social" onClick={() => setSocialOpen(true)} />
              <ActionPill icon={Download} label="Save" onClick={() => downloadImage(previewSrc, 'xroga-image.png')} />
              <ActionPill icon={Copy} label="Copy" onClick={() => copyImageToClipboard(previewSrc)} />
              <ActionPill icon={Trash2} label="Delete" danger onClick={() => setDeleteOpen(true)} />
            </div>
          </div>
        )}

        {gridVariants.length > 0 && (
          <div className="px-2 py-2 border-b border-[var(--card-border)]">
            <p className="text-[9px] font-medium text-[var(--muted)] mb-1 px-0.5">Other variants</p>
            <div className="grid grid-cols-4 sm:grid-cols-4 gap-1 max-w-md">
              {gridVariants.map((img, i) => {
                const isVoted = img.userVoted || img.selected;
                return (
                  <div
                    key={`grid-${img.variantIndex ?? i}-${img.provider ?? 'v'}`}
                    className="relative rounded-md overflow-hidden border border-[var(--card-border)] aspect-square max-h-16"
                  >
                    <button
                      type="button"
                      onClick={() => openEditor(img.imageUrl)}
                      className="absolute inset-0"
                      aria-label={`Edit ${img.variantLabel ?? img.provider}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                    </button>
                    <span className="absolute bottom-0 inset-x-0 text-[6px] bg-black/70 text-white px-0.5 truncate pointer-events-none">
                      {img.variantLabel ?? img.provider}
                    </span>
                    <button
                      type="button"
                      title="Vote"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVote(img.imageUrl);
                      }}
                      className={cn(
                        'absolute top-0 right-0 p-0.5 bg-black/60 rounded-bl',
                        isVoted ? 'text-amber-400' : 'text-white/70',
                      )}
                    >
                      <Star className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 px-2 py-1.5">
          <button
            type="button"
            title="Share to YouTube, X, Instagram & more"
            onClick={() => setSocialOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold hover:bg-emerald-500/20"
          >
            <Share2 className="h-3 w-3" />
            Post to social media
          </button>
        </div>
      </div>

      <SocialShareModal
        open={socialOpen}
        onClose={() => setSocialOpen(false)}
        prompt={prompt}
        concisePrompt={concisePrompt}
        overlayText={overlayText}
        imageUrls={allImageUrls}
        primaryImageUrl={previewSrc}
      />

      <ImageEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        src={editSrc || previewSrc}
        alt={prompt ?? 'Image'}
        variants={successfulVariants}
        sharePrompt={prompt}
        concisePrompt={concisePrompt}
        overlayText={overlayText}
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

function ActionPill({
  icon: Icon,
  label,
  onClick,
  accent,
  danger,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors',
        accent && 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20',
        danger && 'border-red-500/35 bg-red-500/10 text-red-500 hover:bg-red-500/15',
        !accent && !danger && 'border-[var(--card-border)] bg-[var(--card)]/80 hover:bg-[var(--card)]',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
