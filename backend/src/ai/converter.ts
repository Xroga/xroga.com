import { chatCompletion, estimateMessageTokens, type ChatMessage } from './openaiCompat.js';
import {withTenantModelReservation,type TenantModelScope,type BoundModelDispatch} from './tenantModelDispatch.js';
import {requireTenantContext,requireResourceOwner} from '../security/tenantContext.js';
import { CONVERTER_SYSTEM, converterUserPrompt } from './prompts.js';

/**
 * Converter AI: turns any raw user request into a detailed builder instruction.
 * Uses DeepSeek V4 Flash (cheap) — no template catalogs.
 */
export async function convertUserRequest(
  userId: string,
  userRequest: string,
  researchBlock?: string,
  dispatchScope?:TenantModelScope,
): Promise<{ instruction: string; inputTokens: number; outputTokens: number }> {
  const context=requireTenantContext(dispatchScope?.context);requireResourceOwner(context,userId);
  const scope={...dispatchScope!,context};
  const messages: ChatMessage[] = [
    { role: 'system', content: CONVERTER_SYSTEM },
    { role: 'user', content: converterUserPrompt(userRequest, researchBlock) },
  ];
  const execute=(dispatch:BoundModelDispatch)=>chatCompletion('deepseek_v4_flash',
    dispatch.payload.messages as ChatMessage[],{temperature:0.4,maxTokens:4096,credentialOverride:dispatch.credentialOverride,beforeDispatch:dispatch.beforeDispatch});
  const result = await withTenantModelReservation({scope,modelId:'deepseek_v4_flash',payload:{messages},
    estimatedInputTokens:estimateMessageTokens(messages),maximumOutputTokens:4096,execute});

  const instruction = result.text.trim();
  if (!instruction) {
    throw new Error('Converter returned an empty instruction');
  }

  return {
    instruction,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
