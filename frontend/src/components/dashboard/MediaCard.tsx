'use client';

import { useRef, useState } from 'react';
import {
  Download,
  Trash2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipForward,
  Sparkles,
  Film,
  Music,
} from 'lucide-react';
import { UiverseTableCard } from '@/components/ui/UiverseTableCard';
import { mediaTableRows } from '@/lib/tableRows';
import { getItemMeta, markItemSeen } from '@/lib/itemMeta';
import type { MediaItem } from '@/lib/mediaStorage';
import { cn } from '@/lib/utils';
import { downloadUrl } from '@/components/ui/SectionRowActions';

interface MediaCardProps {
  item: MediaItem;
  selected?: boolean;
  onOpen: (item: MediaItem) => void;
  onDelete: (id: string) => void;
}

export function MediaCard({ item, selected, onOpen, onDelete }: MediaCardProps) {
  const meta = getItemMeta(item.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(0.8);

  function handleClick() {
    markItemSeen(item.id);
    onOpen(item);
  }

  return (
    <article
      className={cn(
        'group rounded-2xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden transition-all hover:border-[var(--accent)]/35 hover:shadow-lg',
        selected && 'ring-2 ring-[var(--accent)]/50'
      )}
    >
      <button type="button" onClick={handleClick} className="w-full text-left">
        {item.type === 'image' && (
          <div className="relative aspect-[4/3] bg-black/20 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={item.name}
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {item.type === 'video' && (
          <div className="relative aspect-video bg-black overflow-hidden">
            <video
              ref={videoRef}
              src={item.url}
              className="w-full h-full object-contain"
              playsInline
              muted={muted}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex flex-wrap items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <MediaIconBtn
                icon={playing ? Pause : Play}
                label={playing ? 'Pause' : 'Play'}
                onClick={(e) => {
                  e.stopPropagation();
                  const v = videoRef.current;
                  if (!v) return;
                  if (playing) v.pause();
                  else void v.play();
                }}
              />
              <MediaIconBtn
                icon={muted ? VolumeX : Volume2}
                label="Mute"
                onClick={(e) => {
                  e.stopPropagation();
                  setMuted((m) => !m);
                  if (videoRef.current) videoRef.current.muted = !muted;
                }}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (videoRef.current) {
                    videoRef.current.volume = v;
                    videoRef.current.muted = v === 0;
                    setMuted(v === 0);
                  }
                }}
                className="w-14 h-1 accent-[var(--accent)]"
                aria-label="Volume"
              />
              <MediaIconBtn
                icon={SkipForward}
                label="+5s"
                onClick={(e) => {
                  e.stopPropagation();
                  if (videoRef.current) videoRef.current.currentTime += 5;
                }}
              />
              <MediaIconBtn
                icon={Download}
                label="DL"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadUrl(item.name, item.url);
                }}
              />
              <MediaIconBtn
                icon={Trash2}
                label="Del"
                danger
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
              />
            </div>
          </div>
        )}

        {item.type === 'audio' && (
          <div className="flex items-center justify-center aspect-[3/1] bg-[var(--background)]/50">
            <Music className="w-10 h-10 text-[var(--accent)] opacity-60" />
            <audio src={item.url} controls className="hidden" />
          </div>
        )}

        <div className="p-2.5">
          <UiverseTableCard
            title={item.name.slice(0, 28) || item.type}
            rows={mediaTableRows(item, meta)}
            selected={selected}
            onClick={handleClick}
          />
        </div>
      </button>

      <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
        <button
          type="button"
          onClick={handleClick}
          className="flex-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg bg-[var(--accent)]/12 text-[var(--accent)] hover:bg-[var(--accent)]/22"
        >
          <Sparkles className="w-3 h-3 inline mr-1" />
          Open in chat
        </button>
        {item.type === 'video' && (
          <span className="text-[9px] text-[var(--muted)] flex items-center gap-0.5">
            <Film className="w-3 h-3" /> video
          </span>
        )}
      </div>
    </article>
  );
}

function MediaIconBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'p-1 rounded-md text-[10px] font-bold',
        danger ? 'bg-red-500/30 text-white' : 'bg-white/15 text-white hover:bg-white/25'
      )}
    >
      <Icon className="w-3 h-3" />
    </button>
  );
}
