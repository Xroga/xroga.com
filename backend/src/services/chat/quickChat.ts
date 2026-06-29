import { groqChat } from '../../lib/groq.js';
import { builderGenerate, classifyComplexity } from '../aiRouter.js';
import { classifyFeature } from '../architect/featureRouter.js';
import { loadMasterPrompt } from '../../orchestrator/masterPrompt.js';
import { getCreationSystemPrompt } from '../../orchestrator/creationPrompts.js';
import { isTrivialPrompt } from '../../lib/promptClassifier.js';
import { detectFeatureIntent, formatFeatureOutput } from '../../lib/featureIntent.js';
import { executeFeature, resolveFeatureCategory } from '../featureExecutor.js';

const CHAT_SYSTEM = `You are Xroga — a sharp, friendly AI assistant (like a top-tier coding partner).

Rules:
- Match the user's tone. Greetings get 1–2 natural sentences, not a sales pitch.
- Be direct and useful. No "Swarm command center" marketing language.
- For questions, answer clearly with substance — examples when helpful.
- Never mention internal agents, DAGs, or architecture unless asked.
- Do not append pros/cons or bullet lists unless the task is complex.
- NEVER invent or fake image/video URLs. If the user wants media generated, say you'll run the creation pipeline — do not output ![image](url) markdown unless you have a real API-generated URL.`;

export async function quickChat(prompt: string): Promise<string> {
  const lower = prompt.toLowerCase().trim();

  if (isTrivialPrompt(prompt)) {
    if (/^(thanks|thank\s*you|thx)\b/.test(lower)) {
      return "You're welcome! Let me know if you need anything else.";
    }
    if (/^(bye|goodbye|see\s*ya)\b/.test(lower)) {
      return 'See you later — happy building!';
    }
    if (/^(yes|no|ok|okay|yep|nope|cool|nice|got\s*it)\b/.test(lower)) {
      return 'Got it. What should we work on next?';
    }
    if (/good\s+(morning|afternoon|evening)/.test(lower)) {
      const period = lower.match(/good\s+(\w+)/)?.[1] ?? 'day';
      return `Good ${period}! What can I help you with?`;
    }
    return "Hey! What can I help you with today?";
  }

  // Safety net: feature intents must use real APIs, never text-only LLM
  const intentCategory = detectFeatureIntent(prompt);
  if (intentCategory !== 'chat') {
    try {
      const output = await executeFeature(intentCategory, prompt);
      return formatFeatureOutput(output);
    } catch (err) {
      console.error(`[quickChat] Feature ${intentCategory} failed:`, (err as Error).message);
      return `I couldn't complete ${intentCategory.replace(/_/g, ' ')} right now. Please check API keys (Agnes, Replicate, Cloudflare) and try again.`;
    }
  }

  const master = await loadMasterPrompt().catch(() => CHAT_SYSTEM);
  const route = await classifyFeature(prompt).catch(() => ({ category: 'chat' as const }));
  const category = resolveFeatureCategory(prompt, route.category);

  if (category !== 'chat') {
    try {
      const output = await executeFeature(category, prompt);
      return formatFeatureOutput(output);
    } catch (err) {
      console.error(`[quickChat] Classified ${category} failed:`, (err as Error).message);
      return `Generation failed for ${category.replace(/_/g, ' ')}. Verify your API keys and try again.`;
    }
  }

  const creationPrompt = getCreationSystemPrompt(route.category, prompt);
  const complexity = classifyComplexity(prompt, route.category);
  const { text } = await builderGenerate(prompt, complexity, `${master}\n\n${creationPrompt}\n\n${CHAT_SYSTEM}`);
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
