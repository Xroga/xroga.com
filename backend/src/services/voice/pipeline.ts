import { createHash } from 'crypto';
import { groqChat } from '../../lib/groq.js';
import { geminiGenerate } from '../../lib/gemini.js';
import { getSecret } from '../../config/envSecrets.js';
import { VOICE_SYSTEM_PROMPT } from './voicePrompt.js';
import { RateLimitError } from './groqWhisper.js';
import { synthesizeWithEdgeTts } from './edgeTts.js';

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

async function generateVoiceReply(transcript: string): Promise<string> {
  if (getSecret('GROQ_API_KEY')) {
    try {
      return await groqChat(
        [
          { role: 'system', content: VOICE_SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
        { model: 'llama-3.3-70b-versatile', maxTokens: 180, temperature: 0.85 }
      );
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('429')) throw e;
      console.warn('[voice] Groq LLM rate limited — falling back to Gemini');
    }
  }

  if (getSecret('GEMINI_API_KEY')) {
    return geminiGenerate(VOICE_SYSTEM_PROMPT, transcript, {
      model: 'gemini-2.0-flash',
      maxTokens: 180,
    });
  }

  throw new Error('No LLM available for voice (set GROQ_API_KEY or GEMINI_API_KEY)');
}

export type VoiceStage = 'transcribing' | 'thinking' | 'speaking';

export interface VoicePipelineResult {
  transcript: string;
  reply: string;
  audio: Buffer;
  cached: boolean;
}

export async function runVoicePipeline(
  audio: Buffer,
  mimeType: string,
  onStage?: (stage: VoiceStage) => void
): Promise<VoicePipelineResult> {
  const { transcribeWithGroqWhisper } = await import('./groqWhisper.js');

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

  const cached = getCached(transcript);
  if (cached) {
    onStage?.('speaking');
    return { transcript, reply: cached.text, audio: cached.audio, cached: true };
  }

  onStage?.('thinking');
  const reply = await generateVoiceReply(transcript);
  if (!reply) {
    throw new Error('AI could not generate a reply — try again.');
  }

  onStage?.('speaking');
  const audioOut = await synthesizeWithEdgeTts(reply);
  setCache(transcript, reply, audioOut);

  return { transcript, reply, audio: audioOut, cached: false };
}
