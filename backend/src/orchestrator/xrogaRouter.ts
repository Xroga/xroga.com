/**
 * XrogaRouter — Sealed API Role Manifesto implementation.
 * Classify → Council primary → Reserve fallback → Black Hole emit.
 */

import { isPaidApiAllowed, type CouncilLayer } from '../config/hybridConfig.js';
import {
  API_ROLES,
  COMING_SOON_INTENTS,
  type XrogaIntent,
} from '../config/apiRoles.js';
import { classifyXrogaIntent } from '../lib/intentClassifier.js';
import { getComingSoonResponse, wantsFullNativeBuild } from '../lib/comingSoon.js';
import { groqSprinter } from '../council/groqClient.js';
import { geminiGenerateCultural, geminiKnowledgeGapCard } from '../council/geminiClient.js';
import { deepseekGenerate } from '../council/deepseekClient.js';
import { grokGenerate, grokAvailable } from '../council/grokClient.js';
import { swarmReserveProcess } from '../swarm/reserve/orchestrator.js';
import { blackHoleEmit } from '../blackhole/synthesizer.js';
import { BLACKHOLE_MAINTENANCE } from '../prompts/blackholePrompts.js';
import { groqChat } from '../lib/groq.js';
import { getSecret } from '../config/envSecrets.js';

export interface XrogaRouteResult {
  text: string;
  provider: string;
  councilLayer: CouncilLayer;
  intent: string;
}

export type RouteProgressFn = (layer: CouncilLayer, detail?: string) => void;

async function phi3Fallback(userInput: string): Promise<string> {
  const { swarmReserveProcess: reserve } = await import('../swarm/reserve/orchestrator.js');
  try {
    return await reserve(userInput);
  } catch {
    return `Hey! ${userInput.length < 20 ? 'What can I help you build today?' : 'I heard you — tell me more.'}`;
  }
}

async function llamaFallback(userInput: string): Promise<string> {
  if (getSecret('GROQ_API_KEY')) {
    try {
      return await groqChat(
        [{ role: 'user', content: `${userInput}\n\nProvide cultural/historical context briefly.` }],
        { maxTokens: 1024 }
      );
    } catch {
      /* reserve */
    }
  }
  return swarmReserveProcess(userInput);
}

async function mixtralFallback(userInput: string): Promise<string> {
  return swarmReserveProcess(userInput);
}

async function councilOrReserve(
  userInput: string,
  apiId: 'groq' | 'gemini' | 'deepseek' | 'grok',
  councilFn: () => Promise<string>,
  onProgress?: RouteProgressFn
): Promise<{ raw: string; layer: 'elite' | 'reserve'; provider: string }> {
  if (!isPaidApiAllowed()) {
    onProgress?.('reserve', 'OSS Reserve (ALLOW_PAID_API=false)');
    const raw = await swarmReserveProcess(userInput);
    return { raw, layer: 'reserve', provider: 'oss-swarm' };
  }

  const role = API_ROLES[apiId];
  onProgress?.('elite', `${role.codename} — ${apiId}`);
  try {
    const raw = await councilFn();
    return { raw, layer: 'elite', provider: apiId };
  } catch (err) {
    console.warn(`[XrogaRouter] ${apiId} failed:`, (err as Error).message.slice(0, 100));
    onProgress?.('reserve', `Fallback: ${role.fallbackModel}`);
    let raw: string;
    if (role.fallbackModel === 'phi3') raw = await phi3Fallback(userInput);
    else if (role.fallbackModel.includes('llama')) raw = await llamaFallback(userInput);
    else if (role.fallbackModel.includes('zephyr')) raw = await mixtralFallback(userInput);
    else raw = await mixtralFallback(userInput);
    return { raw, layer: 'reserve', provider: role.fallbackModel };
  }
}

export class XrogaRouter {
  async route(userInput: string, onProgress?: RouteProgressFn): Promise<XrogaRouteResult> {
    const input = userInput.trim();
    if (!input) {
      return { text: 'What can I help you build?', provider: 'heuristic', councilLayer: 'elite', intent: 'greeting' };
    }

    try {
      onProgress?.('reserve', 'Mistral classifier');
      const intent = await classifyXrogaIntent(input);

      if (COMING_SOON_INTENTS.includes(intent) && wantsFullNativeBuild(input)) {
        onProgress?.('blackhole', 'Coming soon card');
        const text = getComingSoonResponse(intent);
        return { text, provider: 'coming-soon', councilLayer: 'blackhole', intent };
      }

      if (API_ROLES.groq.intentsHandled.includes(intent)) {
        const { raw, layer, provider } = await councilOrReserve(
          input,
          'groq',
          () => groqSprinter(input),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞');
        const emitted = await blackHoleEmit(raw, input, intent, layer);
        return { text: emitted.text, provider, councilLayer: emitted.layer, intent };
      }

      if (intent === 'multimodal_upload' || API_ROLES.gemini.intentsHandled.includes(intent)) {
        if (!getSecret('GEMINI_API_KEY') && isPaidApiAllowed()) {
          const gap = geminiKnowledgeGapCard('Vision/PDF analysis requires Gemini.');
          return { text: gap, provider: 'knowledge-gap', councilLayer: 'blackhole', intent };
        }
        const { raw, layer, provider } = await councilOrReserve(
          input,
          'gemini',
          () => geminiGenerateCultural(input),
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
          () => deepseekGenerate(input),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞');
        const emitted = await blackHoleEmit(raw, input, intent, layer);
        return { text: emitted.text, provider, councilLayer: emitted.layer, intent };
      }

      if (
        (API_ROLES.grok.intentsHandled.includes(intent) || intent === 'decision') &&
        grokAvailable()
      ) {
        const draft = await deepseekGenerate(input).catch(() => '');
        const grokEdge = await councilOrReserve(input, 'grok', () => grokGenerate(input), onProgress);
        const raw = draft
          ? `${draft}\n\n--- Grok Edge ---\n${grokEdge.raw}`
          : grokEdge.raw;
        onProgress?.('blackhole', 'Decision Matrix');
        const emitted = await blackHoleEmit(raw, input, 'decision', grokEdge.layer);
        return {
          text: emitted.text,
          provider: 'deepseek+grok',
          councilLayer: emitted.layer,
          intent: 'decision',
        };
      }

      if (intent === 'decision' || intent === 'philosophical_debate') {
        const { raw, layer, provider } = await councilOrReserve(
          input,
          'deepseek',
          async () => {
            const draft = await deepseekGenerate(input);
            if (getSecret('GEMINI_API_KEY')) {
              const { geminiReview } = await import('../council/geminiClient.js');
              try {
                const review = await geminiReview(draft, input);
                return `${draft}\n\n--- Gemini Critique ---\n${review}`;
              } catch {
                return draft;
              }
            }
            return draft;
          },
          onProgress
        );
        onProgress?.('blackhole', 'Decision Matrix');
        const emitted = await blackHoleEmit(raw, input, 'decision', layer);
        return { text: emitted.text, provider, councilLayer: emitted.layer, intent: 'decision' };
      }

      const { raw, layer, provider } = await councilOrReserve(
        input,
        'deepseek',
        () => deepseekGenerate(input),
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
