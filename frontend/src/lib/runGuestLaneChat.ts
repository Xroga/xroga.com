import { API_URL, ApiError } from '@/lib/api';
import { streamTextReveal } from '@/lib/streamText';
import {
  getGuestSessionId,
  setGuestSessionId,
} from '@/lib/guestWorkspace';

export interface GuestLaneHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GuestLaneResult {
  response: string;
  guestSessionId: string;
  guest: {
    limit: number;
    remaining: number;
    resetAt: string;
  };
}

function publishQuota(result: Partial<GuestLaneResult>) {
  if (typeof window === 'undefined' || !result.guest) return;
  window.dispatchEvent(
    new CustomEvent('xroga-guest-quota', {
      detail: result.guest,
    }),
  );
}

export async function runGuestLaneChat(opts: {
  prompt: string;
  history: GuestLaneHistoryTurn[];
  signal: AbortSignal;
  onPartial: (partial: string) => void;
  onStatus?: (message: string) => void;
}): Promise<GuestLaneResult> {
  opts.onStatus?.('Thinking in guest preview…');

  const response = await fetch(`${API_URL}/api/guest/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: opts.signal,
    body: JSON.stringify({
      guestSessionId: getGuestSessionId(),
      message: opts.prompt,
      history: opts.history.slice(-8),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as
    Partial<GuestLaneResult> & {
      error?: string;
      code?: string;
    };

  if (typeof data.guestSessionId === 'string') {
    setGuestSessionId(data.guestSessionId);
  }
  publishQuota(data);

  if (!response.ok) {
    throw new ApiError(
      data.error || 'Guest chat is temporarily unavailable.',
      response.status,
      {
        code: data.code ?? 'GUEST_CHAT_FAILED',
        ...(data.guest ? { guest: data.guest } : {}),
      },
    );
  }

  if (
    typeof data.response !== 'string' ||
    !data.response.trim() ||
    typeof data.guestSessionId !== 'string' ||
    !data.guest
  ) {
    throw new ApiError('Guest chat returned an incomplete response.', 502, {
      code: 'GUEST_CHAT_INVALID_RESPONSE',
    });
  }

  await streamTextReveal(data.response, opts.onPartial, opts.signal);
  return data as GuestLaneResult;
}
