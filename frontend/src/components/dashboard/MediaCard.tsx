'use client';

import { useRef, useState } from 'react';
import { Film, Music, Play, Pause } from 'lucide-react';
import { SectionCompactCard } from '@/components/dashboard/SectionCompactCard';
import type { MediaItem } from '@/lib/mediaStorage';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  item: MediaItem;
  selected?: boolean;
  onOpen: (item: MediaItem) => void;
  onDelete: (id: string) => void;
}

export function MediaCard({ item, selected, onOpen, onDelete }: MediaCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const preview = (
    <div className="relative aspect-square bg-black/30 overflow-hidden">
      {item.type === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
      )}
      {item.type === 'video' && (
        <>
          <video
            ref={videoRef}
            src={item.url}
            className="h-full w-full object-cover"
            playsInline
            muted
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const v = videoRef.current;
              if (!v) return;
              if (playing) v.pause();
              else void v.play();
            }}
            className="absolute bottom-2 right-2 rounded-full bg-black/60 p-1.5 text-white"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
        </>
      )}
      {item.type === 'audio' && (
        <div className="flex h-full items-center justify-center">
          <Music className="h-10 w-10 text-[var(--accent)] opacity-70" />
        </div>
      )}
      {item.type === 'video' && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] text-white">
          <Film className="h-3 w-3" /> video
        </span>
      )}
    </div>
  );

  return (
    <SectionCompactCard
      title={item.name}
      subtitle={item.type}
      dateIso={item.createdAt}
      preview={preview}
      onOpen={() => onOpen(item)}
      onDelete={() => onDelete(item.id)}
      openLabel="Open in terminal"
      className={cn(selected && 'ring-2 ring-[var(--accent)]/50')}
    />
  );
}
