import { groqChat } from '../../lib/groq.js';
import { chatGenerate, classifyChatComplexity } from '../aiRouter.js';
import { classifyFeature } from '../architect/featureRouter.js';
import { loadMasterPrompt } from '../../orchestrator/masterPrompt.js';
import { buildFullSystemPrompt } from '../../orchestrator/aiTraining.js';
import { isTrivialPrompt } from '../../lib/promptClassifier.js';
import { isCapabilitiesQuery, getXrogaCapabilitiesResponse } from '../../lib/xrogaCapabilities.js';
import { analyzeUserQuery } from '../../lib/queryAnalyzer.js';
import { formatPlainProfessional } from '../../blackhole/plainTextFormat.js';
import { routingPrompt } from '../../lib/promptRouting.js';
import { detectFeatureIntent, formatFeatureOutput } from '../../lib/featureIntent.js';
import { executeFeature, resolveFeatureCategory } from '../featureExecutor.js';
import type { RouteProgressFn } from '../../orchestrator/xrogaRouter.js';
import type { ChatTurn } from '../../lib/conversationContext.js';

const CHAT_SYSTEM = `You are XROGA AI — Black Hole V∞.

Before answering: mentally classify what the user wants (chat, math, build, image, decision).
If the request is vague, ask 1–2 short clarifying questions instead of guessing.

Every reply: Line 1 is a short HEADLINE (5–14 words). Blank line. Then sections with a title line and body below.
No hash, asterisk, or pipe symbols. For math use Step 1, Step 2, then Answer. Never mention underlying AI providers.
When appropriate, end with one forward question (e.g. "What do you want to build first?").`;

export async function quickChat(
  prompt: string,
  onCouncilProgress?: RouteProgressFn,
  context?: ChatTurn[]
): Promise<string> {
  const userText = routingPrompt(prompt);
  const lower = userText.toLowerCase().trim();

  const analysis = analyzeUserQuery(userText);
  if (analysis.needsClarification && analysis.clarificationText) {
    return formatPlainProfessional(analysis.clarificationText);
  }

  if (isCapabilitiesQuery(userText)) {
    return formatPlainProfessional(getXrogaCapabilitiesResponse());
  }

  if (isTrivialPrompt(userText)) {
    if (/^(thanks|thank\s*you|thx)\b/.test(lower)) {
      return "You're welcome! Let me know if you need anything else.";
    }
    if (/^(bye|goodbye|see\s*ya)\b/.test(lower)) {
      return 'See you later — happy building!';
    }
    if (/^(yes|no|ok|okay|yep|nope|cool|nice|got\s*it)\b/.test(lower)) {
      return 'Got it. What should we work on next?';
    }
    // Greetings → real Groq Sprinter (not hardcoded)
    try {
      const { groqSprinter } = await import('../../council/groqClient.js');
      const { blackHoleEmit } = await import('../../blackhole/synthesizer.js');
      const raw = await groqSprinter(userText, context);
      const emitted = await blackHoleEmit(raw, userText, 'greeting', 'elite');
      return emitted.text;
    } catch {
      if (/good\s+(morning|afternoon|evening)/.test(lower)) {
        const period = lower.match(/good\s+(\w+)/)?.[1] ?? 'day';
        return `Good ${period}! What can I help you with?`;
      }
      return "Hey! What can I help you with today?";
    }
  }

  // Safety net: feature intents must use real APIs, never text-only LLM
  const intentCategory = detectFeatureIntent(userText);
  if (intentCategory !== 'chat') {
    try {
      const output = await executeFeature(intentCategory, userText);
      return formatFeatureOutput(output);
    } catch (err) {
      console.error(`[quickChat] Feature ${intentCategory} failed:`, (err as Error).message);
      return `I couldn't complete ${intentCategory.replace(/_/g, ' ')} right now. Please check API keys (Fal, Replicate, Agnes, Luma) and try again.`;
    }
  }

  const master = await loadMasterPrompt().catch(() => CHAT_SYSTEM);
  const route = await classifyFeature(userText).catch(() => ({ category: 'chat' as const }));
  const category = resolveFeatureCategory(userText, route.category);

  if (category !== 'chat') {
    try {
      const output = await executeFeature(category, userText);
      return formatFeatureOutput(output);
    } catch (err) {
      console.error(`[quickChat] Classified ${category} failed:`, (err as Error).message);
      return `Generation failed for ${category.replace(/_/g, ' ')}. Verify your API keys and try again.`;
    }
  }

  const creationPrompt = buildFullSystemPrompt(category, userText);
  const complexity = classifyChatComplexity(userText, route.category);

  // Hybrid Council → Reserve → Black Hole V∞ for pure chat
  const { xrogaRouter } = await import('../../orchestrator/xrogaRouter.js');
  const routed = await xrogaRouter.route(userText, onCouncilProgress, { context });
  if (routed.text?.trim()) {
    return routed.text.trim();
  }

  const { text } = await chatGenerate(userText, complexity, `${master}\n\n${creationPrompt}\n\n${CHAT_SYSTEM}`);
  return text?.trim() || "I'm here — tell me what you'd like to work on.";
}

export async function quickChatWithGroqFallback(prompt: string): Promise<string> {
  try {
    return await quickChat(prompt);
  } catch {
    if (process.env.GROQ_API_KEY) {
      return groqChat(
        [
          { role: 'system', content: CHAT_SYSTEM },
          { role: 'user', content: prompt },
        ],
        { maxTokens: 1024 }
      );
    }
    throw new Error('All chat models failed');
  }
}
