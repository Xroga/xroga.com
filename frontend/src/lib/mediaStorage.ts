export const MEDIA_KEY = 'xroga_media_gallery';

export type MediaType = 'image' | 'video' | 'audio';

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  createdAt: string;
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
  localStorage.setItem(MEDIA_KEY, JSON.stringify(items));
}

export function addMediaItem(item: Omit<MediaItem, 'id' | 'createdAt'> & { id?: string }) {
  const items = loadMediaItems();
  const next: MediaItem = {
    id: item.id ?? `media-${Date.now()}`,
    name: item.name,
    type: item.type,
    url: item.url,
    createdAt: new Date().toISOString(),
  };
  saveMediaItems([next, ...items]);
  return next;
}
