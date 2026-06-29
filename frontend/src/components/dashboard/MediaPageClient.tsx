'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Image as ImageIcon, Upload } from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import { MediaCard } from '@/components/dashboard/MediaCard';
import { loadMediaItems, saveMediaItems, removeMediaItem, type MediaItem } from '@/lib/mediaStorage';
import { findChatArchiveByMessageId } from '@/lib/chatArchive';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useRouter } from 'next/navigation';
import { useTerminalChat } from '@/context/TerminalChatContext';
import toast from 'react-hot-toast';

function detectType(file: File): MediaItem['type'] {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'image';
}

export function MediaPageClient() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<'all' | MediaItem['type']>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { setPrompt } = useTerminalChat();

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

  function openInDashboard(item: MediaItem) {
    setSelectedId(item.id);
    const prompt = item.sourcePrompt ?? item.name;
    setPrompt(prompt);

    const archived = item.sourceMessageId
      ? findChatArchiveByMessageId(item.sourceMessageId)?.messages
      : undefined;

    resumeToDashboard({
      prompt,
      messages: archived,
      selectedId: item.id,
      selectedLabel: item.name,
      source: 'media',
      jumpMessageId: item.sourceMessageId,
    });
    router.push('/dashboard');
  }

  const shown = useMemo(() => {
    const typeFiltered = filter === 'all' ? items : items.filter((i) => i.type === filter);
    const q = query.trim().toLowerCase();
    if (!q) return typeFiltered;
    return typeFiltered.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, filter, query]);

  return (
    <PageFullscreenFrame>
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <ImageIcon className="w-7 h-7 text-[var(--accent)]" />
              AI Media
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Images, videos, and audio save here automatically. Tap any card to jump to where it was created.
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

        <SectionSearchBar value={query} onChange={setQuery} placeholder="Search AI media…" />

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
              Ask Xroga to generate images, video, or audio — they appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                onOpen={openInDashboard}
                onDelete={(id) => {
                  removeMediaItem(id);
                  setItems((prev) => {
                    const next = prev.filter((i) => i.id !== id);
                    saveMediaItems(next);
                    return next;
                  });
                  toast.success('Removed from library');
                }}
              />
            ))}
          </div>
        )}
      </div>
    </PageFullscreenFrame>
  );
}
