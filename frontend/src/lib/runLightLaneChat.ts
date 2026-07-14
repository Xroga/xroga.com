import { createClient } from '@/lib/supabase/client';
import { api, ApiError } from '@/lib/api';
import { streamTextReveal } from '@/lib/streamText';
import { isMathQueryPrompt } from '@/lib/mathDetect';

export interface LightLaneHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface LightLaneChatResult {
  response: string;
  webSources?: Array<{
    title: string;
    url: string;
    snippet: string;
    source: string;
    thumbnailUrl?: string;
    siteDomain?: string;
  }>;
  hackathonBrief?: unknown;
  usage: {
    inputTokensUsed: number;
    outputTokensUsed: number;
    totalTokensUsed: number;
    inputTokensRemaining: number;
    outputTokensRemaining: number;
    totalTokensRemaining: number;
    percentUsed: number;
  };
}

/**
 * Light-lane Phase 1 chat — safe to run while a heavy build SSE is in progress.
 * Never starts the swarm build pipeline (caller must not fall through on USE_BUILD_PIPELINE
 * while a heavy build is already active; instead surface a short planning reply / queue tip).
 */
export async function runLightLaneChat(opts: {
  prompt: string;
  history: LightLaneHistoryTurn[];
  signal: AbortSignal;
  onPartial: (partial: string) => void;
  onStatus?: (message: string) => void;
}): Promise<LightLaneChatResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in to chat.');

  const mathPrompt = isMathQueryPrompt(opts.prompt);
  opts.onStatus?.(mathPrompt ? 'Working through the math…' : 'Composing your answer…');

  try {
    const result = await api.phase1.chat(opts.prompt, opts.history);
    await streamTextReveal(result.response, opts.onPartial, opts.signal);
    return result;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 409 || String(err.data?.code) === 'USE_BUILD_PIPELINE')) {
      // User tried a build-y prompt that slipped past the classifier while a build runs.
      const fallback =
        'Your current build is still running. I can keep planning with you in chat — when you are ready for another full build, it will queue as #2 after this one finishes.';
      await streamTextReveal(fallback, opts.onPartial, opts.signal);
      return {
        response: fallback,
        usage: {
          inputTokensUsed: 0,
          outputTokensUsed: 0,
          totalTokensUsed: 0,
          inputTokensRemaining: 0,
          outputTokensRemaining: 0,
          totalTokensRemaining: 0,
          percentUsed: 0,
        },
      };
    }
    throw err;
  }
}
