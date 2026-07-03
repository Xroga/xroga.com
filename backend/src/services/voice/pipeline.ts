import { createHash } from 'crypto';
import { groqChat } from '../../lib/groq.js';
import { geminiGenerate } from '../../lib/gemini.js';
import { getSecret } from '../../config/envSecrets.js';
import {
  VOICE_SYSTEM_PROMPT,
  VOICE_TAVILY_PROMPT,
  VOICE_TAVILY_EMPTY_PROMPT,
  VOICE_SEARCH_UNAVAILABLE_PROMPT,
  buildTavilyUserPrompt,
} from './voicePrompt.js';
import { RateLimitError } from './groqWhisper.js';
import { synthesizeWithEdgeTts } from './edgeTts.js';
import { routeVoiceQuery } from './voiceRouter.js';
import {
  searchWithTavily,
  TavilyRateLimitError,
  TavilyTimeoutError,
} from './tavilySearch.js';

interface CacheEntry {
  text: string;
  audio: Buffer;
  createdAt: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const MAX_CACHE = 200;

function cacheKey(text: string): string {
  return createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

function getCached(text: string): CacheEntry | null {
  const key = cacheKey(text);
  const hit = responseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return hit;
}

function setCache(transcript: string, text: string, audio: Buffer) {
  if (responseCache.size >= MAX_CACHE) {
    const oldest = responseCache.keys().next().value;
    if (oldest) responseCache.delete(oldest);
  }
  responseCache.set(cacheKey(transcript), { text, audio, createdAt: Date.now() });
}

async function callLlm(
  system: string,
  user: string
): Promise<string> {
  if (getSecret('GROQ_API_KEY')) {
    try {
      return await groqChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { model: 'llama-3.3-70b-versatile', maxTokens: 180, temperature: 0.85 }
      );
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('429')) throw e;
      console.warn('[voice] Groq LLM rate limited — falling back to Gemini');
    }
  }

  if (getSecret('GEMINI_API_KEY')) {
    return geminiGenerate(system, user, {
      model: 'gemini-2.0-flash',
      maxTokens: 180,
    });
  }

  throw new Error('No LLM available for voice (set GROQ_API_KEY or GEMINI_API_KEY)');
}

async function generateInternalReply(transcript: string): Promise<string> {
  return callLlm(VOICE_SYSTEM_PROMPT, transcript);
}

async function generateTavilyReply(
  transcript: string,
  searchAnswer: string,
  sources: string[]
): Promise<string> {
  return callLlm(VOICE_TAVILY_PROMPT, buildTavilyUserPrompt(transcript, searchAnswer, sources));
}

async function generateEmptySearchReply(transcript: string): Promise<string> {
  return callLlm(VOICE_TAVILY_EMPTY_PROMPT, `User asked: ${transcript}`);
}

async function generateSearchUnavailableReply(transcript: string): Promise<string> {
  return callLlm(VOICE_SEARCH_UNAVAILABLE_PROMPT, transcript);
}

export type VoiceStage =
  | 'transcribing'
  | 'routing'
  | 'searching'
  | 'thinking'
  | 'speaking';

export interface VoicePipelineResult {
  transcript: string;
  reply: string;
  audio: Buffer;
  cached: boolean;
  searchedWeb: boolean;
}

export async function runVoicePipeline(
  audio: Buffer,
  mimeType: string,
  onStage?: (stage: VoiceStage) => void,
  onTranscript?: (text: string) => void
): Promise<VoicePipelineResult> {
  const { transcribeWithGroqWhisper } = await import('./groqWhisper.js');

  // Step 1 — Listen (STT)
  onStage?.('transcribing');
  let transcript: string;
  try {
    transcript = await transcribeWithGroqWhisper(audio, mimeType);
  } catch (e) {
    if (e instanceof RateLimitError) {
      throw new Error('Voice transcription is busy — try again in a moment.');
    }
    throw e;
  }

  if (!transcript) {
    throw new Error('Could not hear you — try speaking a bit louder.');
  }

  onTranscript?.(transcript);

  const cached = getCached(transcript);
  if (cached) {
    onStage?.('speaking');
    return {
      transcript,
      reply: cached.text,
      audio: cached.audio,
      cached: true,
      searchedWeb: false,
    };
  }

  // Step 2 — Route (decision brain)
  onStage?.('routing');
  const route = routeVoiceQuery(transcript);
  let reply: string;
  let searchedWeb = false;

  if (route.needsSearch && route.searchQuery && getSecret('TAVILY_API_KEY')) {
    // Step 3a — Retrieve (Tavily) + Think (LLM with live context)
    onStage?.('searching');
    searchedWeb = true;

    try {
      const search = await searchWithTavily(route.searchQuery);

      onStage?.('thinking');

      if (search.empty) {
        reply = await generateEmptySearchReply(transcript);
      } else {
        reply = await generateTavilyReply(transcript, search.answer, search.sources);
      }
    } catch (e) {
      onStage?.('thinking');
      if (
        e instanceof TavilyRateLimitError ||
        e instanceof TavilyTimeoutError ||
        (e instanceof Error && e.message.includes('TAVILY'))
      ) {
        console.warn('[voice] Tavily fallback:', (e as Error).message);
        reply = await generateSearchUnavailableReply(transcript);
        searchedWeb = false;
      } else {
        throw e;
      }
    }
  } else {
    // Step 3b — Think (internal LLM only)
    onStage?.('thinking');
    reply = await generateInternalReply(transcript);
  }

  if (!reply) {
    throw new Error('AI could not generate a reply — try again.');
  }

  // Step 4 — Speak (TTS)
  onStage?.('speaking');
  const audioOut = await synthesizeWithEdgeTts(reply);
  setCache(transcript, reply, audioOut);

  return { transcript, reply, audio: audioOut, cached: false, searchedWeb };
}
