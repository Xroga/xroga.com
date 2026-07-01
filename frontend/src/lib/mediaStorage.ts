import type { ChatMessage } from '@/context/TerminalChatContext';
import { isDataImageUrl, messagesForStorage, safeStorageSet } from '@/lib/storageSafe';

export const MEDIA_KEY = 'xroga_media_gallery';
export const MEDIA_UPDATED_EVENT = 'xroga-media-updated';

/** Inline data URLs larger than this are not stored in localStorage (use HTTP URL or snapshot). */
const MAX_INLINE_DATA_URL_CHARS = 380_000;

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
  /** Full thread snapshot at generation time — used for Old terminal jump */
  messagesSnapshot?: import('@/context/TerminalChatContext').ChatMessage[];
}

function pickHttpUrl(...candidates: (string | undefined)[]): string | undefined {
  for (const u of candidates) {
    if (typeof u === 'string' && u.startsWith('http')) return u;
  }
  return undefined;
}

function slimUrlForStorage(url: string, fallbackUrls: string[] = []): string {
  if (!url) return pickHttpUrl(...fallbackUrls) ?? '';
  if (!isDataImageUrl(url)) return url;
  if (url.length <= MAX_INLINE_DATA_URL_CHARS) return url;
  return pickHttpUrl(...fallbackUrls) ?? '';
}

function slimVariantUrls(urls: string[] | undefined): string[] | undefined {
  if (!urls?.length) return undefined;
  const out = urls
    .map((u) => {
      if (!u) return '';
      if (!isDataImageUrl(u)) return u;
      return u.length <= MAX_INLINE_DATA_URL_CHARS ? u : '';
    })
    .filter(Boolean);
  return out.length ? Array.from(new Set(out)) : undefined;
}

function slimMediaItemForStorage(item: MediaItem): MediaItem {
  const variantUrls = slimVariantUrls(item.variantUrls);
  const httpFromVariants = variantUrls?.filter((u) => !isDataImageUrl(u)) ?? [];
  return {
    ...item,
    url: slimUrlForStorage(item.url, httpFromVariants),
    variantUrls,
    messagesSnapshot: item.messagesSnapshot?.length
      ? messagesForStorage(item.messagesSnapshot)
      : undefined,
  };
}

function canPersistItem(item: MediaItem): boolean {
  if (pickHttpUrl(item.url, ...(item.variantUrls ?? []))) return true;
  if (item.url && isDataImageUrl(item.url) && item.url.length <= MAX_INLINE_DATA_URL_CHARS) return true;
  if (item.messagesSnapshot?.length || item.sourceMessageId) return true;
  return Boolean(item.url);
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

function notifyMediaUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(MEDIA_UPDATED_EVENT));
}

export function saveMediaItems(items: MediaItem[]) {
  if (typeof window === 'undefined') return;
  const persistable = items.filter(canPersistItem).map(slimMediaItemForStorage);
  if (safeStorageSet(localStorage, MEDIA_KEY, JSON.stringify(persistable))) {
    notifyMediaUpdated();
  }
}

export function addMediaItem(
  item: Omit<MediaItem, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: string;
    messagesSnapshot?: ChatMessage[];
    variantUrls?: string[];
  }
) {
  const items = loadMediaItems();
  const slimSnapshot = item.messagesSnapshot?.length
    ? messagesForStorage(item.messagesSnapshot)
    : undefined;
  const variantUrls = item.variantUrls?.filter(Boolean);
  const httpPrimary =
    pickHttpUrl(item.url, ...(variantUrls ?? [])) ??
    slimUrlForStorage(item.url, variantUrls ?? []);

  const next: MediaItem = slimMediaItemForStorage({
    id: item.id ?? `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: item.name,
    type: item.type,
    url: httpPrimary,
    createdAt: item.createdAt ?? new Date().toISOString(),
    sourceMessageId: item.sourceMessageId,
    sourcePrompt: item.sourcePrompt,
    variantUrls,
    messagesSnapshot: slimSnapshot,
  });

  const deduped = items.filter(
    (i) =>
      i.id !== next.id &&
      !(i.sourceMessageId && next.sourceMessageId && i.sourceMessageId === next.sourceMessageId) &&
      !(i.url && next.url && i.url === next.url),
  );

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
