import { getSecret } from '../../config/envSecrets.js';
import { groqChat } from '../../lib/groq.js';
import { chatGenerate, classifyChatComplexity } from '../aiRouter.js';
import { classifyFeature } from '../architect/featureRouter.js';
import { loadMasterPrompt } from '../../orchestrator/masterPrompt.js';
import { buildFullSystemPrompt } from '../../orchestrator/aiTraining.js';
import { isTrivialPrompt } from '../../lib/promptClassifier.js';
import { isCapabilitiesQuery, getXrogaCapabilitiesResponse } from '../../lib/xrogaCapabilities.js';
import { analyzeUserQuery, isSpecificBuildRequest } from '../../lib/queryAnalyzer.js';
import { isProductBuildRequest } from '../../lib/buildIntent.js';
import { isMathQuery } from '../../lib/mathQuery.js';
import { trySolveMathLocally } from '../../lib/mathSolver.js';
import { formatPlainProfessional } from '../../blackhole/plainTextFormat.js';
import { isBuildContinuation, isWebsiteUpdateRequest } from '../../lib/buildContinuation.js';
import { routingPrompt } from '../../lib/promptRouting.js';
import { detectFeatureIntent, formatFeatureOutput } from '../../lib/featureIntent.js';
import { executeFeature, resolveFeatureCategory } from '../featureExecutor.js';
import { runLiveResearch, type LiveSource } from '../../lib/liveResearch.js';
import { filterSourcesForUser } from '../../lib/filterCitedSources.js';
import { isHackathonQuery, fetchHackathonAdvisorBrief } from '../../lib/hackathonResearch.js';
import { HACKATHON_ADVISOR_FORMAT } from '../../prompts/hackathonAdvisorPrompt.js';
import type { RouteProgressFn } from '../../orchestrator/xrogaRouter.js';
import type { ChatTurn } from '../../lib/conversationContext.js';

const CHAT_SYSTEM = `You are XROGA, a helpful assistant. Answer the user's question conversationally. Never mention underlying AI providers. Emojis welcome.`;

import type { HackathonBriefCard } from '../../phase1/types.js';

export interface QuickChatResult {
  content: string;
  webSources?: LiveSource[];
  hackathonBrief?: HackathonBriefCard;
}

function wrap(
  content: string,
  webSources?: LiveSource[],
  hackathonBrief?: QuickChatResult['hackathonBrief']
): QuickChatResult {
  return { content, webSources, hackathonBrief };
}

