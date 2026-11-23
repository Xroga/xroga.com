import { createModel, resolveProfile } from '@src/llm';
import type { ResolvedModel } from '@src/agent/run';
import { workspaceRequest } from './bridge';
import { fitRequest } from './fit-request';
import { EffortControl, outputRoom } from './effort';

export const XROGA_MODEL = 'deepseek_v4_1_flash_1017';
export const XROGA_REF = { providerId: 'xroga-workspace', model: XROGA_MODEL };
const MODEL_URL = 'https://xroga.com/extension-model/v1';

type Completion = {
  id: string;
  model: string;
  choice: {
    finish_reason?: string;
    message: {
      content?: string;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
  };
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

function completionStream(value: Completion) {
  const { id, model, choice, usage } = value;
  if (!id || !choice?.message || !usage) throw new Error('Xroga did not return a settled model completion.');
  const header = { id, model, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000) };
  const delta = {
    role: 'assistant',
    ...(choice.message.content ? { content: choice.message.content } : {}),
    ...(choice.message.tool_calls?.length
      ? { tool_calls: choice.message.tool_calls.map((call, index) => ({ ...call, index })) }
      : {}),
  };
  const chunks = [
    { ...header, choices: [{ index: 0, delta, finish_reason: null }] },
    { ...header, choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason ?? 'stop' }], usage },
  ];
  const body = chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

/**
 * Resuming right after the extension was killed (a service-worker stop, a Chrome restart) meets the server still finishing the request the
 * killed worker had in flight: it holds the run's lease until that request ends or the lease runs out (100 s). The server answers
 * BROWSER_RUN_BUSY and keeps the run intact, so the resume asks again for up to two minutes instead of failing the run. Only that code is
 * retried, and it is a lease check, so nothing is ever repeated.
 */
export const RESUME_BUSY_WINDOW_MS = 120_000;
export async function resumeRun(runId: string, signal: AbortSignal, request: typeof workspaceRequest = workspaceRequest, wait = 2_500): Promise<unknown> {
  const give = Date.now() + RESUME_BUSY_WINDOW_MS;
  for (;;) {
    try {
      return await request('resume', { runId }, signal);
    } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== 'BROWSER_RUN_BUSY' || signal.aborted || Date.now() + wait > give) throw error;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, wait);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
    }
  }
}

