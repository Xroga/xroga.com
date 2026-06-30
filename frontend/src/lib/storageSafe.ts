import type { ChatMessage } from '@/context/TerminalChatContext';

export function isDataImageUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('data:image/');
}

function isDataVideoUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('data:video/');
}

function stripUrl(url: unknown): unknown {
  if (isDataImageUrl(url) || isDataVideoUrl(url)) return '';
  return url;
}

function stripFeatureOutput(output: unknown): unknown {
  if (!output || typeof output !== 'object') return output;
  const o = output as Record<string, unknown>;

  if (o.type === 'video_studio') {
    const next = { ...o };
    const url = o.streamingUrl;
    // Keep HTTP playback URLs; only strip huge inline data URLs (session quota)
    if (isDataVideoUrl(url) && typeof url === 'string' && url.length > 500_000) {
      next.streamingUrl = '';
    }
    return next;
  }

  if (o.type !== 'image') return output;

  const next: Record<string, unknown> = { ...o };
  next.imageUrl = stripUrl(o.imageUrl);

  if (Array.isArray(o.allAttempts)) {
    next.allAttempts = (o.allAttempts as Record<string, unknown>[]).map((a) => ({
      ...a,
      imageUrl: stripUrl(a.imageUrl),
    }));
  }
  if (Array.isArray(o.rejectedImages)) {
    next.rejectedImages = (o.rejectedImages as Record<string, unknown>[]).map((a) => ({
      ...a,
      imageUrl: stripUrl(a.imageUrl),
    }));
  }
  return next;
}

/** Remove multi-MB inline images before session/local storage (prevents QuotaExceeded crashes). */
export function messagesForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    featureOutput: m.featureOutput ? stripFeatureOutput(m.featureOutput) : m.featureOutput,
  }));
}

export function safeStorageSet(storage: Storage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[storage] Failed to write ${key}:`, (err as Error).message);
    return false;
  }
}
