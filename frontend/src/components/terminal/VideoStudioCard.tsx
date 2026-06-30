'use client';

import { useState } from 'react';
import { Download, Trash2, Play, Share2, Film, Sparkles, Clapperboard, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextGeneratingAnimation } from './TextGeneratingAnimation';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { VideoPlayerModal } from './VideoPlayerModal';
import { VideoShareModal } from './VideoShareModal';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { useVideoSrc } from '@/lib/videoPlayback';
import { parseVideoFormatFromPrompt, videoAspectClass, formatLabel, type VideoFormatId } from '@/lib/videoFormat';
import toast from 'react-hot-toast';

export interface VideoOutputData {
  type: 'video_studio';
  title: string;
  streamingUrl: string;
  durationSeconds?: number;
  selectedProvider?: string;
  videoFormat?: VideoFormatId;
  prompt?: string;
  screenplay?: {
    title: string;
    mood: string;
    scenes: Array<{ number: number; description: string; dialogue: string; durationSeconds: number }>;
  };
  providersUsed?: string[];
  reviewScores?: { physics: number; lighting: number; consistency: number };
  healingSteps?: string[];
  qcScore?: number;
  omniReality?: {
    storyboardProvider?: string;
    moodTone?: string;
    continuityLocks?: string[];
    sceneCount?: number;
  };
  audioTracks?: Array<{ type: string; provider: string }>;
}

interface VideoStudioCardProps {
  data: VideoOutputData;
  onDelete?: () => void;
  className?: string;
  generating?: boolean;
  message?: string;
  step?: string;
  messageId?: string;
}

function isPlayableVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:video/') && url.length < 200) return false;
  if (url.startsWith('{') || (url.includes('assembled') && !url.startsWith('http'))) return false;
  return url.startsWith('http') || url.startsWith('data:video/');
}