export async function quickChat(
  prompt: string,
  onCouncilProgress?: RouteProgressFn,
  context?: ChatTurn[]
): Promise<QuickChatResult> {
  if (isBuildContinuation(prompt)) {
    throw new Error('BUILD_CONTINUATION_MUST_USE_NEGOTIATION');
  }

  // Any clear site-update intent must patch files — never answer with how-to essays.
  if (isWebsiteUpdateRequest(prompt)) {
    throw new Error('WEBSITE_UPDATE_MUST_USE_NEGOTIATION');
  }

  const userText = routingPrompt(prompt);
  const lower = userText.toLowerCase().trim();

  // Never answer "build a blog website" with a how-to essay in fast chat
  if (isProductBuildRequest(userText) || isSpecificBuildRequest(lower)) {
    throw new Error('PRODUCT_BUILD_MUST_USE_NEGOTIATION');
  }

  const analysis = analyzeUserQuery(userText);
  const buildIntent =
    analysis.routeHint === 'build' || isSpecificBuildRequest(userText.toLowerCase().trim());
  if (
    analysis.needsClarification &&
    analysis.clarificationText &&
    !buildIntent
  ) {
    return wrap(formatPlainProfessional(analysis.clarificationText));
  }

  if (isCapabilitiesQuery(userText)) {
    return wrap(formatPlainProfessional(getXrogaCapabilitiesResponse()));
  }

  if (isMathQuery(userText)) {
    const local = trySolveMathLocally(userText);
    if (local) return wrap(local);
  }

  if (isTrivialPrompt(userText)) {
    if (/^(thanks|thank\s*you|thx)\b/.test(lower)) {
      return wrap("You're welcome! Let me know if you need anything else.");
    }
    if (/^(bye|goodbye|see\s*ya)\b/.test(lower)) {
      return wrap('See you later — happy building!');
    }
    if (/^(yes|no|ok|okay|yep|nope|cool|nice|got\s*it)\b/.test(lower)) {
      return wrap('Got it. What should we work on next?');
    }
    if (/good\s+(morning|afternoon|evening)/.test(lower)) {
      const period = lower.match(/good\s+(\w+)/)?.[1] ?? 'day';
      return wrap(`Good ${period}! What can I help you with?`);
    }
    // Zero-cost greetings — fixed strings only (no Groq/OSS API). Faster + no token burn.
    if (/^(hi|hello|hey|yo|hola|sup)\b/.test(lower)) {
      return wrap('Hey! What can I help you with today?');
    }
    return wrap('Hi — ready when you are. What should we build or solve?');
  }

  const intentCategory = detectFeatureIntent(userText);
  if (intentCategory !== 'chat') {
    try {
      const output = await executeFeature(intentCategory, userText);
      return wrap(formatFeatureOutput(output));
    } catch (err) {
      console.error(`[quickChat] Feature ${intentCategory} failed:`, (err as Error).message);
      return wrap(
        `I couldn't complete ${intentCategory.replace(/_/g, ' ')} right now. Please check API keys (Fal, Replicate, Agnes, Luma) and try again.`
      );
    }
  }

  const master = await loadMasterPrompt().catch(() => CHAT_SYSTEM);
  const route = await classifyFeature(userText).catch(() => ({ category: 'chat' as const }));
  const category = resolveFeatureCategory(userText, route.category);

  if (category !== 'chat') {
    try {
      const output = await executeFeature(category, userText);
      return wrap(formatFeatureOutput(output));
    } catch (err) {
      console.error(`[quickChat] Classified ${category} failed:`, (err as Error).message);
      return wrap(
        `Generation failed for ${category.replace(/_/g, ' ')}. Verify your API keys and try again.`
      );
    }
  }

  onCouncilProgress?.('reserve', 'Searching the web for current information…');
  const liveResearch = await runLiveResearch(userText);

  let hackathonBrief: QuickChatResult['hackathonBrief'];
  let hackathonContext = '';
  if (isHackathonQuery(userText)) {
    onCouncilProgress?.('reserve', 'Analyzing hackathon requirements & sponsor gaps…');
    try {
      const advisor = await fetchHackathonAdvisorBrief(userText);
      if (advisor) {
        hackathonBrief = advisor.card;
        hackathonContext = `\n\n## Hackathon intelligence\n${advisor.markdown}\n\n${HACKATHON_ADVISOR_FORMAT}`;
      }
    } catch (err) {
      console.warn('[quickChat] Hackathon research:', (err as Error).message);
    }
  }

  const creationPrompt = buildFullSystemPrompt(category, userText);
  const complexity = classifyChatComplexity(userText, route.category);

  const { xrogaRouter } = await import('../../orchestrator/xrogaRouter.js');
  const routed = await xrogaRouter.route(userText, onCouncilProgress, {
    context,
    researchContext: `${liveResearch?.context ?? ''}${hackathonContext}`,
  });
  if (routed.text?.trim()) {
    const text = routed.text.trim();
    const merged = [
      ...(liveResearch?.sources ?? []),
      ...(hackathonBrief?.sources?.map((s) => ({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        source: 'searxng' as const,
      })) ?? []),
    ];
    const sources = merged.length ? filterSourcesForUser(text, merged, 6) : undefined;
    return wrap(text, sources, hackathonBrief);
  }

  const systemExtra = `${liveResearch?.context ?? ''}${hackathonContext}`;
  const { text } = await chatGenerate(
    userText,
    complexity,
    `${master}\n\n${creationPrompt}${systemExtra}\n\n${CHAT_SYSTEM}`
  );
  const finalText = text?.trim() || "I'm here — tell me what you'd like to work on.";
  const merged = [
    ...(liveResearch?.sources ?? []),
    ...(hackathonBrief?.sources?.map((s) => ({
      title: s.title,
      url: s.url,
      snippet: s.snippet,
      source: 'searxng' as const,
    })) ?? []),
  ];
  const sources = merged.length ? filterSourcesForUser(finalText, merged, 6) : undefined;
  return wrap(finalText, sources, hackathonBrief);
}

export async function quickChatWithGroqFallback(prompt: string): Promise<string> {
  try {
    const result = await quickChat(prompt);
    return result.content;
  } catch {
    if (getSecret('GROQ_API_KEY')) {
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
