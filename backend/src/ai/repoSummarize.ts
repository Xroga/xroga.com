/**
 * Cached repository understanding.
 *
 * Normal repo understanding -> GLM-5.3 Flash
 * Large / long-horizon repo  -> GLM-5.3
 */

import {
  chatCompletion,
  estimateMessageTokens,
  type ChatMessage,
} from './openaiCompat.js';

import type {
  ModelId,
} from './models.js';

import {withTenantModelReservation,type TenantModelScope} from './tenantModelDispatch.js';
import {requireResourceOwner} from '../security/tenantContext.js';
import {isModelSecurityDenial} from './providerRuntime.js';

import type {
  ProjectFile,
} from './patches.js';

import {
  userWantsRepoIntelligence,
} from './projectMemory.js';

export async function summarizeRepoForUpdates(
  opts: {
    userId: string;
    dispatchScope: TenantModelScope;

    prompt: string;

    projectName?: string;

    paths: string[];

    sampleFiles:
      ProjectFile[];

    preferLongContext?: boolean;
  },
): Promise<
  | {
      summary: string;

      modelId: ModelId;

      inputTokens: number;

      outputTokens: number;
    }
  | null
> {
  requireResourceOwner(opts.dispatchScope.context,opts.userId);
  requireResourceOwner(opts.dispatchScope.context,opts.dispatchScope.userId);
  const needsSeniorContext =
    Boolean(
      opts.preferLongContext,
    ) ||
    userWantsRepoIntelligence(
      opts.prompt,
    ) ||
    opts.paths.length >= 20;

  const modelId: ModelId =
    needsSeniorContext
      ? 'glm_5_3'
      : 'glm_5_3_flash';

  const listing =
    opts.paths
      .slice(0, 80)
      .join('\n');

  const samples =
    opts.sampleFiles
      .slice(0, 6)
      .map(
        (file) =>
          `### ${file.path}\n\`\`\`\n${file.content.slice(0, 2500)}\n\`\`\``,
      )
      .join('\n\n');

  try {
    const messages:
      ChatMessage[] = [
      {
        role: 'system',

        content:
          'Summarize this codebase for efficient future edits. Return a compact structured memo, maximum 400 words: stack, architecture, entry files, important components, dependencies, update hotspots, and risks. Do not dump source code.',
      },

      {
        role: 'user',

        content:
          `Project: ${opts.projectName || 'Xroga project'}\n` +
          `User intent: ${opts.prompt.slice(0, 500)}\n\n` +
          `File paths:\n${listing}\n\n` +
          `Representative samples:\n${samples}\n\n` +
          'Write a reusable repository memo for future surgical updates.',
      },
    ];

    const result =
      await withTenantModelReservation({
        scope:opts.dispatchScope,
        payload:{messages},

        modelId,

        estimatedInputTokens:
          estimateMessageTokens(
            messages,
          ),

        maximumOutputTokens:
          700,

        purpose:
          'complexity',

        execute: dispatch =>
          chatCompletion(
            modelId,
            dispatch.payload.messages as ChatMessage[],
            {
              credentialOverride:dispatch.credentialOverride,
              beforeDispatch:dispatch.beforeDispatch,
              maxTokens: 700,
              temperature:
                0.2,
            },
          ),
      });

    const summary =
      result.text.trim();

    if (!summary) {
      return null;
    }

    return {
      summary,

      modelId,

      inputTokens:
        result.inputTokens,

      outputTokens:
        result.outputTokens,
    };
  } catch (error) {
    if(isModelSecurityDenial(error)||(error as {code?:string})?.code==='RUN_STATE_CONFLICT')throw error;
    // An optional memo can be skipped on availability/accounting failure, but
    // provider error bodies can contain request data and must not reach logs.
    console.warn('[repoSummarize] skipped: unavailable');

    return null;
  }
}
