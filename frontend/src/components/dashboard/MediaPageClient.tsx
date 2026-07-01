'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Image as ImageIcon, Upload, Terminal, Plus } from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import {
  loadMediaItems,
  saveMediaItems,
  removeMediaItem,
  removeMediaByUrl,
  removeMediaByMessageId,
  purgeMediaUrls,
  type MediaItem,
} from '@/lib/mediaStorage';
import { findChatArchiveByMessageId, removeChatArchiveEntry } from '@/lib/chatArchive';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useRouter } from 'next/navigation';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

function detectType(file: File): MediaItem['type'] {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'image';
}

function groupByPrompt(items: MediaItem[]): Array<{ key: string; label: string; items: MediaItem[] }> {
  const map = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = item.sourcePrompt?.slice(0, 60) || item.name || item.id;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([key, group]) => ({
    key,
    label: group[0]?.sourcePrompt?.slice(0, 48) || group[0]?.name || 'Media',
    items: group,
  }));
}

export function MediaPageClient() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<'all' | MediaItem['type']>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { setPrompt, deleteTurn, startNewChat, hydrateFromSession } = useTerminalChat();

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

    const archived =
      item.messagesSnapshot ??
      (item.sourceMessageId ? findChatArchiveByMessageId(item.sourceMessageId)?.messages : undefined);

    resumeToDashboard({
      prompt,
      messages: archived,
      selectedId: item.id,
      selectedLabel: item.name,
      source: 'media',
      jumpMessageId: item.sourceMessageId,
    });
    router.push('/dashboard');
    setTimeout(() => hydrateFromSession(), 100);
    toast('Jumping to where this was created…', { icon: '📍' });
  }

  function handleNewTerminal() {
    startNewChat();
    router.push('/dashboard');
    toast('Fresh terminal — your history is saved in AI Media', { icon: '✨' });
  }

  function permanentlyDelete(item: MediaItem) {
    setDeleting(true);
    try {
      removeMediaItem(item.id);
      removeMediaByUrl(item.url);
      if (item.sourceMessageId) {
        removeMediaByMessageId(item.sourceMessageId);
        const archive = findChatArchiveByMessageId(item.sourceMessageId);
        if (archive) removeChatArchiveEntry(archive.id);
        deleteTurn(item.sourceMessageId);
      } else {
        purgeMediaUrls(item.url);
      }
      setItems((prev) => {
        const next = prev.filter((i) => i.id !== item.id);
        saveMediaItems(next);
        return next;
      });
      toast.success('Deleted permanently from all sections');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const shown = useMemo(() => {
    const typeFiltered = filter === 'all' ? items : items.filter((i) => i.type === filter);
    const q = query.trim().toLowerCase();
    if (!q) return typeFiltered;
    return typeFiltered.filter((i) => i.name.toLowerCase().includes(q) || (i.sourcePrompt ?? '').toLowerCase().includes(q));
  }, [items, filter, query]);

  const groups = useMemo(() => groupByPrompt(shown), [shown]);
  const imageItems = shown.filter((i) => i.type === 'image');

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
              Tap any thumbnail to jump back to the exact terminal turn — input, output, and variants.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleNewTerminal}
              className="xv-footer-pill !text-[var(--foreground)] flex items-center gap-1.5 border border-[var(--accent)]/30 text-[var(--accent)]"
            >
              <Terminal className="w-3.5 h-3.5" /> New terminal
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="xv-footer-pill !text-[var(--foreground)] flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
          </div>
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
          <div className="space-y-5">
            {imageItems.length > 0 && (
              <div className="glass-panel rounded-2xl border border-[var(--card-border)] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-sm font-semibold">Image gallery</h2>
                  <span className="text-[10px] text-[var(--muted)]">{imageItems.length} items</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {imageItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openInDashboard(item)}
                      className={cn(
                        'group relative aspect-square rounded-xl overflow-hidden border bg-black/5 dark:bg-black/20 transition-all hover:ring-2 hover:ring-[var(--accent)]/50',
                        selectedId === item.id ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/40' : 'border-[var(--card-border)]',
                      )}
                      title={item.sourcePrompt ?? item.name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[8px] text-white line-clamp-2 leading-tight">
                          {(item.sourcePrompt ?? item.name).slice(0, 40)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {groups.map((group) => (
              <div
                key={group.key}
                className="glass-panel rounded-2xl border border-[var(--card-border)] overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-[var(--card-border)]/60 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium truncate">{group.label}</p>
                  <span className="text-[9px] text-[var(--muted)] shrink-0">{group.items.length} file{group.items.length === 1 ? '' : 's'}</span>
                </div>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openInDashboard(item)}
                      className={cn(
                        'relative rounded-xl overflow-hidden border text-left transition-all hover:border-[var(--accent)]/40',
                        item.type === 'video' ? 'aspect-video' : item.type === 'audio' ? 'aspect-[3/1]' : 'aspect-square',
                        selectedId === item.id ? 'border-[var(--accent)]' : 'border-[var(--card-border)]',
                      )}
                    >
                      {item.type === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.url} alt="" className="h-full w-full object-cover" />
                      ) : item.type === 'video' ? (
                        <video src={item.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-[var(--muted)]/10 text-[10px] text-[var(--muted)] px-2">
                          {item.name}
                        </div>
                      )}
                      <span className="absolute top-1 right-1 text-[8px] uppercase px-1 py-0.5 rounded bg-black/50 text-white">
                        {item.type}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="px-3 pb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => group.items[0] && openInDashboard(group.items[0])}
                    className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Open in terminal
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title={`Delete this ${deleteTarget?.type ?? 'file'}?`}
        message="This permanently removes it from AI Media, your chat history, and every saved copy on this device. This cannot be undone."
        onConfirm={() => deleteTarget && permanentlyDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        busy={deleting}
      />
    </PageFullscreenFrame>
  );
}
