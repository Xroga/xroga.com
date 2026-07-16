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
  buildConversationUserPrompt,
  type VoiceHistoryTurn,
} from './voicePrompt.js';
import { RateLimitError } from './groqWhisper.js';
import { synthesizeWithEdgeTts, type VoiceGender } from './edgeTts.js';
import { routeVoiceQuery } from './voiceRouter.js';
import { webSearch } from '../../lib/webSearch.js';
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

const GROQ_VOICE_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] as const;
const GEMINI_VOICE_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'] as const;

async function callLlm(system: string, user: string): Promise<string> {
  const groqKey = getSecret('GROQ_API_KEY');
  const geminiKey = getSecret('GEMINI_API_KEY');

  if (groqKey) {
    for (const model of GROQ_VOICE_MODELS) {
      try {
        const reply = await groqChat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { model, maxTokens: 280, temperature: 0.7 }
        );
        if (reply.trim()) return reply.trim();
      } catch (e) {
        console.warn(`[voice] Groq ${model} failed:`, (e as Error).message);
      }
    }
  }

  if (geminiKey) {
    for (const model of GEMINI_VOICE_MODELS) {
      try {
        const reply = await geminiGenerate(system, user, { model, maxTokens: 180 });
        if (reply.trim()) return reply.trim();
      } catch (e) {
        console.warn(`[voice] Gemini ${model} failed:`, (e as Error).message);
      }
    }
  }

  throw new Error('Voice AI is busy right now — please try again in a moment.');
}

async function generateInternalReply(
  transcript: string,
  history: VoiceHistoryTurn[] = []
): Promise<string> {
  return callLlm(VOICE_SYSTEM_PROMPT, buildConversationUserPrompt(transcript, history));
}

async function generateTavilyReply(
  transcript: string,
  searchAnswer: string,
  sources: string[],
  history: VoiceHistoryTurn[] = []
): Promise<string> {
  return callLlm(
    VOICE_TAVILY_PROMPT,
    buildTavilyUserPrompt(transcript, searchAnswer, sources, history)
  );
}

async function generateEmptySearchReply(
  transcript: string,
  history: VoiceHistoryTurn[] = []
): Promise<string> {
  return callLlm(
    VOICE_TAVILY_EMPTY_PROMPT,
    buildConversationUserPrompt(transcript, history)
  );
}

async function generateSearchUnavailableReply(
  transcript: string,
  history: VoiceHistoryTurn[] = []
): Promise<string> {
  return callLlm(
    VOICE_SEARCH_UNAVAILABLE_PROMPT,
    buildConversationUserPrompt(transcript, history)
  );
}

/** Prefer Groq Whisper; fall back to browser transcript; pick the clearer text. */
function resolveTranscript(whisper: string, client?: string): string {
  const w = whisper.trim();
  const c = client?.trim() ?? '';
  if (w && c) {
    // If Whisper is very short vs browser, or looks garbled, prefer longer clear client text
    if (w.length < 8 && c.length >= 8) return c;
    if (c.length > w.length * 1.6 && c.split(/\s+/).length >= 4) return c;
    return w;
  }
  return w || c;
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
  onTranscript?: (text: string) => void,
  clientTranscript?: string,
  voiceGender: VoiceGender = 'female',
  history: VoiceHistoryTurn[] = []
): Promise<VoicePipelineResult> {
  const { transcribeWithGroqWhisper } = await import('./groqWhisper.js');

  // Step 1 — Listen (Groq Whisper STT + browser transcript fallback)
  onStage?.('transcribing');
  let whisperText = '';
  try {
    if (audio.length >= 800) {
      whisperText = await transcribeWithGroqWhisper(audio, mimeType);
    }
  } catch (e) {
    if (e instanceof RateLimitError) {
      console.warn('[voice] Whisper rate limited — using browser transcript if available');
    } else {
      console.warn('[voice] Whisper failed:', (e as Error).message);
    }
  }

  const transcript = resolveTranscript(whisperText, clientTranscript);

  if (!transcript.trim()) {
    throw new Error('Could not hear you — try speaking a bit louder and hold the orb while talking.');
  }

  onTranscript?.(transcript);

  // Skip cache when we have conversation history — cached one-shots break continuity
  const cached = history.length === 0 ? getCached(transcript) : null;
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

  if (route.needsSearch && route.searchQuery) {
    onStage?.('searching');
    searchedWeb = true;

    try {
      let searchAnswer = '';
      let sources: string[] = [];

      const searx = await webSearch(route.searchQuery, { maxResults: 5 });
      if (searx.length) {
        sources = searx.map((r) => r.url);
        searchAnswer = searx
          .slice(0, 4)
          .map((r) => `${r.title}: ${r.content.slice(0, 120)} (${r.url})`)
          .join('\n');
      } else if (getSecret('TAVILY_API_KEY') && process.env.TAVILY_FALLBACK !== 'false') {
        const search = await searchWithTavily(route.searchQuery);
        if (!search.empty) {
          sources = search.sources;
          searchAnswer = search.answer;
        }
      }

      onStage?.('thinking');

      if (!searchAnswer.trim()) {
        reply = await generateEmptySearchReply(transcript, history);
      } else {
        reply = await generateTavilyReply(transcript, searchAnswer, sources, history);
      }
    } catch (e) {
      onStage?.('thinking');
      if (
        e instanceof TavilyRateLimitError ||
        e instanceof TavilyTimeoutError ||
        (e instanceof Error && e.message.includes('TAVILY'))
      ) {
        console.warn('[voice] Tavily fallback:', (e as Error).message);
        reply = await generateSearchUnavailableReply(transcript, history);
        searchedWeb = false;
      } else {
        throw e;
      }
    }
  } else {
    // Step 3b — Think (Groq LLM with conversation context)
    onStage?.('thinking');
    reply = await generateInternalReply(transcript, history);
  }

  if (!reply) {
    throw new Error('AI could not generate a reply — try again.');
  }

  // Step 4 — Speak (TTS)
  onStage?.('speaking');
  const audioOut = await synthesizeWithEdgeTts(reply, voiceGender);
  if (history.length === 0) {
    setCache(transcript, reply, audioOut);
  }

  return { transcript, reply, audio: audioOut, cached: false, searchedWeb };
}
