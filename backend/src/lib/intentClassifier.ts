/**
 * Intent classification — Mistral 7B classifier bee, heuristic fallback.
 */

import type { XrogaIntent } from '../config/apiRoles.js';
import { getSecret } from '../config/envSecrets.js';
import { groqChat } from './groq.js';
import { SWARM_CLASSIFIER_PROMPT } from '../prompts/swarmReservePrompts.js';

const SINGLE_WORD_MAP: Record<string, XrogaIntent> = {
  greeting: 'greeting',
  quick_fact: 'quick_fact',
  coding: 'coding',
  stem: 'stem',
  history: 'history',
  decision: 'decision',
  build: 'build_website',
  multimodal: 'multimodal_upload',
  cultural: 'cultural',
};

const CLASSIFIER_JSON_INTENTS: XrogaIntent[] = [
  'greeting', 'quick_fact', 'coding', 'stem', 'history', 'cultural', 'decision',
  'build_website', 'build_game', 'build_app', 'build_software', 'automation',
  'multimodal_upload', 'general', 'philosophical_debate', 'video_script',
];

async function callClassifierBee(userInput: string): Promise<string> {
  const base = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
  if (process.env.OLLAMA_URL || process.env.OLLAMA_ENABLED) {
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OLLAMA_CLASSIFIER_MODEL ?? 'mistral',
          messages: [
            { role: 'system', content: SWARM_CLASSIFIER_PROMPT },
            { role: 'user', content: userInput.slice(0, 600) },
          ],
          stream: false,
          options: { num_predict: 32, temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { message?: { content?: string } };
        return data.message?.content ?? '';
      }
    } catch {
      /* groq fallback */
    }
  }

  if (getSecret('GROQ_API_KEY')) {
    return groqChat(
      [
        { role: 'system', content: SWARM_CLASSIFIER_PROMPT },
        { role: 'user', content: userInput.slice(0, 600) },
      ],
      { maxTokens: 16 }
    );
  }
  return '';
}

function parseClassifierWord(raw: string): XrogaIntent | null {
  const token = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]/g, '')
    .split(/\s+/)[0];
  if (token && SINGLE_WORD_MAP[token]) return SINGLE_WORD_MAP[token];
  return null;
}

function heuristicIntent(userInput: string): XrogaIntent {
  const lower = userInput.toLowerCase().trim();

  if (/^(hi|hello|hey|yo|sup|good\s+(morning|afternoon|evening)|salam)\b/.test(lower)) return 'greeting';
  if (/^(yes|no|yep|nope|ok|okay)\b/.test(lower) && lower.length < 20) return 'yes_no';
  if (/\b(what time|what's the time|date today)\b/.test(lower)) return 'time_query';
  if (/\b(should i|quit my job|decide between|pros and cons|which option)\b/.test(lower)) return 'decision';
  if (/\b(what if|hypothetically|philosophy|meaning of life)\b/.test(lower)) return 'philosophical_debate';
  if (/\b(build|create|make)\b[\s\S]{0,30}\b(game|rpg|platformer|unity|godot)\b/.test(lower)) return 'build_game';
  if (/\b(build|create)\b[\s\S]{0,30}\b(app|mobile app|ios app|android app|flutter|react native)\b/.test(lower)) return 'build_app';
  if (/\b(build|create)\b[\s\S]{0,30}\b(desktop|software suite|windows app|mac app)\b/.test(lower)) return 'build_software';
  if (/\b(build|create)\b[\s\S]{0,40}\b(website|landing page|homepage|web page)\b/.test(lower)) return 'build_website';
  if (/\b(playwright|puppeteer|scrape|automation|cron|webhook)\b/.test(lower)) return 'automation';
  if (/\b(video script|screenplay|scene script)\b/.test(lower)) return 'video_script';
  if (/\b(analyze (this|the) (pdf|image|photo)|uploaded|attached file)\b/.test(lower)) return 'multimodal_upload';
  if (/\b(history|historical|who was|when did|ancient|dynasty|empire|war of|century)\b/.test(lower)) return 'history';
  if (/\b(culture|cultural|tradition|religion|geopolitic|current events|news about)\b/.test(lower)) return 'cultural';
  if (/\b(code|debug|fix bug|typescript|python|javascript|api|function|class|sql|regex)\b/.test(lower) || userInput.includes('```')) return 'coding';
  if (/\b(math|equation|integral|derivative|proof|calculate|algorithm)\b/.test(lower)) return 'stem';
  if (/\b(3d model|blender|mesh|openscad)\b/.test(lower)) return '3d_model';
  if (lower.length < 60 && /\b(what is|who is|when is|how many)\b/.test(lower)) return 'quick_fact';
  if (/\b(generate|create|make|design)\b/.test(lower)) return 'creation';
  return 'general';
}

export async function classifyXrogaIntent(userInput: string): Promise<XrogaIntent> {
  try {
    const raw = await callClassifierBee(userInput);
    const single = parseClassifierWord(raw);
    if (single) return single;

    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { intent?: string };
      const intent = parsed.intent as XrogaIntent | undefined;
      if (intent && CLASSIFIER_JSON_INTENTS.includes(intent)) return intent;
    }
    const token = raw.toLowerCase().match(
      /\b(greeting|quick_fact|coding|stem|history|cultural|decision|build_website|build_game|build_app|automation|general)\b/
    )?.[1] as XrogaIntent | undefined;
    if (token && CLASSIFIER_JSON_INTENTS.includes(token)) return token;
  } catch {
    /* heuristic */
  }
  return heuristicIntent(userInput);
}