export async function startXrogaModelRun(
  goal: string,
  startUrl: string,
  signal: AbortSignal,
  attachmentCount: number,
  resumeId?: string,
  effort: EffortControl = new EffortControl(),
) {
  const start = (await (resumeId
    ? resumeRun(resumeId, signal)
    : workspaceRequest('start', { goal, startUrl, attachmentCount }, signal))) as {
    runId?: string;
    turns?: number;
    maxTurns?: number;
    remainingMs?: number;
    plugins?: boolean;
    activeRunLimit?: number;
    /** The model route accepts page images (verified on the server); otherwise screenshots stay local. */
    vision?: boolean;
  };
  if (typeof start?.runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(start.runId)) {
    throw new Error('Xroga did not admit the browser task.');
  }
  const runId = start.runId;
  let turn = start.turns ?? 0;
  let requestInterrupted = false;
  let lastErrorCode: string | undefined;
  let allowance: { nextUnlockAt?: string } | undefined;
  const remainingTurns = (start.maxTurns ?? 12) - turn;
  const remainingMs = start.remainingMs ?? 600_000;
  let maxTurns = start.maxTurns ?? 12;
  if (
    !Number.isSafeInteger(remainingTurns) ||
    remainingTurns <= 0 ||
    !Number.isSafeInteger(remainingMs) ||
    remainingMs <= 0 ||
    (resumeId && resumeId !== runId)
  ) {
    throw new Error('This browser task has reached its time or turn limit.');
  }
  const chat = createModel(
    { kind: 'openai-compatible', baseUrl: MODEL_URL, modelName: XROGA_MODEL, maxOutputTokens: 6_144 },
    {
      fetch: async (url, init) => {
        if (String(url) !== `${MODEL_URL}/chat/completions` || typeof init?.body !== 'string') {
          throw new Error('Unexpected browser model request.');
        }
        const request = fitRequest(JSON.parse(init.body));
        try {
          // Compaction's summary call is a model request too, and the server counts it. The loop's own turn count does not, so a
          // request can reach the end of the segment before the loop asks for the next one: renew it here, before it is refused.
          if (turn + 1 > maxTurns) await renew(false);
          // Many people share the model: when its gate is full the server says so before any provider call, charges nothing and
          // the task simply waits its turn. Up to 20 minutes of waiting, with a growing pause, instead of an error for the person.
          const deadline = Date.now() + 20 * 60_000;
          let stalls = 0;
          for (let wait = 2_000; ; wait = Math.min(15_000, Math.round(wait * 1.5))) {
            try {
              const value = await workspaceRequest(
                'turn',
                {
                  runId,
                  body: {
                    turn: ++turn,
                    messages: request.messages,
                    tools: request.tools,
                    tool_choice: request.tool_choice,
                    // Reasoning tokens count against the output limit: a thinking turn gets more room than the 2,048 of a plain one. The server asks
                    // for the effort it allows (none, high, max), sets the room and the spend ceiling for it, and answers with the effort it used.
                    reasoning_effort: effort.level,
                    max_tokens: Math.min(outputRoom(effort.level), request.max_tokens ?? request.max_completion_tokens ?? outputRoom(effort.level)),
                  },
                },
                signal,
              );
              return completionStream(value as Completion);
            } catch (busy) {
              // A model request that stalled or got a temporary server error (the provider did not answer in time) is asked again, up to
              // three times, under the next turn number: it is a model call only, so no browser action or app change is ever repeated.
              const code = (busy as { code?: unknown } | null)?.code;
              const temporary = code === 'BROWSER_GATEWAY_UNAVAILABLE' || code === 'BROWSER_MODEL_EMPTY';
              if (temporary && !signal.aborted && stalls < 3) stalls++;
              else if (code !== 'BROWSER_MODEL_BUSY' || Date.now() + wait > deadline) throw busy;
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, wait);
                signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
              });
              if (turn + 1 > maxTurns) await renew(false);
            }
          }
        } catch (error) {
          // The owner's entitlement ledger refused the turn: nothing was charged and the run's progress is kept, so it can resume.
          if ((error as { code?: unknown } | null)?.code === 'BROWSER_ALLOWANCE_EXHAUSTED') {
            allowance = {};
            return Response.json({ error: { message: 'Your Xroga usage allowance is used up for now.' } }, { status: 400 });
          }
          // The server refused the request before reserving anything because it is over its size cap (96,000 bytes). Nothing was
          // charged and the server's turn counter did not move, so give the turn number back and report it as an overflow: the loop
          // then compacts the context and asks again, instead of pausing the run as unverified.
          if ((error as { code?: unknown } | null)?.code === 'BROWSER_CONTEXT_TOO_LARGE') {
            turn--;
            return Response.json({ error: { message: 'request too large' } }, { status: 413 });
          }
          // The server may already have charged or fenced this request. Never retry it.
          requestInterrupted = !signal.aborted;
          const rawCode = (error as { code?: unknown } | null)?.code;
          lastErrorCode =
            typeof rawCode === 'string' && /^[A-Z_]{3,64}$/.test(rawCode)
              ? rawCode
              : error instanceof Error
                ? `${error.name}: ${error.message}`.replace(/\s+/g, ' ').slice(0, 120)
                : (() => {
                    try {
                      return JSON.stringify(error)?.replace(/\s+/g, ' ').slice(0, 160);
                    } catch {
                      return undefined;
                    }
                  })();
          return Response.json(
            {
              error: {
                message: `The Xroga model request could not be completed or accounted for${
                  typeof (error as { code?: unknown } | null)?.code === 'string' && /^[A-Z_]{3,64}$/.test((error as { code: string }).code)
                    ? ` (${(error as { code: string }).code})`
                    : ''
                }.`,
              },
            },
            { status: 400 },
          );
        }
      },
    },
  );
  const profile = resolveProfile({
    kind: 'openai-compatible',
    modelName: XROGA_MODEL,
    // The model reads a million tokens, and the server takes a turn of up to 1,200,000 bytes of text and 24,000 output tokens at high. A 32,000-token window made a long
    // task (client research across many pages) compact on almost every turn and end with "start a new conversation" (owner's recording, 2026-11-23). The window is now 200,000
    // tokens; compaction is housekeeping for a task that really is that long, and a refused request is still recovered through the overflow path above.
    overrides: { contextWindow: 200_000, maxOutput: 24_000, vision: start.vision === true },
  });
  const model: ResolvedModel = { ref: XROGA_REF, chat, profile, reasoning: 'none', reasoningDropped: true };
  /**
   * Asks the server for the run's next segment when this one is used up: the same run, ledger and approvals. The server grants it
   * only while settled spend and its ceilings allow; anything else (or a Workspace relay, which has no such route) is 0 and the
   * caller stops with its saved progress as before.
   */
  // The turns the agent loop has been told it may use. The model path below also renews the server's segment early (a compaction summary
  // is a model request the loop does not count), so the server may already be ahead of what the loop was given: the loop is credited with
  // the difference, never with "0 new turns" just because the server had already granted them. (That mistake ended long tasks at
  // "turn limit" with work left.)
  let loopMax = start.maxTurns ?? 12;
  const renew = async (forLoop: boolean): Promise<{ turns: number; remainingMs: number }> => {
    try {
      const next = (await workspaceRequest('extend', { runId, body: {} }, signal)) as { maxTurns?: number; remainingMs?: number };
      const granted = Number.isSafeInteger(next?.maxTurns) ? (next.maxTurns as number) : 0;
      if (granted) maxTurns = Math.max(maxTurns, granted);
      let turns = 0;
      if (forLoop && granted) {
        turns = Math.max(0, granted - loopMax);
        loopMax = Math.max(loopMax, granted);
      }
      return { turns, remainingMs: Number.isSafeInteger(next?.remainingMs) ? Math.max(0, next.remainingMs as number) : 0 };
    } catch {
      return { turns: 0, remainingMs: 0 };
    }
  };
  const extend = () => renew(true);
  return {
    runId,
    model,
    extend,
    plugins: start.plugins === true,
    /** How many runs this account may have active at once (parent plus workers), as the server said when this run started. */
    activeRunLimit: Number.isInteger(start.activeRunLimit) ? (start.activeRunLimit as number) : undefined,
    remainingTurns,
    remainingMs,
    get allowanceExhausted() {
      return !!allowance;
    },
    /** The server's own error code for the request that could not be verified (a fixed code, never user data). */
    get lastErrorCode() {
      return lastErrorCode;
    },
    get requestInterrupted() {
      return requestInterrupted;
    },
  };
}
