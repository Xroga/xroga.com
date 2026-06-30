'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Download,
  Trash2,
  Share2,
  ThumbsUp,
  ThumbsDown,
  MessageCircleHeart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoSrc, PLAYBACK_SPEEDS } from '@/lib/videoPlayback';
import type { VideoFormatId } from '@/lib/videoFormat';
import { videoAspectClass } from '@/lib/videoFormat';
import toast from 'react-hot-toast';

interface VideoPlayerModalProps {
  open: boolean;
  onClose: () => void;
  src: string;
  title: string;
  videoFormat?: VideoFormatId;
  onDownload: () => void;
  onDelete: () => void;
  onShare: () => void;
  onFeedback?: () => void;
}

export function VideoPlayerModal({
  open,
  onClose,
  src,
  title,
  videoFormat = 'youtube_video',
  onDownload,
  onDelete,
  onShare,
  onFeedback,
}: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { src: playSrc, error: loadError, loading } = useVideoSrc(src);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [liked, setLiked] = useState<'up' | 'down' | null>(null);

  const togglePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.paused) await v.play();
      else v.pause();
    } catch {
      toast.error('Playback failed — try Download');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (v) {
      v.volume = volume;
      v.playbackRate = speed;
    }
  }, [open, volume, speed]);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      setProgress(0);
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const aspectClass = videoAspectClass(videoFormat);

  function skip(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
  }

  function formatTime(s: number) {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  return createPortal(
    <div className="fixed inset-0 z-[235] flex items-center justify-center p-2 sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--card-border)]">
          <p className="text-sm font-semibold truncate">{title}</p>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--muted)]/10 shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={cn('relative mx-auto bg-black', aspectClass)}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-xs">Loading video…</div>
          )}
          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs px-4 text-center">{loadError}</div>
          )}
          <video
            ref={videoRef}
            src={playSrc}
            className="h-full w-full object-contain"
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            onClick={() => void togglePlay()}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={() => {
              const v = videoRef.current;
              if (v) setProgress(v.currentTime);
            }}
            onLoadedMetadata={() => {
              const v = videoRef.current;
              if (v) setDuration(v.duration);
            }}
            onError={() => toast.error('Video failed to load — try Download')}
          />
        </div>

        <div className="px-3 py-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={progress}
              onChange={(e) => {
                const t = parseFloat(e.target.value);
                const v = videoRef.current;
                if (v) v.currentTime = t;
                setProgress(t);
              }}
              className="flex-1 h-1.5 accent-[var(--accent)] cursor-pointer"
              aria-label="Seek"
            />
            <span className="text-[10px] text-[var(--muted)] tabular-nums shrink-0">
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <IconBtn icon={SkipBack} label="Back 5s" onClick={() => skip(-5)} />
            <IconBtn icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} onClick={() => void togglePlay()} accent />
            <IconBtn icon={SkipForward} label="Forward 5s" onClick={() => skip(5)} />
            <IconBtn
              icon={muted ? VolumeX : Volume2}
              label={muted ? 'Unmute' : 'Mute'}
              onClick={() => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = !v.muted;
                setMuted(v.muted);
              }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setVolume(val);
                const v = videoRef.current;
                if (v) {
                  v.volume = val;
                  v.muted = val === 0;
                  setMuted(val === 0);
                }
              }}
              className="w-20 h-1 accent-[var(--accent)]"
              aria-label="Volume"
            />
            <select
              value={speed}
              onChange={(e) => {
                const s = parseFloat(e.target.value);
                setSpeed(s);
                if (videoRef.current) videoRef.current.playbackRate = s;
              }}
              className="text-[10px] rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5"
              aria-label="Playback speed"
            >
              {PLAYBACK_SPEEDS.map((s) => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>

            <div className="flex items-center gap-1 ml-auto">
              <IconBtn
                icon={ThumbsUp}
                label="Like"
                onClick={() => setLiked((l) => (l === 'up' ? null : 'up'))}
                active={liked === 'up'}
              />
              <IconBtn
                icon={ThumbsDown}
                label="Dislike"
                onClick={() => setLiked((l) => (l === 'down' ? null : 'down'))}
                active={liked === 'down'}
              />
              {onFeedback && <IconBtn icon={MessageCircleHeart} label="Feedback" onClick={onFeedback} />}
              <IconBtn icon={Share2} label="Post to social" onClick={onShare} accent />
              <IconBtn icon={Download} label="Download" onClick={onDownload} />
              <IconBtn icon={Trash2} label="Delete" onClick={onDelete} danger />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function IconBtn({
  icon: Icon,
  label,
  onClick,
  accent,
  danger,
  active,
}: {
  icon: typeof Play;
  label: string;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'p-2 rounded-lg border transition-colors',
        accent && 'border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent)]',
        danger && 'border-red-500/30 text-red-500 hover:bg-red-500/10',
        active && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600',
        !accent && !danger && !active && 'border-[var(--card-border)] hover:bg-[var(--muted)]/10',
      )}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
