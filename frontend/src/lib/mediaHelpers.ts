import type { ChatMessage } from '@/context/TerminalChatContext';
import type { MediaItem } from '@/lib/mediaStorage';

export interface MediaGenerationGroup {
  id: string;
  label: string;
  prompt: string;
  sourceMessageId?: string;
  variants: string[];
  item: MediaItem;
  createdAt: string;
  messagesSnapshot?: ChatMessage[];
}

/** Collect unique image URLs for a generation (primary + allAttempts). */
export function getVariantUrls(item: MediaItem): string[] {
  const seen = new Set<string>();
  const add = (url?: string) => {
    if (url && !seen.has(url)) {
      seen.add(url);
    }
  };

  if (item.variantUrls?.length) {
    item.variantUrls.forEach(add);
  }
  add(item.url);

  const snapMsg =
    item.messagesSnapshot?.find((m) => m.id === item.sourceMessageId) ??
    item.messagesSnapshot?.findLast((m) => m.role === 'assistant' && m.featureOutput);

  if (snapMsg?.featureOutput && typeof snapMsg.featureOutput === 'object') {
    const o = snapMsg.featureOutput as {
      imageUrl?: string;
      allAttempts?: Array<{ imageUrl?: string; failed?: boolean; blocked?: boolean }>;
      rejectedImages?: Array<{ imageUrl?: string }>;
    };
    add(o.imageUrl);
    for (const a of o.allAttempts ?? []) {
      if (a.imageUrl && !a.failed && !a.blocked) add(a.imageUrl);
    }
    for (const r of o.rejectedImages ?? []) {
      add(r.imageUrl);
    }
  }

  return Array.from(seen);
}

/** Group image media by generation session (one card per prompt turn). */
export function groupImageGenerations(items: MediaItem[]): MediaGenerationGroup[] {
  const images = items.filter((i) => i.type === 'image');
  const map = new Map<string, MediaGenerationGroup>();

  for (const item of images) {
    const key = item.sourceMessageId ?? item.id;
    const variants = getVariantUrls(item);
    const existing = map.get(key);
    if (existing) {
      const merged = new Set([...existing.variants, ...variants]);
      existing.variants = Array.from(merged);
      if (new Date(item.createdAt) > new Date(existing.createdAt)) {
        existing.item = item;
        existing.createdAt = item.createdAt;
      }
      if (item.messagesSnapshot?.length && !existing.messagesSnapshot?.length) {
        existing.messagesSnapshot = item.messagesSnapshot;
      }
      continue;
    }
    map.set(key, {
      id: key,
      label: (item.sourcePrompt ?? item.name).slice(0, 56),
      prompt: item.sourcePrompt ?? item.name,
      sourceMessageId: item.sourceMessageId,
      variants,
      item,
      createdAt: item.createdAt,
      messagesSnapshot: item.messagesSnapshot,
    });
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** User prompt + assistant image turn only — for "new terminal" isolated view. */
export function extractGenerationThread(
  snapshot: ChatMessage[] | undefined,
  sourceMessageId?: string,
): ChatMessage[] {
  if (!snapshot?.length) return [];

  if (!sourceMessageId) {
    const lastUser = [...snapshot].reverse().find((m) => m.role === 'user');
    const lastAssistant = [...snapshot].reverse().find((m) => m.role === 'assistant');
    if (lastUser && lastAssistant) return [lastUser, lastAssistant];
    return snapshot.slice(-2);
  }

  const assistantIdx = snapshot.findIndex((m) => m.id === sourceMessageId);
  if (assistantIdx < 0) return snapshot;

  let userIdx = assistantIdx - 1;
  while (userIdx >= 0 && snapshot[userIdx]?.role !== 'user') userIdx -= 1;

  if (userIdx < 0) return snapshot.slice(0, assistantIdx + 1);
  return snapshot.slice(userIdx, assistantIdx + 1);
}

export function collectVariantUrlsFromOutput(output: unknown): string[] {
  if (!output || typeof output !== 'object') return [];
  const o = output as {
    imageUrl?: string;
    allAttempts?: Array<{ imageUrl?: string; failed?: boolean; blocked?: boolean }>;
  };
  const seen = new Set<string>();
  const add = (url?: string) => {
    if (url) seen.add(url);
  };
  add(o.imageUrl);
  for (const a of o.allAttempts ?? []) {
    if (a.imageUrl && !a.failed && !a.blocked) add(a.imageUrl);
  }
  return Array.from(seen);
}
