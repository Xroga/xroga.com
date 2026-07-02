/**
 * XrogaRouter — Groq + Gemini + DeepSeek only (no Grok).
 */

import { isPaidApiAllowed, type CouncilLayer } from '../config/hybridConfig.js';
import {
  API_ROLES,
  COMING_SOON_INTENTS,
} from '../config/apiRoles.js';
import { classifyXrogaIntent } from '../lib/intentClassifier.js';
import { getComingSoonResponse, wantsFullNativeBuild } from '../lib/comingSoon.js';
import { isCapabilitiesQuery, getXrogaCapabilitiesResponse } from '../lib/xrogaCapabilities.js';
import { groqSprinter, groqGeneral, groqContrarian } from '../council/groqClient.js';
import { geminiGenerateCultural, geminiKnowledgeGapCard, geminiReview } from '../council/geminiClient.js';
import { deepseekGenerate } from '../council/deepseekClient.js';
import { swarmReserveProcess } from '../swarm/reserve/orchestrator.js';
import { blackHoleEmit } from '../blackhole/synthesizer.js';
import { BLACKHOLE_MAINTENANCE } from '../prompts/blackholePrompts.js';
import { groqChat } from '../lib/groq.js';
import { getSecret } from '../config/envSecrets.js';
import type { ChatTurn } from '../lib/conversationContext.js';

export interface XrogaRouteOptions {
  context?: ChatTurn[];
}

export interface XrogaRouteResult {
  text: string;
  provider: string;
  councilLayer: CouncilLayer;
  intent: string;
}

export type RouteProgressFn = (layer: CouncilLayer, detail?: string) => void;

async function phi3Fallback(userInput: string): Promise<string> {
  try {
    return await swarmReserveProcess(userInput);
  } catch {
    return `Hey! What can I help you build today?`;
  }
}

async function groqFallback(userInput: string, maxTokens = 1024): Promise<string> {
  if (getSecret('GROQ_API_KEY')) {
    try {
      return await groqChat([{ role: 'user', content: userInput }], { maxTokens });
    } catch {
      /* reserve */
    }
  }
  return swarmReserveProcess(userInput);
}

async function councilOrReserve(
  userInput: string,
  apiId: 'groq' | 'gemini' | 'deepseek',
  councilFn: () => Promise<string>,
  onProgress?: RouteProgressFn
): Promise<{ raw: string; layer: 'elite' | 'reserve'; provider: string }> {
  if (!isPaidApiAllowed()) {
    onProgress?.('reserve', 'OSS Reserve');
    const raw = await swarmReserveProcess(userInput);
    return { raw, layer: 'reserve', provider: 'oss-swarm' };
  }

  const role = API_ROLES[apiId];
  void role;
  onProgress?.('elite', 'Thinking…');
  try {
    const raw = await councilFn();
    return { raw, layer: 'elite', provider: apiId };
  } catch (err) {
    console.warn(`[XrogaRouter] ${apiId} failed:`, (err as Error).message.slice(0, 100));
    onProgress?.('reserve', 'Reserve Swarm');
    const raw =
      apiId === 'groq'
        ? await phi3Fallback(userInput)
        : await groqFallback(userInput);
    return { raw, layer: 'reserve', provider: 'groq-fallback' };
  }
}

