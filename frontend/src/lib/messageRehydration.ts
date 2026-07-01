import type { ChatMessage } from '@/context/TerminalChatContext';
import { loadMediaItems } from '@/lib/mediaStorage';

function isMissingUrl(url: unknown): boolean {
  return typeof url !== 'string' || url.length === 0;
}

/** Restore stripped image/video URLs from AI Media after reload. */
export function rehydrateMessagesWithMedia(messages: ChatMessage[]): ChatMessage[] {
  if (!messages.length || typeof window === 'undefined') return messages;

  const mediaItems = loadMediaItems();
  if (!mediaItems.length) return messages;

  const byMessageId = new Map<string, typeof mediaItems>();
  for (const item of mediaItems) {
    if (!item.sourceMessageId) continue;
    const list = byMessageId.get(item.sourceMessageId) ?? [];
    list.push(item);
    byMessageId.set(item.sourceMessageId, list);
  }

  return messages.map((msg) => {
    if (msg.role !== 'assistant' || !msg.featureOutput || typeof msg.featureOutput !== 'object') {
      return msg;
    }

    const related = byMessageId.get(msg.id);
    if (!related?.length) return msg;

    const output = { ...(msg.featureOutput as Record<string, unknown>) };
    const type = output.type as string | undefined;

    if (type === 'image') {
      const imageUrls = related.filter((m) => m.type === 'image' && m.url).map((m) => m.url);
      if (!imageUrls.length) return msg;

      if (isMissingUrl(output.imageUrl)) {
        output.imageUrl = imageUrls[0];
      }

      const patchList = (list: unknown): Record<string, unknown>[] => {
        if (!Array.isArray(list)) return [];
        return list.map((entry, i) => {
          if (!entry || typeof entry !== 'object') return entry as Record<string, unknown>;
          const row = { ...(entry as Record<string, unknown>) };
          if (isMissingUrl(row.imageUrl)) {
            const fallback = imageUrls[i] ?? imageUrls[0];
            if (fallback) row.imageUrl = fallback;
          }
          return row;
        });
      };

      const attempts = patchList(output.allAttempts);
      const seen = new Set(attempts.map((a) => a.imageUrl).filter(Boolean));
      for (const url of imageUrls) {
        if (!seen.has(url)) {
          attempts.push({ imageUrl: url, provider: 'Restored', matchScore: 0 });
          seen.add(url);
        }
      }

      output.allAttempts = attempts;
      output.rejectedImages = patchList(output.rejectedImages);
      return { ...msg, featureOutput: output };
    }

    if (type === 'video_studio' && isMissingUrl(output.streamingUrl)) {
      const video = related.find((m) => m.type === 'video' && m.url);
      if (video?.url) {
        output.streamingUrl = video.url;
        return { ...msg, featureOutput: output };
      }
    }

    return msg;
  });
}
