'use client';

import { useEffect, useRef, useState } from 'react';
import { Film, Image as ImageIcon, Music, Upload, Trash2 } from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { loadMediaItems, saveMediaItems, type MediaItem } from '@/lib/mediaStorage';
import toast from 'react-hot-toast';

function MediaIcon({ type }: { type: MediaItem['type'] }) {
  if (type === 'video') return <Film className="w-8 h-8 text-[var(--muted)]" />;
  if (type === 'audio') return <Music className="w-8 h-8 text-[var(--muted)]" />;
  return <ImageIcon className="w-8 h-8 text-[var(--muted)]" />;
}

function detectType(file: File): MediaItem['type'] {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'image';
}

export function MediaPageClient() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<'all' | MediaItem['type']>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setItems(loadMediaItems());
  }, []);

  function persist(next: MediaItem[]) {
    setItems(next);
    saveMediaItems(next);
  }

  function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    const additions: MediaItem[] = [];
    let pending = files.length;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        additions.push({
          id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: detectType(file),
          url: reader.result as string,
          createdAt: new Date().toISOString(),
        });
        pending -= 1;
        if (pending === 0) {
          persist([...additions, ...items]);
          toast.success(`Added ${additions.length} file${additions.length === 1 ? '' : 's'}`);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function removeItem(id: string) {
    persist(items.filter((i) => i.id !== id));
    toast.success('Removed from library');
  }

  const shown = filter === 'all' ? items : items.filter((i) => i.type === filter);

  return (
    <PageFullscreenFrame>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <ImageIcon className="w-7 h-7 text-[var(--accent)]" />
              AI Media Library
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Images, videos, and audio from your Swarm — upload or browse generated assets.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="xv-footer-pill !text-[var(--foreground)] flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleUpload(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(['all', 'image', 'video', 'audio'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`text-xs px-3 py-1.5 rounded-full border capitalize ${
                filter === key
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                  : 'border-[var(--card-border)] text-[var(--muted)]'
              }`}
            >
              {key === 'all' ? 'All media' : key}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center border border-dashed border-[var(--card-border)]">
            <ImageIcon className="w-12 h-12 mx-auto text-[var(--muted)] mb-4 opacity-50" />
            <p className="text-sm text-[var(--muted)]">No media yet in this view.</p>
            <p className="text-xs text-[var(--muted)] mt-2">
              Ask Xroga to generate images, video, or audio — or upload files here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {shown.map((item) => (
              <div
                key={item.id}
                className="group rounded-xl border border-[var(--card-border)] overflow-hidden glass-panel"
              >
                <div className="aspect-square bg-white/5 relative flex items-center justify-center overflow-hidden">
                  {item.type === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                  ) : item.type === 'video' ? (
                    <video src={item.url} className="w-full h-full object-cover" controls />
                  ) : (
                    <div className="p-4 w-full">
                      <audio src={item.url} controls className="w-full" />
                    </div>
                  )}
                  {item.type !== 'audio' && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <MediaIcon type={item.type} />
                    </div>
                  )}
                </div>
                <div className="p-2 flex items-center gap-2">
                  <p className="text-xs truncate flex-1">{item.name}</p>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-1 rounded hover:bg-red-500/20 text-[var(--muted)] hover:text-red-400"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageFullscreenFrame>
  );
}
