import type { CouncilLayer } from '../config/hybridConfig.js';
import type { XrogaIntent } from '../config/apiRoles.js';
import {
  deAiFilter,
  markdownBeautifier,
  buildDecisionMatrix,
  needsPolish,
} from './emissionFilter.js';
import { phi3Polish } from './phi3Polish.js';

export type EmitIntent =
  | 'quick'
  | 'greeting'
  | 'cultural'
  | 'technical'
  | 'stem'
  | 'general'
  | 'decision'
  | 'reserve';

export interface BlackHoleEmitResult {
  text: string;
  layer: CouncilLayer;
}

function intentToEmit(intent: XrogaIntent | EmitIntent): EmitIntent {
  if (intent === 'greeting' || intent === 'quick_fact' || intent === 'yes_no' || intent === 'small_talk') return 'quick';
  if (intent === 'decision' || intent === 'philosophical_debate' || intent === 'what_if_scenario') return 'decision';
  if (['history', 'cultural', 'geopolitical', 'current_events'].includes(intent as string)) return 'cultural';
  if (['coding', 'stem', 'complex_math', 'debug', 'automation', 'build_website', '3d_model', 'video_script'].includes(intent as string)) return 'technical';
  return 'general';
}

/**
 * Black Hole V∞ — Python-style emit: regex de-AI, markdown, decision matrix, optional Phi-3 polish.
 * Does NOT call Gemini/DeepSeek/Groq for fluff.
 */
export async function blackHoleEmit(
  rawResponse: string,
  userInput: string,
  intent: XrogaIntent | EmitIntent,
  _sourceLayer: 'elite' | 'reserve'
): Promise<BlackHoleEmitResult> {
  const emitKind = typeof intent === 'string' ? intentToEmit(intent as XrogaIntent) : intent;
  let cleaned = deAiFilter(rawResponse);

  if (!cleaned) {
    return { text: rawResponse.trim() || 'I am here — what should we build?', layer: 'blackhole' };
  }

  if (emitKind === 'decision') {
    return { text: buildDecisionMatrix(cleaned, userInput), layer: 'blackhole' };
  }

  if (emitKind === 'quick' || cleaned.length < 80) {
    return { text: cleaned, layer: 'blackhole' };
  }

  cleaned = markdownBeautifier(cleaned);

  if (needsPolish(cleaned)) {
    cleaned = await phi3Polish(cleaned);
    cleaned = deAiFilter(cleaned);
  }

  return { text: cleaned, layer: 'blackhole' };
}
