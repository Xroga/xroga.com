/**
 * Pre-generation prompt lock — Groq/Gemini for simple clips, DeepSeek for complex.
 * Locks subjects (e.g. "cat") and builds negative constraints (no humans when not requested).
 */

import { groqChat } from '../groq.js';
import { geminiGenerate } from '../gemini.js';
import { deepSeekChat } from '../deepseek.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

export interface EnhancedVideoPrompt {
  userIntent: string;
  renderPrompt: string;
  negativePrompt: string;
  lockedSubjects: string[];
  mustNotInclude: string[];
  enhancerProvider: string;
}

const ENHANCER_SYSTEM = `You are Xroga Video Prompt Engineer. Convert the user's video request into a locked render spec for text-to-video AI.

Rules:
1. LOCK the exact subjects the user named (animal, object, person, scene). Never swap subjects.
2. If user asks for an animal/object and does NOT mention people, mustNotInclude MUST list humans (woman, man, person, bikini, crowd).
3. renderPrompt: vivid, cinematic, single clear focal subject, stable camera, photorealistic when appropriate.
4. negativePrompt: comma-separated artifacts to avoid (wrong subject, extra limbs, morphing, blurry).
5. lockedSubjects: nouns the user explicitly wants visible (e.g. ["cat", "beach"]).

Return ONLY JSON:
{"renderPrompt":"","negativePrompt":"","lockedSubjects":[],"mustNotInclude":[]}`;

const HUMAN_WORDS = /\b(person|people|human|man|woman|girl|boy|child|actor|model|celebrity|dancer)\b/i;
const ANIMAL_WORDS =
  /\b(cat|kitten|dog|puppy|bird|horse|lion|tiger|bear|fish|whale|dolphin|rabbit|fox|wolf|elephant|monkey|dragon)\b/i;

function heuristicEnhance(userPrompt: string): EnhancedVideoPrompt {
  const userIntent = sanitizeVideoPrompt(userPrompt);
  const lower = userIntent.toLowerCase();
  const lockedSubjects: string[] = [];

  const animalMatch = lower.match(ANIMAL_WORDS);
  if (animalMatch) lockedSubjects.push(animalMatch[1]);

  for (const loc of ['beach', 'forest', 'city', 'mountain', 'ocean', 'desert', 'space', 'kitchen', 'street']) {
    if (lower.includes(loc)) lockedSubjects.push(loc);
  }

  const wantsHumans = HUMAN_WORDS.test(lower);
  const mustNotInclude: string[] = wantsHumans
    ? []
    : ['human', 'woman', 'man', 'person', 'people', 'bikini', 'swimsuit model', 'crowd'];

  const subjectPhrase = lockedSubjects.length ? lockedSubjects.join(' and ') : userIntent;
  const renderPrompt = wantsHumans
    ? `${userIntent}. Cinematic, sharp focus, natural lighting, smooth camera motion.`
    : `${subjectPhrase} as the ONLY subject. ${userIntent}. No people in frame. Cinematic, sharp focus, natural lighting, smooth camera motion.`;

  const negativePrompt = mustNotInclude.length
    ? `${mustNotInclude.join(', ')}, wrong subject, extra fingers, morphing, warping, blurry`
    : 'wrong subject, extra fingers, morphing, warping, blurry';

  return {
    userIntent,
    renderPrompt,
    negativePrompt,
    lockedSubjects: lockedSubjects.length ? lockedSubjects : [userIntent.slice(0, 40)],
    mustNotInclude,
    enhancerProvider: 'heuristic',
  };
}

