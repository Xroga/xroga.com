'use client';

import { useState, type ComponentType } from 'react';
import {
  Download,
  Trash2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Tv,
  Share2,
  Film,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { addMediaItem } from '@/lib/mediaStorage';
import { TextGeneratingAnimation } from './TextGeneratingAnimation';
import toast from 'react-hot-toast';

export interface VideoOutputData {
  type: 'video_studio';
  title: string;
  streamingUrl: string;
  durationSeconds?: number;
  selectedProvider?: string;
}

interface VideoStudioCardProps {
  data: VideoOutputData;
  onDelete?: () => void;
  className?: string;
  generating?: boolean;
  message?: string;
  step?: string;
}

function isPlayableVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:video/') && url.endsWith('base64,')) return false;
  if (url.startsWith('{') || url.includes('assembled')) return false;
  return url.startsWith('http') || url.startsWith('data:video/');
}

export function VideoStudioCard({
  data,
  onDelete,
  className,
  generating,
  message,
  step,
}: VideoStudioCardProps) {
  const [hidden, setHidden] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  if (generating) {
    return (
      <TextGeneratingAnimation
        className={className}
        message={message}
        step={step}
        mode="video"
        sublabel="Xroga AI · Video Studio"
      />
    );
  }

  if (hidden) return null;

  const { title, streamingUrl, selectedProvider, durationSeconds } = data;

  if (!isPlayableVideoUrl(streamingUrl)) {
    return (
      <div className={cn('my-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4', className)}>
        <p className="text-sm font-medium text-red-600 dark:text-red-300">Video generation failed</p>
        <p className="text-xs text-[var(--muted)] mt-1">
          No playable video was produced. Please try again — e.g. &quot;generate a 5 second video of a cyberpunk city&quot;.
        </p>
      </div>
    );
  }

  function handleDelete() {
    setHidden(true);
    onDelete?.();
    toast.success('Video removed');
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = streamingUrl;
    a.download = `${title.slice(0, 30) || 'xroga-video'}.mp4`;
    a.click();
  }

  function handleSaveMedia() {
    addMediaItem({
      name: title || 'Xroga video',
      type: 'video',
      url: streamingUrl,
    });
    toast.success('Saved to AI Media library');
  }

  function handleUpload(platform: string) {
    toast(`Connect ${platform} in Integrations to upload directly`, { icon: '📤' });
  }

  return (
    <div
      className={cn(
        'my-3 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--card-border)] bg-[var(--background)]/50">
        <div className="flex items-center gap-2 min-w-0">
          <Film className="h-4 w-4 text-[var(--accent)] shrink-0" />
          <span className="text-xs font-semibold text-[var(--foreground)] truncate">{title}</span>
          {selectedProvider && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--card-border)] text-[var(--muted)]">
              {selectedProvider}
            </span>
          )}
        </div>
        {durationSeconds != null && (
          <span className="text-[10px] text-[var(--muted)]">{durationSeconds}s</span>
        )}
      </div>

      <div className="p-2 sm:p-3 bg-[var(--background)]">
        <div className="relative rounded-lg overflow-hidden border border-[var(--card-border)] bg-black">
          <video
            src={streamingUrl}
            className="w-full max-h-[400px] object-contain"
            controls
            playsInline
            muted={muted}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3 pt-2">
        <ActionBtn
          icon={playing ? Pause : Play}
          label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            const v = document.querySelector(`video[src="${streamingUrl}"]`) as HTMLVideoElement | null;
            if (v) {
              if (playing) v.pause();
              else void v.play();
            }
          }}
        />
        <ActionBtn
          icon={muted ? VolumeX : Volume2}
          label={muted ? 'Unmute' : 'Mute'}
          onClick={() => setMuted((m) => !m)}
        />
        <ActionBtn icon={Download} label="Download" onClick={handleDownload} />
        <ActionBtn icon={Share2} label="Save to Media" onClick={handleSaveMedia} />
        <ActionBtn icon={Tv} label="YouTube" onClick={() => handleUpload('YouTube')} accent="primary" />
        <ActionBtn icon={Share2} label="Reels" onClick={() => handleUpload('Instagram Reels')} />
        <ActionBtn icon={Share2} label="Shorts" onClick={() => handleUpload('YouTube Shorts')} />
        <ActionBtn icon={Trash2} label="Delete" onClick={handleDelete} accent="danger" className="ml-auto" />
      </div>
    </div>
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
  accent?: 'primary' | 'danger';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors',
        accent === 'primary' &&
          'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--foreground)] hover:bg-[var(--accent)]/20',
        accent === 'danger' &&
          'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-500/20',
        !accent &&
          'border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]/10',
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
