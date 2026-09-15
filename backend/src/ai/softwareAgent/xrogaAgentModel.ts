import OpenAI from 'openai';

import {
  resolveEndpoint,
} from '../openaiCompat.js';

import {
  getModelRuntimeHealth,
  recordModelExecution,
} from '../providerRuntime.js';

import {
  withProviderReservation,
  type ProviderUsageResult,
} from '../providerBudget.js';

import {
  recordUsage,
} from '../quota.js';

import type {
  ModelId,
} from '../models.js';

import type {
  SoftwareAgentModelRoute,
  SoftwareAgentPrebuiltModel,
} from './agentModelRoute.js';

type AgentModelRequest =
  Parameters<
    SoftwareAgentPrebuiltModel[
      'stream'
    ]
  >[0];

type AgentModelStream =
  Awaited<
    ReturnType<
      SoftwareAgentPrebuiltModel[
        'stream'
      ]
    >
  >;

type AgentModelEvent =
  AgentModelStream extends
    AsyncIterable<infer TEvent>
      ? TEvent
      : never;

type AgentMessage =
  AgentModelRequest[
    'messages'
  ][number];

type AgentMessagePart =
  AgentMessage[
    'content'
  ][number];

type AgentToolDefinition =
  AgentModelRequest[
    'tools'
  ][number];

type ToolCallPart =
  Extract<
    AgentMessagePart,
    {
      type: 'tool-call';
    }
  >;

type ToolResultPart =
  Extract<
    AgentMessagePart,
    {
      type: 'tool-result';
    }
  >;

type FinishEvent =
  Extract<
    AgentModelEvent,
    {
      type: 'finish';
    }
  >;

const DEFAULT_MAXIMUM_OUTPUT_TOKENS =
  8_192;

const MAXIMUM_AGENT_OUTPUT_TOKENS =
  16_384;

interface BufferedAgentTurn
  extends ProviderUsageResult {
  events: AgentModelEvent[];
}

export interface XrogaAgentModelInput {
  userId: string;

  modelId: ModelId;

  /**
   * Optional user-owned provider credential already decrypted by Xroga.
   *
   * It never leaves the backend and is passed only to Xroga's existing
   * provider endpoint resolver.
   */
  credentialOverride?: string;

  maximumOutputTokens?: number;
}

function requireUserId(
  value: string,
): string {
  const userId =
    value.trim();

  if (!userId) {
    throw new Error(
      'Authenticated Xroga user is required for software-agent model execution.',
    );
  }

  return userId;
}

function normalizeMaximumOutputTokens(
  value: number | undefined,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_MAXIMUM_OUTPUT_TOKENS;
  }

  return Math.min(
    Math.max(
      Math.floor(value),
      1_024,
    ),
    MAXIMUM_AGENT_OUTPUT_TOKENS,
  );
}