export function VideoStudioCard({
  data,
  onDelete,
  className,
  generating,
  message,
  step,
  messageId,
}: VideoStudioCardProps) {
  const [hidden, setHidden] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { setPrompt, deleteTurn } = useTerminalChat();

  const { title, streamingUrl, selectedProvider, durationSeconds, prompt, screenplay, providersUsed, reviewScores, healingSteps, qcScore, omniReality, audioTracks } = data;
  const videoFormat: VideoFormatId =
    data.videoFormat ?? parseVideoFormatFromPrompt(prompt ?? title);
  const { src: previewSrc, loading: videoLoading, error: videoError } = useVideoSrc(streamingUrl);
  const aspectClass = videoAspectClass(videoFormat);
  const isSlideshowFallback = ['slideshow', 'slideshow-ai-image', 'parallax', 'ffmpeg-minimal', 'static-mp4'].includes(
    selectedProvider ?? ''
  );

  if (generating) {
    return (
      <TextGeneratingAnimation
        className={className}
        message={message}
        step={step}
        mode="video"
        sublabel="Pick format · Xroga Video Studio"
      />
    );
  }

  if (hidden) return null;

  if (!isPlayableVideoUrl(streamingUrl)) {
    return (
      <div className={cn('my-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4', className)}>
        <p className="text-sm font-medium text-red-600 dark:text-red-300">Video generation failed</p>
        <p className="text-xs text-[var(--muted)] mt-1">Try again — e.g. &quot;generate a 5 second video of a cyberpunk city&quot;.</p>
      </div>
    );
  }

  function handleDelete() {
    if (messageId) deleteTurn(messageId);
    else onDelete?.();
    setHidden(true);
    setPlayerOpen(false);
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = previewSrc || streamingUrl;
    a.download = `${title.slice(0, 30) || 'xroga-video'}.mp4`;
    a.click();
    toast.success('Download started');
  }

  return (
    <>
      <div
        className={cn(
          'my-2 overflow-hidden rounded-2xl border border-[var(--card-border)]/80 bg-[var(--card)]/50 backdrop-blur-sm shadow-sm',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Film className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <span className="text-xs font-semibold truncate">{title}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[var(--muted)]/12 text-[var(--muted)] shrink-0">
              {formatLabel(videoFormat).split(' ')[0]}
            </span>
            {omniReality?.moodTone && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-md border border-purple-500/30 text-purple-400 shrink-0">
                {omniReality.moodTone}
              </span>
            )}
          </div>
          {durationSeconds != null && (
            <span className="text-[10px] text-[var(--muted)] shrink-0">{durationSeconds}s</span>
          )}
          </div>

          {(isSlideshowFallback || providersUsed?.includes('slideshow')) && (
            <div className="mx-3 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                Premium video APIs unavailable (credits/locked keys). Showing motion preview from generated still — Replicate image-to-video will activate when backend is deployed.
              </p>
            </div>
          )}

          {(screenplay?.scenes?.length ?? 0) > 0 && (
            <div className="px-3 pb-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clapperboard className="h-3 w-3 text-[var(--accent)]" />
                <span className="text-[10px] font-semibold text-[var(--muted)]">Storyboard</span>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {screenplay!.scenes.slice(0, 4).map((s) => (
                  <p key={s.number} className="text-[9px] text-[var(--muted)] leading-snug">
                    <span className="text-[var(--foreground)] font-medium">Scene {s.number}:</span> {s.description.slice(0, 80)}
                    {s.dialogue ? ` — "${s.dialogue.slice(0, 40)}…"` : ''}
                  </p>
                ))}
              </div>
            </div>
          )}

          {(reviewScores || qcScore != null || healingSteps?.length) && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {reviewScores && (
                <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Shield className="h-2.5 w-2.5" />
                  QC {qcScore ?? reviewScores.physics + reviewScores.lighting + reviewScores.consistency}
                </span>
              )}
              {selectedProvider && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-md border border-[var(--card-border)] text-[var(--muted)]">
                  {selectedProvider}
                </span>
              )}
              {providersUsed?.slice(0, 3).map((p) => (
                <span key={p} className="text-[9px] px-1.5 py-0.5 rounded-md bg-[var(--muted)]/8 text-[var(--muted)]">{p}</span>
              ))}
              {audioTracks?.map((t) => (
                <span key={t.provider} className="text-[9px] px-1.5 py-0.5 rounded-md bg-[#006aff]/10 text-[#60a5fa]">{t.provider}</span>
              ))}
            </div>
          )}

          <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => setPlayerOpen(true)}
            className={cn(
              'group relative w-full max-w-md mx-auto overflow-hidden rounded-xl border border-[var(--card-border)] bg-black',
              aspectClass,
            )}
            aria-label="Open video player"
          >
            {videoLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-white/60 text-xs">Loading…</div>
            )}
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center text-red-400 text-[10px] px-2 text-center">{videoError}</div>
            )}
            <video
              src={previewSrc}
              className="h-full w-full object-contain pointer-events-none"
              playsInline
              muted
              preload="metadata"
              crossOrigin="anonymous"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg">
                <Play className="h-6 w-6 ml-0.5" />
              </span>
            </span>
          </button>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPlayerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold bg-[var(--accent)] text-white hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" />
              Play
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold border border-[var(--card-border)] hover:bg-[var(--muted)]/10"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
            >
              <Share2 className="h-3.5 w-3.5" />
              Post to social media
            </button>
            <button
              type="button"
              onClick={() => {
                setPrompt(`Edit this video: ${title}`);
                toast('Edit prompt loaded — press GO', { icon: '✨' });
              }}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold text-red-500 hover:bg-red-500/10 ml-auto"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <VideoPlayerModal
        open={playerOpen}
        onClose={() => setPlayerOpen(false)}
        src={streamingUrl}
        title={title}
        videoFormat={videoFormat}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onShare={() => {
          setPlayerOpen(false);
          setShareOpen(true);
        }}
        onFeedback={() => setFeedbackOpen(true)}
      />

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <VideoShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={title}
        videoUrl={previewSrc || streamingUrl}
        videoFormat={videoFormat}
      />
    </>
  );
}
