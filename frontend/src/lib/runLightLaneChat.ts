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
  usage?: {
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
  projectContext?: { repo: string; branch: string; projectRoot: string } | null;
  signal: AbortSignal;
  onPartial: (partial: string) => void;
  onStatus?: (message: string) => void;
}): Promise<LightLaneChatResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in to chat.');

  opts.onStatus?.('Understanding your request…');

  try {
    const plan = await api.phase1.plan(opts.prompt, opts.history, undefined, opts.projectContext ?? null);
    if (plan.directResponse) {
      opts.onPartial(plan.directResponse);
      return { response: plan.directResponse, usage: plan.usage };
    }
    if (plan.dispatch === 'build') {
      throw new ApiError(
        'This request needs the build pipeline.',
        409,
        { code: 'QUEUE_BUILD' },
      );
    }
    if (plan.dispatch === 'blocked') {
      const response = plan.blockers.length
        ? `I can't complete that with the capabilities or authorization currently available: ${plan.blockers.join(' · ')}`
        : 'I could not match this request to an available, authorized capability.';
      await streamTextReveal(response, opts.onPartial, opts.signal);
      return { response, usage: plan.usage };
    }
    const mathPrompt = isMathQueryPrompt(opts.prompt);
    opts.onStatus?.(mathPrompt ? 'Working through the math…' : 'Composing your answer…');
    const result = await api.phase1.chat(opts.prompt, opts.history, undefined, plan.goalContract);
    await streamTextReveal(result.response, opts.onPartial, opts.signal);
    return result;
  } catch (err) {
    if (err instanceof ApiError && String(err.data?.code) === 'QUEUE_BUILD') throw err;
    if (err instanceof ApiError && (err.status === 409 || String(err.data?.code) === 'USE_BUILD_PIPELINE')) {
      // User tried a build-y prompt that slipped past the classifier while a build runs.
      const fallback =
        'Your current build is still running. I can keep planning with you in chat — when you are ready for another full build, it will queue as #2 after this one finishes.';
      await streamTextReveal(fallback, opts.onPartial, opts.signal);
      // Do NOT invent 0 remaining — that flashed “0 tokens left” in the sidebar.
      // Caller should refresh from /dashboard/summary; omit usage here.
      return {
        response: fallback,
      } as LightLaneChatResult;
    }
    throw err;
  }
}
