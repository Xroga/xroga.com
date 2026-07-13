'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Image as ImageIcon, Upload, Terminal, Sparkles } from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { SectionSearchBar } from '@/components/ui/SectionSearchBar';
import { MediaGenerationCard } from '@/components/dashboard/MediaGenerationCard';
import {
  loadMediaItems,
  saveMediaItems,
  removeMediaItem,
  removeMediaByUrl,
  removeMediaByMessageId,
  purgeMediaUrls,
  MEDIA_UPDATED_EVENT,
  type MediaItem,
} from '@/lib/mediaStorage';
import { groupImageGenerations, extractGenerationThread } from '@/lib/mediaHelpers';
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
  const { setPrompt, deleteTurn, startNewChat, hydrateFromSession, loadIsolatedThread } = useTerminalChat();

  useEffect(() => {
    const refresh = () => setItems(loadMediaItems());
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(MEDIA_UPDATED_EVENT, refresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(MEDIA_UPDATED_EVENT, refresh);
    };
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

  /** Snapshot from when this image was first generated — never the live current terminal. */
  function resolveCreationSnapshot(item: MediaItem) {
    if (item.messagesSnapshot?.length) return item.messagesSnapshot;
    if (item.sourceMessageId) {
      const archive = findChatArchiveByMessageId(item.sourceMessageId);
      if (archive?.messages?.length) return archive.messages;
    }
    return undefined;
  }

  function openOldTerminal(item: MediaItem) {
    setSelectedId(item.id);
    const prompt = item.sourcePrompt ?? item.name;
    const messages = resolveCreationSnapshot(item);

    if (!messages?.length) {
      toast.error('No saved terminal from when this image was created');
      return;
    }

    setPrompt(prompt);
    resumeToDashboard({
      prompt,
      messages,
      selectedId: item.id,
      selectedLabel: item.name,
      source: 'media',
      jumpMessageId: item.sourceMessageId,
    });
    router.push('/workspace');
    setTimeout(() => hydrateFromSession(), 100);
    toast('Old terminal — exact spot where this image was created', { icon: '📍' });
  }

  function openNewTerminalWithCreation(item: MediaItem) {
    setSelectedId(item.id);
    const prompt = item.sourcePrompt ?? item.name;
    const archived = resolveCreationSnapshot(item);
    const thread = extractGenerationThread(archived, item.sourceMessageId);

    if (!thread.length) {
      toast.error('No saved prompt/response for this image');
      return;
    }

    loadIsolatedThread(thread, prompt, item.sourceMessageId);
    router.push('/workspace');
    setTimeout(() => hydrateFromSession(), 100);
    toast('New terminal — your prompt and image output', { icon: '✨' });
  }

  function handleBlankNewTerminal() {
    startNewChat();
    router.push('/workspace');
    toast('Fresh empty terminal', { icon: '🆕' });
  }

  function permanentlyDelete(item: MediaItem) {
    setDeleting(true);
    try {
      removeMediaItem(item.id);
      removeMediaByUrl(item.url);
      if (item.variantUrls?.length) purgeMediaUrls(...item.variantUrls);
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
    return typeFiltered.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.sourcePrompt ?? '').toLowerCase().includes(q),
    );
  }, [items, filter, query]);

  const imageGenerations = useMemo(() => groupImageGenerations(shown), [shown]);
  const nonImageGroups = useMemo(
    () => groupByPrompt(shown.filter((i) => i.type !== 'image')),
    [shown],
  );

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
              Each card shows 1–4 variants. Old terminal jumps to the exact spot where that image was first created.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleBlankNewTerminal}
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
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border capitalize',
                filter === key
                  ? 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)]'
                  : 'border-[var(--card-border)] text-[var(--muted)]',
              )}
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
              Ask Xroga to generate images or audio — they appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {imageGenerations.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                    Image generations
                  </h2>
                  <span className="text-[10px] text-[var(--muted)]">
                    {imageGenerations.length} session{imageGenerations.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {imageGenerations.map((group) => (
                    <MediaGenerationCard
                      key={group.id}
                      group={group}
                      selected={selectedId === group.item.id}
                      onOpenOldTerminal={() => openOldTerminal(group.item)}
                      onOpenNewTerminal={() => openNewTerminalWithCreation(group.item)}
                      onDelete={() => setDeleteTarget(group.item)}
                    />
                  ))}
                </div>
              </div>
            )}

            {nonImageGroups.map((group) => (
              <div
                key={group.key}
                className="glass-panel rounded-2xl border border-[var(--card-border)] overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-[var(--card-border)]/60 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium truncate">{group.label}</p>
                  <span className="text-[9px] text-[var(--muted)] shrink-0">
                    {group.items.length} file{group.items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openOldTerminal(item)}
                      className={cn(
                        'relative rounded-xl overflow-hidden border text-left transition-all hover:border-[var(--accent)]/40',
                        item.type === 'video' ? 'aspect-video' : 'aspect-[3/1]',
                        selectedId === item.id ? 'border-[var(--accent)]' : 'border-[var(--card-border)]',
                      )}
                    >
                      {item.type === 'video' ? (
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
