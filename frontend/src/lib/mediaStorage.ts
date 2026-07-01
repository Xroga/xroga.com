import type { ChatMessage } from '@/context/TerminalChatContext';
import { isDataImageUrl, messagesForStorage, safeStorageSet } from '@/lib/storageSafe';

export const MEDIA_KEY = 'xroga_media_gallery';

export type MediaType = 'image' | 'video' | 'audio';

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  createdAt: string;
  /** Jump back to the chat message that produced this asset */
  sourceMessageId?: string;
  sourcePrompt?: string;
  /** All variant URLs from one generation (1–4 images) */
  variantUrls?: string[];
  /** Full thread snapshot for restoring terminal when jumping from AI Media */
  messagesSnapshot?: import('@/context/TerminalChatContext').ChatMessage[];
}

export function loadMediaItems(): MediaItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(MEDIA_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as MediaItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMediaItems(items: MediaItem[]) {
  if (typeof window === 'undefined') return;
  const persistable = items.filter((i) => !isDataImageUrl(i.url));
  safeStorageSet(localStorage, MEDIA_KEY, JSON.stringify(persistable));
}

export function addMediaItem(
  item: Omit<MediaItem, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: string;
    messagesSnapshot?: ChatMessage[];
    variantUrls?: string[];
  }
) {
  if (isDataImageUrl(item.url)) {
    return {
      id: item.id ?? `media-${Date.now()}`,
      name: item.name,
      type: item.type,
      url: item.url,
      createdAt: item.createdAt ?? new Date().toISOString(),
      sourceMessageId: item.sourceMessageId,
      sourcePrompt: item.sourcePrompt,
      variantUrls: item.variantUrls,
      messagesSnapshot: item.messagesSnapshot,
    };
  }
  const items = loadMediaItems();
  const slimSnapshot = item.messagesSnapshot?.length
    ? messagesForStorage(item.messagesSnapshot)
    : undefined;
  const next: MediaItem = {
    id: item.id ?? `media-${Date.now()}`,
    name: item.name,
    type: item.type,
    url: item.url,
    createdAt: item.createdAt ?? new Date().toISOString(),
    sourceMessageId: item.sourceMessageId,
    sourcePrompt: item.sourcePrompt,
    variantUrls: item.variantUrls?.filter(Boolean),
    messagesSnapshot: slimSnapshot,
  };
  const deduped = items.filter((i) => i.url !== next.url || i.sourceMessageId !== next.sourceMessageId);
  saveMediaItems([next, ...deduped]);
  return next;
}

export function removeMediaItem(id: string) {
  saveMediaItems(loadMediaItems().filter((i) => i.id !== id));
}

export function removeMediaByUrl(url: string) {
  if (!url) return;
  saveMediaItems(loadMediaItems().filter((i) => i.url !== url));
}

export function removeMediaByMessageId(messageId: string) {
  if (!messageId) return;
  saveMediaItems(loadMediaItems().filter((i) => i.sourceMessageId !== messageId));
}

/** Remove one media item and every stored copy of its URL. */
export function purgeMediaUrls(...urls: string[]) {
  const drop = new Set(urls.filter(Boolean));
  if (!drop.size) return;
  saveMediaItems(loadMediaItems().filter((i) => !drop.has(i.url)));
}