export class XrogaRouter {
  async route(
    userInput: string,
    onProgress?: RouteProgressFn,
    options?: XrogaRouteOptions
  ): Promise<XrogaRouteResult> {
    const input = userInput.trim();
    const ctx = options?.context;
    if (!input) {
      return { text: 'What can I help you build?', provider: 'groq', councilLayer: 'elite', intent: 'greeting' };
    }

    try {
      if (isCapabilitiesQuery(input)) {
        onProgress?.('blackhole', 'Black Hole V∞');
        return {
          text: getXrogaCapabilitiesResponse(),
          provider: 'xroga',
          councilLayer: 'blackhole',
          intent: 'general',
        };
      }

      onProgress?.('reserve', 'Classifying intent…');
      const intent = await classifyXrogaIntent(input);

      if (COMING_SOON_INTENTS.includes(intent) && wantsFullNativeBuild(input)) {
        onProgress?.('blackhole', 'Black Hole V∞');
        return {
          text: getComingSoonResponse(intent),
          provider: 'coming-soon',
          councilLayer: 'blackhole',
          intent,
        };
      }

      if (API_ROLES.groq.intentsHandled.includes(intent)) {
        const { raw, layer, provider } = await councilOrReserve(
          input,
          'groq',
          () => groqSprinter(input, ctx),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞');
        const emitted = await blackHoleEmit(raw, input, intent, layer);
        return { text: emitted.text, provider, councilLayer: emitted.layer, intent };
      }

      if (intent === 'multimodal_upload' || API_ROLES.gemini.intentsHandled.includes(intent)) {
        if (!getSecret('GEMINI_API_KEY') && isPaidApiAllowed()) {
          return {
            text: geminiKnowledgeGapCard('Vision/PDF analysis is not configured on this server.'),
            provider: 'knowledge-gap',
            councilLayer: 'blackhole',
            intent,
          };
        }
        const { raw, layer, provider } = await councilOrReserve(
          input,
          'gemini',
          () => geminiGenerateCultural(input, { context: ctx }),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞');
        const emitted = await blackHoleEmit(raw, input, intent, layer);
        return { text: emitted.text, provider, councilLayer: emitted.layer, intent };
      }

      if (
        API_ROLES.deepseek.intentsHandled.includes(intent) ||
        intent === 'coding' ||
        intent === 'stem' ||
        intent === 'complex_math'
      ) {
        const { raw, layer, provider } = await councilOrReserve(
          input,
          'deepseek',
          () => deepseekGenerate(input, { context: ctx }),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞');
        const emitted = await blackHoleEmit(raw, input, intent, layer);
        return { text: emitted.text, provider, councilLayer: emitted.layer, intent };
      }

      if (intent === 'decision' || intent === 'philosophical_debate' || intent === 'what_if_scenario') {
        const { raw, layer, provider } = await councilOrReserve(
          input,
          'deepseek',
          async () => {
            const draft = await deepseekGenerate(input, { context: ctx });
            const parts = [draft];
            if (getSecret('GEMINI_API_KEY')) {
              try {
                parts.push(`## Second perspective\n${await geminiReview(draft, input)}`);
              } catch {
                /* skip */
              }
            }
            if (getSecret('GROQ_API_KEY')) {
              try {
                parts.push(`## Contrarian view\n${await groqContrarian(input, draft)}`);
              } catch {
                /* skip */
              }
            }
            return parts.join('\n\n');
          },
          onProgress
        );
        onProgress?.('blackhole', 'Decision Matrix');
        const emitted = await blackHoleEmit(raw, input, 'decision', layer);
        return { text: emitted.text, provider: provider === 'deepseek' ? 'deepseek+gemini+groq' : provider, councilLayer: emitted.layer, intent: 'decision' };
      }

      // Short general chat → Groq first (user preference)
      if (input.length < 320 && getSecret('GROQ_API_KEY')) {
        const { raw, layer, provider } = await councilOrReserve(
          input,
          'groq',
          () => groqGeneral(input, ctx),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞');
        const emitted = await blackHoleEmit(raw, input, intent, layer);
        return { text: emitted.text, provider, councilLayer: emitted.layer, intent };
      }

      const { raw, layer, provider } = await councilOrReserve(
        input,
        'deepseek',
        () => deepseekGenerate(input, { context: ctx }),
        onProgress
      );
      onProgress?.('blackhole', 'Black Hole V∞');
      const emitted = await blackHoleEmit(raw, input, intent, layer);
      return { text: emitted.text, provider, councilLayer: emitted.layer, intent };
    } catch (err) {
      console.error('[XrogaRouter] Total failure:', (err as Error).message);
      return {
        text: BLACKHOLE_MAINTENANCE,
        provider: 'maintenance',
        councilLayer: 'reserve',
        intent: 'general',
      };
    }
  }
}

export const xrogaRouter = new XrogaRouter();
