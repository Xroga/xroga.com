import { createModel, resolveProfile } from '@src/llm';
import type { ResolvedModel } from '@src/agent/run';
import { workspaceRequest } from './bridge';

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

export async function startXrogaModelRun(
  goal: string,
  startUrl: string,
  signal: AbortSignal,
  attachmentCount: number,
  resumeId?: string,
) {
  const start = (await (resumeId
    ? workspaceRequest('resume', { runId: resumeId }, signal)
    : workspaceRequest('start', { goal, startUrl, attachmentCount }, signal))) as {
    runId?: string;
    turns?: number;
    maxTurns?: number;
    remainingMs?: number;
    plugins?: boolean;
    activeRunLimit?: number;
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
    { kind: 'openai-compatible', baseUrl: MODEL_URL, modelName: XROGA_MODEL, maxOutputTokens: 2_048 },
    {
      fetch: async (url, init) => {
        if (String(url) !== `${MODEL_URL}/chat/completions` || typeof init?.body !== 'string') {
          throw new Error('Unexpected browser model request.');
        }
        const request = JSON.parse(init.body);
        try {
          // Compaction's summary call is a model request too, and the server counts it. The loop's own turn count does not, so a
          // request can reach the end of the segment before the loop asks for the next one: renew it here, before it is refused.
          if (turn + 1 > maxTurns) await extend();
          const value = await workspaceRequest(
            'turn',
            {
              runId,
              body: {
                turn: ++turn,
                messages: request.messages,
                tools: request.tools,
                tool_choice: request.tool_choice,
                max_tokens: Math.min(2_048, request.max_tokens ?? request.max_completion_tokens ?? 2_048),
              },
            },
            signal,
          );
          return completionStream(value as Completion);
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
    // The server refuses requests over 96,000 bytes. A smaller window here made compaction (itself a model call) fire on almost every turn
    // of a long task, so the window stays at 32,000 and a refused request is recovered through the overflow path above instead.
    overrides: { contextWindow: 32_000, maxOutput: 2_048, vision: false },
  });
  const model: ResolvedModel = { ref: XROGA_REF, chat, profile, reasoning: 'none', reasoningDropped: true };
  /**
   * Asks the server for the run's next segment when this one is used up: the same run, ledger and approvals. The server grants it
   * only while settled spend and its ceilings allow; anything else (or a Workspace relay, which has no such route) is 0 and the
   * caller stops with its saved progress as before.
   */
  const extend = async (): Promise<{ turns: number; remainingMs: number }> => {
    try {
      const next = (await workspaceRequest('extend', { runId, body: {} }, signal)) as { maxTurns?: number; remainingMs?: number };
      const turns = Number.isSafeInteger(next?.maxTurns) ? Math.max(0, (next.maxTurns as number) - maxTurns) : 0;
      if (Number.isSafeInteger(next?.maxTurns)) maxTurns = Math.max(maxTurns, next.maxTurns as number);
      return { turns, remainingMs: Number.isSafeInteger(next?.remainingMs) ? Math.max(0, next.remainingMs as number) : 0 };
    } catch {
      return { turns: 0, remainingMs: 0 };
    }
  };
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
