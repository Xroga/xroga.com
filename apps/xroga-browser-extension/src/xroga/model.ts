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

export async function startXrogaModelRun(goal: string, startUrl: string, signal: AbortSignal) {
  const start = (await workspaceRequest('start', { goal, startUrl }, signal)) as { runId?: unknown };
  if (typeof start?.runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(start.runId)) {
    throw new Error('Xroga did not admit the browser task.');
  }
  const runId = start.runId;
  let turn = 0;
  const chat = createModel(
    { kind: 'openai-compatible', baseUrl: MODEL_URL, modelName: XROGA_MODEL, maxOutputTokens: 2_048 },
    {
      fetch: async (url, init) => {
        if (String(url) !== `${MODEL_URL}/chat/completions` || typeof init?.body !== 'string') {
          throw new Error('Unexpected browser model request.');
        }
        const request = JSON.parse(init.body);
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
                max_tokens: Math.min(2_048, request.max_tokens ?? request.max_completion_tokens ?? 2_048),
              },
            },
            signal,
          );
          return completionStream(value as Completion);
        } catch {
          // The server may already have charged or fenced this request. Never retry it.
          return Response.json(
            { error: { message: 'The Xroga model request could not be completed or accounted for.' } },
            { status: 400 },
          );
        }
      },
    },
  );
  const profile = resolveProfile({
    kind: 'openai-compatible',
    modelName: XROGA_MODEL,
    overrides: { contextWindow: 16_000, maxOutput: 2_048, vision: false },
  });
  const model: ResolvedModel = { ref: XROGA_REF, chat, profile, reasoning: 'none', reasoningDropped: true };
  return {
    runId,
    model,
    async finish(status: 'completed' | 'failed' | 'cancelled', actions: string[], result?: string) {
      await workspaceRequest('finish', { runId, body: { status, actions, result: result?.slice(0, 12_000) } });
    },
  };
}
