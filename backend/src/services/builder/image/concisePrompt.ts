import { groqChat } from '../../../lib/groq.js';
import type { ImageQueryIntent } from './understanding.js';

const CONCISE_SYSTEM = `You write short image-generation prompts. Output ONE concise prompt only (max 40 words).
Include: subject, mood, lighting, style. For YouTube thumbnails add "bold text overlay" if the user wants text on the image.
No markdown, no quotes, no explanation.`;

/** Pull explicit on-image text from user commands (thumbnails, posters, etc.). */
export function extractOverlayText(userQuery: string): string | undefined {
  const q = userQuery.trim();
  const patterns = [
    /\b(?:text|title|caption|headline|words?)\s*(?:saying|reading|that says|:)\s*["“]([^"”]+)["”]/i,
    /\bwith\s+text\s+["“]([^"”]+)["”]/i,
    /\b(?:text|title|caption)\s*:\s*["“]?([^"”\n.!?]{2,80})["”]?/i,
    /\bsaying\s+["“]([^"”]+)["”]/i,
  ];
  for (const re of patterns) {
    const m = q.match(re);
    const text = m?.[1]?.trim();
    if (text && text.length >= 2) return text.slice(0, 80);
  }
  return undefined;
}

export function isThumbnailRequest(userQuery: string): boolean {
  return /\b(thumbnail|youtube\s+thumb|yt\s+thumb|video\s+thumb)\b/i.test(userQuery);
}

function fallbackConcise(intent: ImageQueryIntent, overlayText?: string): string {
  const parts = [intent.subject, intent.action, intent.environment, intent.style].filter(Boolean);
  let base = parts.join(', ').slice(0, 160) || intent.rawQuery.slice(0, 120);
  if (overlayText) base += `, bold text "${overlayText}"`;
  if (isThumbnailRequest(intent.rawQuery)) base += ', YouTube thumbnail 16:9';
  return base;
}

/** Groq — short prompt shown to the user and sent to image models. */
export async function buildConciseImagePrompt(
  intent: ImageQueryIntent,
  overlayText?: string
): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    return fallbackConcise(intent, overlayText);
  }

  const overlayHint = overlayText ? ` Required on-image text: "${overlayText}".` : '';
  const thumbHint = isThumbnailRequest(intent.rawQuery)
    ? ' This is a YouTube thumbnail — bold composition, 16:9, text-safe areas.'
    : '';

  try {
    const raw = await groqChat(
      [
        { role: 'system', content: CONCISE_SYSTEM },
        {
          role: 'user',
          content: `User request: ${intent.rawQuery}\nSubject: ${intent.subject}\nStyle: ${intent.style}.${overlayHint}${thumbHint}`,
        },
      ],
      { model: 'llama-3.3-70b-versatile', maxTokens: 120 }
    );
    const concise = raw.replace(/^["“']|["”']$/g, '').trim();
    if (concise.length >= 12) return concise.slice(0, 320);
  } catch (err) {
    console.warn('[ConcisePrompt] Groq failed:', (err as Error).message);
  }

  return fallbackConcise(intent, overlayText);
}