function parseEnhancerJson(raw: string, userIntent: string): EnhancedVideoPrompt | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const data = JSON.parse(match[0]) as {
      renderPrompt?: string;
      negativePrompt?: string;
      lockedSubjects?: string[];
      mustNotInclude?: string[];
    };
    if (!data.renderPrompt?.trim()) return null;

    const locked = Array.isArray(data.lockedSubjects) ? data.lockedSubjects.filter(Boolean) : [];
    const mustNot = Array.isArray(data.mustNotInclude) ? data.mustNotInclude.filter(Boolean) : [];

    return {
      userIntent,
      renderPrompt: data.renderPrompt.trim(),
      negativePrompt: data.negativePrompt?.trim() ?? 'wrong subject, morphing, warping',
      lockedSubjects: locked.length ? locked : [userIntent.slice(0, 40)],
      mustNotInclude: mustNot,
      enhancerProvider: 'llm',
    };
  } catch {
    return null;
  }
}

function isComplexPrompt(prompt: string): boolean {
  return prompt.length > 120 || /\b(and then|multi|several|story|dialogue|fight|chase|crowd)\b/i.test(prompt);
}

async function enhanceWithGroq(userIntent: string): Promise<EnhancedVideoPrompt | null> {
  if (!process.env.GROQ_API_KEY) return null;
  const raw = await groqChat(
    [
      { role: 'system', content: ENHANCER_SYSTEM },
      { role: 'user', content: `User video request: ${userIntent}` },
    ],
    { maxTokens: 512, model: 'llama-3.3-70b-versatile' }
  );
  const parsed = parseEnhancerJson(raw, userIntent);
  return parsed ? { ...parsed, enhancerProvider: 'groq' } : null;
}

async function enhanceWithGemini(userIntent: string): Promise<EnhancedVideoPrompt | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const raw = await geminiGenerate(ENHANCER_SYSTEM, `User video request: ${userIntent}`, {
    model: 'gemini-2.0-flash',
    maxTokens: 512,
  });
  const parsed = parseEnhancerJson(raw, userIntent);
  return parsed ? { ...parsed, enhancerProvider: 'gemini' } : null;
}

async function enhanceWithDeepSeek(userIntent: string): Promise<EnhancedVideoPrompt | null> {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  const raw = await deepSeekChat(
    [
      { role: 'system', content: ENHANCER_SYSTEM },
      { role: 'user', content: `User video request: ${userIntent}` },
    ],
    { model: 'deepseek-chat', maxTokens: 512 }
  );
  const parsed = parseEnhancerJson(raw, userIntent);
  return parsed ? { ...parsed, enhancerProvider: 'deepseek' } : null;
}

/** Build generation-ready prompt with negative constraints appended for OSS models. */
export function buildGenerationPrompt(enhanced: EnhancedVideoPrompt): string {
  const lock =
    enhanced.lockedSubjects.length > 0
      ? `SUBJECT LOCK: ${enhanced.lockedSubjects.join(', ')} must be clearly visible. `
      : '';
  const avoid =
    enhanced.mustNotInclude.length > 0
      ? ` Do NOT show: ${enhanced.mustNotInclude.join(', ')}.`
      : '';
  return `${lock}${enhanced.renderPrompt}.${avoid} Avoid: ${enhanced.negativePrompt}`;
}

/**
 * Verify user prompt → advanced locked prompt before sending to video AI.
 */
export async function enhanceVideoPrompt(rawPrompt: string): Promise<EnhancedVideoPrompt> {
  const userIntent = sanitizeVideoPrompt(rawPrompt);
  const complex = isComplexPrompt(userIntent);

  try {
    if (complex) {
      const deep = await enhanceWithDeepSeek(userIntent);
      if (deep) return deep;
    } else {
      const groq = await enhanceWithGroq(userIntent);
      if (groq) return groq;
      const gemini = await enhanceWithGemini(userIntent);
      if (gemini) return gemini;
    }
  } catch (err) {
    console.warn('[VideoPromptEnhancer] LLM enhance failed:', (err as Error).message);
  }

  try {
    if (!complex) {
      const deep = await enhanceWithDeepSeek(userIntent);
      if (deep) return deep;
    }
    const gemini = await enhanceWithGemini(userIntent);
    if (gemini) return gemini;
  } catch {
    /* fall through */
  }

  return heuristicEnhance(rawPrompt);
}
