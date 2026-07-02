/**
 * XrogaRouter — Hybrid intelligence triage.
 * Elite Council (Groq/Gemini/DeepSeek/Grok) primary → OSS Reserve fallback → Black Hole V∞ emit.
 */

import { isPaidApiAllowed, type CouncilLayer } from '../config/hybridConfig.js';
import { groqQuickReply } from '../council/groqClient.js';
import { geminiGenerateCultural, geminiReview } from '../council/geminiClient.js';
import { deepseekGenerate } from '../council/deepseekClient.js';
import { grokGenerate, grokAvailable } from '../council/grokClient.js';
import { swarmReserveProcess } from '../swarm/reserve/orchestrator.js';
import { blackHoleEmit } from '../blackhole/synthesizer.js';
import { BLACKHOLE_MAINTENANCE } from '../prompts/blackholePrompts.js';
import { getSecret } from '../config/envSecrets.js';

export interface XrogaRouteResult {
  text: string;
  provider: string;
  councilLayer: CouncilLayer;
  intent: string;
}

export type RouteProgressFn = (layer: CouncilLayer, detail?: string) => void;

const STEM_PATTERN =
  /\b(code|python|javascript|typescript|math|equation|algorithm|debug|api|sql|regex|function|class|implement|derive|proof|calculate|integral|matrix)\b/i;
const CULTURAL_PATTERN =
  /\b(history|historical|culture|cultural|art|religion|philosophy|who was|when did|ancient|century|dynasty|empire|civilization|tradition)\b/i;
const GREETING_PATTERN = /^(hi|hello|hey|yo|sup|good\s+(morning|afternoon|evening)|salam|as-salamu)\b/i;

function isComplexMathOrCode(input: string): boolean {
  return STEM_PATTERN.test(input) || (input.includes('```') && input.length > 40);
}

function isCulturalOrVisual(input: string): boolean {
  return CULTURAL_PATTERN.test(input) || input.length > 400;
}

function isQuickGreeting(input: string): boolean {
  const t = input.trim();
  return t.length < 40 && GREETING_PATTERN.test(t.toLowerCase());
}

async function councilOrReserve(
  userInput: string,
  councilFn: () => Promise<string>,
  onProgress?: RouteProgressFn
): Promise<{ raw: string; layer: 'elite' | 'reserve'; provider: string }> {
  if (!isPaidApiAllowed()) {
    onProgress?.('reserve', 'OSS Reserve Army (paid APIs disabled)');
    const raw = await swarmReserveProcess(userInput);
    return { raw, layer: 'reserve', provider: 'oss-swarm' };
  }

  onProgress?.('elite', 'Elite Council');
  try {
    const raw = await councilFn();
    return { raw, layer: 'elite', provider: 'elite-council' };
  } catch (err) {
    console.warn('[XrogaRouter] Council failed, reserve fallback:', (err as Error).message.slice(0, 100));
    onProgress?.('reserve', 'OSS Reserve Army — emergency fallback');
    const raw = await swarmReserveProcess(userInput);
    return { raw, layer: 'reserve', provider: 'oss-swarm-fallback' };
  }
}

export class XrogaRouter {
  async route(userInput: string, onProgress?: RouteProgressFn): Promise<XrogaRouteResult> {
    const input = userInput.trim();
    if (!input) {
      return { text: 'What can I help you with?', provider: 'heuristic', councilLayer: 'elite', intent: 'greeting' };
    }

    try {
      if (isQuickGreeting(input)) {
        onProgress?.('elite', 'Groq Sprinter');
        const { raw, layer, provider } = await councilOrReserve(
          input,
          () => groqQuickReply(input),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞ synthesizing');
        const emitted = await blackHoleEmit(raw, input, 'greeting', layer);
        return {
          text: emitted.text,
          provider: layer === 'elite' ? 'groq' : provider,
          councilLayer: emitted.layer,
          intent: 'greeting',
        };
      }

      if (isComplexMathOrCode(input)) {
        const { raw, layer, provider } = await councilOrReserve(
          input,
          () => deepseekGenerate(input),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞ synthesizing');
        const emitted = await blackHoleEmit(raw, input, 'stem', layer);
        return {
          text: emitted.text,
          provider: layer === 'elite' ? 'deepseek' : provider,
          councilLayer: emitted.layer,
          intent: 'stem',
        };
      }

      if (isCulturalOrVisual(input)) {
        const { raw, layer, provider } = await councilOrReserve(
          input,
          () => geminiGenerateCultural(input),
          onProgress
        );
        onProgress?.('blackhole', 'Black Hole V∞ synthesizing');
        const emitted = await blackHoleEmit(raw, input, 'cultural', layer);
        return {
          text: emitted.text,
          provider: layer === 'elite' ? 'gemini' : provider,
          councilLayer: emitted.layer,
          intent: 'cultural',
        };
      }

      // General: DeepSeek draft + Gemini critique (triad), or reserve
      const { raw, layer, provider } = await councilOrReserve(
        input,
        async () => {
          if (!getSecret('DEEPSEEK_API_KEY')) throw new Error('DeepSeek unavailable');
          const draft = await deepseekGenerate(input);
          if (getSecret('GEMINI_API_KEY')) {
            try {
              const review = await geminiReview(draft, input);
              return `DeepSeek Draft:\n${draft}\n\nGemini Critique:\n${review}`;
            } catch {
              return draft;
            }
          }
          if (grokAvailable()) {
            try {
              const edge = await grokGenerate(input);
              return `${draft}\n\nGrok Edge:\n${edge}`;
            } catch {
              return draft;
            }
          }
          return draft;
        },
        onProgress
      );

      onProgress?.('blackhole', 'Black Hole V∞ synthesizing');
      const emitted = await blackHoleEmit(raw, input, 'general', layer);
      return {
        text: emitted.text,
        provider: layer === 'elite' ? 'deepseek+gemini' : provider,
        councilLayer: emitted.layer,
        intent: 'general',
      };
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
