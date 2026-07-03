import type { CouncilLayer } from '../config/hybridConfig.js';
import type { XrogaIntent } from '../config/apiRoles.js';
import {
  deAiFilter,
  needsPolish,
} from './emissionFilter.js';
import { formatPlainProfessional, buildDecisionPlain } from './plainTextFormat.js';
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
 * Black Hole V∞ — de-AI, plain professional text, optional Phi-3 polish.
 */
export async function blackHoleEmit(
  rawResponse: string,
  userInput: string,
  intent: XrogaIntent | EmitIntent,
  _sourceLayer: 'elite' | 'reserve'
): Promise<BlackHoleEmitResult> {
  const emitKind = typeof intent === 'string' ? intentToEmit(intent as XrogaIntent) : intent;
  let cleaned = deAiFilter(rawResponse, { keepEmojis: true });

  if (!cleaned) {
    return { text: rawResponse.trim() || 'I am here — what should we build?', layer: 'blackhole' };
  }

  if (emitKind === 'decision') {
    return { text: buildDecisionPlain(cleaned, userInput), layer: 'blackhole' };
  }

  cleaned = formatPlainProfessional(cleaned);

  if (emitKind !== 'quick' && cleaned.length > 80 && needsPolish(cleaned)) {
    cleaned = await phi3Polish(cleaned);
    cleaned = formatPlainProfessional(deAiFilter(cleaned, { keepEmojis: true }));
  }

  return { text: cleaned, layer: 'blackhole' };
}
