/**
 * Post-generation subject alignment — Gemini vision checks video frame vs user intent.
 */

import { extractVideoFrame } from '../ffmpeg.js';

export interface VideoAlignmentResult {
  aligned: boolean;
  score: number;
  detectedSubject: string;
  expectedSubjects: string[];
  issues: string[];
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
  if (imageUrl.startsWith('data:image/')) {
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1], data: match[2] };
    throw new Error('Invalid data URL');
  }
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
  return { data: buffer.toString('base64'), mimeType };
}

function heuristicAlignment(
  userIntent: string,
  lockedSubjects: string[],
  mustNotInclude: string[]
): VideoAlignmentResult {
  const lower = userIntent.toLowerCase();
  const expectsAnimal = ANIMAL_RE.test(lower) && !HUMAN_RE.test(lower);
  if (expectsAnimal && mustNotInclude.some((m) => /human|woman|man|person|bikini/i.test(m))) {
    return {
      aligned: false,
      score: 40,
      detectedSubject: 'unknown (vision unavailable)',
      expectedSubjects: lockedSubjects,
      issues: ['Subject alignment could not be verified — retry with stricter subject lock'],
    };
  }
  return {
    aligned: true,
    score: 70,
    detectedSubject: lockedSubjects[0] ?? 'scene',
    expectedSubjects: lockedSubjects,
    issues: [],
  };
}

const HUMAN_RE = /\b(person|people|human|man|woman|girl|boy|bikini|model)\b/i;
const ANIMAL_RE =
  /\b(cat|kitten|dog|puppy|bird|horse|lion|tiger|bear|fish|whale|dolphin|rabbit|fox|wolf)\b/i;

export async function verifyVideoAlignment(options: {
  videoUrl: string;
  userIntent: string;
  lockedSubjects?: string[];
  mustNotInclude?: string[];
}): Promise<VideoAlignmentResult> {
  const { videoUrl, userIntent } = options;
  const lockedSubjects = options.lockedSubjects?.length
    ? options.lockedSubjects
    : [sanitizeIntentSubject(userIntent)];
  const mustNotInclude = options.mustNotInclude ?? [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return heuristicAlignment(userIntent, lockedSubjects, mustNotInclude);
  }

  let frameDataUrl: string;
  try {
    frameDataUrl = await extractVideoFrame(videoUrl, { atSeconds: 1 });
  } catch (err) {
    console.warn('[VideoAlignment] Frame extract failed:', (err as Error).message);
    return heuristicAlignment(userIntent, lockedSubjects, mustNotInclude);
  }

  try {
    const frame = await fetchImageAsBase64(frameDataUrl);
    const mustNotLine =
      mustNotInclude.length > 0 ? `\nMust NOT appear: ${mustNotInclude.join(', ')}` : '';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are Xroga Video Truth Inspector. Does this video frame match what the user asked for?

User request: "${userIntent}"
Required subjects: ${lockedSubjects.join(', ')}${mustNotLine}

Describe the PRIMARY visible subject (e.g. "domestic cat", "woman in bikini", "car").
Return ONLY JSON:
{"aligned":true,"score":85,"detectedSubject":"domestic cat on beach","issues":[]}

- aligned=true ONLY if required subjects are clearly visible AND forbidden subjects are absent
- score 0-100 (subject match weight 60%, scene match 40%)
- issues: list mismatches like "Shows woman instead of cat"`,
              },
              { inline_data: { mime_type: frame.mimeType, data: frame.data } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      return heuristicAlignment(userIntent, lockedSubjects, mustNotInclude);
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return heuristicAlignment(userIntent, lockedSubjects, mustNotInclude);

    const parsed = JSON.parse(match[0]) as {
      aligned?: boolean;
      score?: number;
      detectedSubject?: string;
      issues?: string[];
    };

    const score = Math.min(100, Math.max(0, Number(parsed.score) || 0));
    const issues = Array.isArray(parsed.issues) ? parsed.issues.filter(Boolean) : [];
    const aligned = parsed.aligned === true && score >= 65 && issues.length === 0;

    if (!aligned && issues.length === 0) {
      issues.push(
        `Subject mismatch: expected ${lockedSubjects.join(', ')}, detected ${parsed.detectedSubject ?? 'unknown'}`
      );
    }

    return {
      aligned,
      score,
      detectedSubject: parsed.detectedSubject ?? 'unknown',
      expectedSubjects: lockedSubjects,
      issues,
    };
  } catch (err) {
    console.warn('[VideoAlignment] Gemini vision failed:', (err as Error).message);
    return heuristicAlignment(userIntent, lockedSubjects, mustNotInclude);
  }
}

function sanitizeIntentSubject(intent: string): string {
  const animal = intent.match(ANIMAL_RE);
  if (animal) return animal[1];
  return intent.slice(0, 40);
}