function stringifyToolValue(
  value: unknown,
): string {
  if (
    typeof value === 'string'
  ) {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function textFromPart(
  part: AgentMessagePart,
): string | null {
  switch (part.type) {
    case 'text':
      return part.text;

    case 'file':
      return [
        `<file path="${part.path}">`,
        part.content,
        '</file>',
      ].join('\n');

    /*
     * Reasoning is model working, not conversational content.
     * Never replay hidden reasoning into another provider request.
     */
    case 'reasoning':
      return null;

    /*
     * Software Agent V2 currently operates on repository files and
     * deterministic tool evidence. Image/media and tool protocol parts
     * are handled elsewhere or deliberately omitted from plain text.
     */
    case 'image':
    case 'media':
    case 'tool-call':
    case 'tool-result':
      return null;

    default:
      return null;
  }
}

function textContent(
  message: AgentMessage,
): string {
  return message.content
    .map(
      (
        part:
          AgentMessagePart,
      ) =>
        textFromPart(
          part,
        ),
    )
    .filter(
      (
        value:
          string |
          null,
      ): value is string =>
        typeof value ===
        'string' &&
        value.length > 0,
    )
    .join('\n');
}

function assistantToolCalls(
  message: AgentMessage,
): OpenAI.Chat.ChatCompletionMessageToolCall[] {
  return message.content
    .filter(
      (
        part:
          AgentMessagePart,
      ): part is ToolCallPart =>
        part.type ===
        'tool-call',
    )
    .map(
      (
        part:
          ToolCallPart,
      ) => ({
        id:
          part.toolCallId,

        type:
          'function' as const,

        function: {
          name:
            part.toolName,

          arguments:
            stringifyToolValue(
              part.input,
            ),
        },
      }),
    );
}

function toolResultMessages(
  message: AgentMessage,
): OpenAI.Chat.ChatCompletionToolMessageParam[] {
  return message.content
    .filter(
      (
        part:
          AgentMessagePart,
      ): part is ToolResultPart =>
        part.type ===
        'tool-result',
    )
    .map(
      (
        part:
          ToolResultPart,
      ) => ({
        role:
          'tool' as const,

        tool_call_id:
          part.toolCallId,

        content:
          stringifyToolValue(
            part.output,
          ),
      }),
    );
}

function toOpenAiMessages(
  request: AgentModelRequest,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages:
    OpenAI.Chat.ChatCompletionMessageParam[] =
    [];

  if (
    request.systemPrompt?.trim()
  ) {
    messages.push({
      role:
        'system',

      content:
        request.systemPrompt,
    });
  }

  for (
    const message of
    request.messages
  ) {
    if (
      message.role ===
      'tool'
    ) {
      messages.push(
        ...toolResultMessages(
          message,
        ),
      );

      continue;
    }

    if (
      message.role ===
      'assistant'
    ) {
      const content =
        textContent(
          message,
        );

      const toolCalls =
        assistantToolCalls(
          message,
        );

      messages.push({
        role:
          'assistant',

        content:
          content ||
          null,

        ...(toolCalls.length
          ? {
              tool_calls:
                toolCalls,
            }
          : {}),
      });

      continue;
    }

    const content =
      textContent(
        message,
      );

    /*
     * A user message should never become structurally empty because
     * unsupported content was present. An explicit placeholder states
     * the evidence gap without pretending to have inspected it.
     */
    messages.push({
      role:
        'user',

      content:
        content ||
        '[Unsupported non-text content was omitted from this software-agent turn.]',
    });
  }

  return messages;
}

function toOpenAiTools(
  tools:
    readonly AgentToolDefinition[],
): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map(
    (
      tool:
        AgentToolDefinition,
    ) => ({
      type:
        'function' as const,

      function: {
        name:
          tool.name,

        description:
          tool.description,

        parameters:
          tool.inputSchema,
      },
    }),
  );
}

function safeJsonSize(
  value: unknown,
): number {
  try {
    return JSON.stringify(
      value,
    ).length;
  } catch {
    return String(
      value,
    ).length;
  }
}

function estimateRequestTokens(
  request: AgentModelRequest,
): number {
  let characters =
    request.systemPrompt
      ?.length ??
    0;

  characters +=
    safeJsonSize(
      request.messages,
    );

  characters +=
    safeJsonSize(
      request.tools,
    );

  /*
   * Conservative reservation estimate. Actual provider usage remains
   * authoritative for settlement.
   */
  return Math.max(
    1,
    Math.ceil(
      characters /
      4,
    ),
  );
}

function finishReason(
  value:
    | string
    | null
    | undefined,
): FinishEvent[
  'reason'
] {
  switch (value) {
    case 'tool_calls':
    case 'function_call':
      return 'tool-calls';

    case 'length':
      return 'max-tokens';

    case 'content_filter':
      return 'error';

    case 'stop':
    default:
      return 'stop';
  }
}

function assertModelAvailable(
  modelId: ModelId,
): void {
  const health =
    getModelRuntimeHealth(
      modelId,
    );

  if (
    health.status ===
      'unavailable' ||
    health.status ===
      'circuit_open'
  ) {
    const error =
      new Error(
        'The selected software-agent model is temporarily unavailable.',
      ) as Error & {
        code?: string;
      };

    error.code =
      'SOFTWARE_AGENT_MODEL_UNAVAILABLE';

    throw error;
  }
}

async function runBufferedTurn(
  input: {
    userId: string;
    modelId: ModelId;
    credentialOverride?: string;
    maximumOutputTokens: number;
    request: AgentModelRequest;
  },
): Promise<BufferedAgentTurn> {
  assertModelAvailable(
    input.modelId,
  );

  const estimatedInputTokens =
    estimateRequestTokens(
      input.request,
    );

  return withProviderReservation({
    userId:
      input.userId,

    modelId:
      input.modelId,

    estimatedInputTokens,

    maximumOutputTokens:
      input.maximumOutputTokens,

    purpose:
      'daily_work',

    execute:
      async () => {
        const startedAt =
          Date.now();

        try {
          const endpoint =
            resolveEndpoint(
              input.modelId,
              input.credentialOverride,
            );

          const client =
            new OpenAI({
              apiKey:
                endpoint.apiKey,

              baseURL:
                endpoint.baseUrl,

              timeout:
                180_000,

              maxRetries:
                1,

              defaultHeaders:
                endpoint.defaultHeaders,
            });

          const messages =
            toOpenAiMessages(
              input.request,
            );

          const tools =
            toOpenAiTools(
              input.request.tools,
            );

          const stream =
            await client.chat.completions.create(
              {
                model:
                  endpoint.apiModel,

                messages,

                max_tokens:
                  input.maximumOutputTokens,

                stream:
                  true,

                stream_options: {
                  include_usage:
                    true,
                },

                ...(tools.length
                  ? {
                      tools,

                      tool_choice:
                        'auto' as const,
                    }
                  : {}),
              },

              input.request.signal
                ? {
                    signal:
                      input.request.signal,
                  }
                : undefined,
            );

          const events:
            AgentModelEvent[] =
            [];

          let providerRequestId:
            string |
            undefined;

          let inputTokens =
            0;

          let outputTokens =
            0;

          let cachedInputTokens =
            0;

          let reasoningTokens =
            0;

          let finalReason:
            string |
            null |
            undefined =
            'stop';

          const toolCallIds =
            new Set<string>();

          for await (
            const chunk of
            stream
          ) {
            providerRequestId =
              providerRequestId ??
              chunk.id;

            const choice =
              chunk.choices[0];

            const delta =
              choice?.delta;

            if (
              typeof delta
                ?.content ===
                'string' &&
              delta.content
            ) {
              events.push({
                type:
                  'text-delta',

                text:
                  delta.content,
              } as AgentModelEvent);
            }

            const toolCalls =
              delta?.tool_calls ??
              [];

            for (
              const toolCall of
              toolCalls
            ) {
              if (
                toolCall.id
              ) {
                toolCallIds.add(
                  toolCall.id,
                );
              }

              events.push({
                type:
                  'tool-call-delta',

                index:
                  toolCall.index,

                toolCallId:
                  toolCall.id,

                toolName:
                  toolCall.function
                    ?.name,

                inputText:
                  toolCall.function
                    ?.arguments,
              } as AgentModelEvent);
            }

            if (
              choice
                ?.finish_reason
            ) {
              finalReason =
                choice.finish_reason;
            }

            if (
              chunk.usage
            ) {
              inputTokens =
                chunk.usage
                  .prompt_tokens ??
                inputTokens;

              outputTokens =
                chunk.usage
                  .completion_tokens ??
                outputTokens;

              cachedInputTokens =
                chunk.usage
                  .prompt_tokens_details
                  ?.cached_tokens ??
                cachedInputTokens;

              reasoningTokens =
                chunk.usage
                  .completion_tokens_details
                  ?.reasoning_tokens ??
                reasoningTokens;
            }
          }

          events.push({
            type:
              'usage',

            usage: {
              inputTokens,

              outputTokens,

              cacheReadTokens:
                cachedInputTokens,

              cacheWriteTokens:
                0,

              ...(reasoningTokens > 0
                ? {
                    reasoningTokenCount:
                      reasoningTokens,
                  }
                : {}),
            },
          } as AgentModelEvent);

          events.push({
            type:
              'finish',

            reason:
              finishReason(
                finalReason,
              ),
          } as AgentModelEvent);

          recordModelExecution(
            input.modelId,
            {
              ok:
                true,

              latencyMs:
                Date.now() -
                startedAt,
            },
          );

          return {
            events,

            providerRequestId,

            inputTokens,

            cachedInputTokens,

            outputTokens,

            reasoningTokens,

            toolCalls:
              toolCallIds.size,
          };
        } catch (
          error
        ) {
          recordModelExecution(
            input.modelId,
            {
              ok:
                false,

              latencyMs:
                Date.now() -
                startedAt,

              error,
            },
          );

          throw error;
        }
      },
  });
}

export function createXrogaAgentModel(
  input: XrogaAgentModelInput,
): SoftwareAgentPrebuiltModel {
  const userId =
    requireUserId(
      input.userId,
    );

  const maximumOutputTokens =
    normalizeMaximumOutputTokens(
      input.maximumOutputTokens,
    );

  const credentialOverride =
    input.credentialOverride
      ?.trim() ||
    undefined;

  const model:
    SoftwareAgentPrebuiltModel = {
      async *stream(
        request:
          AgentModelRequest,
      ) {
        const turn =
          await runBufferedTurn({
            userId,

            modelId:
              input.modelId,

            credentialOverride,

            maximumOutputTokens,

            request,
          });

        /*
         * Provider-budget settlement has completed before these events are
         * released into the agent loop. This keeps accounting truthful even
         * if the caller disconnects immediately after the model turn.
         */
        await recordUsage(
          userId,
          input.modelId,
          turn.inputTokens,
          turn.outputTokens,
        );

        for (
          const event of
          turn.events
        ) {
          yield event;
        }
      },
    };

  return model;
}

export function createXrogaAgentModelRoute(
  input: XrogaAgentModelInput,
): SoftwareAgentModelRoute {
  return {
    model:
      createXrogaAgentModel(
        input,
      ),

    routeId:
      `xroga:${input.modelId}`,
  };
}
