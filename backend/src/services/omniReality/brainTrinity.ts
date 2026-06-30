/**
 * Trinity Brain — DeepSeek (Showrunner), Gemini (Art Director), Groq (Reflex Surgeon).
 * Generates logic JSON; no pixels.
 */

import { deepSeekChat } from '../../lib/deepseek.js';
import { groqChat } from '../../lib/groq.js';
import { callWithLlmFallback } from '../../lib/llmFallback.js';

export interface ContinuityLock {
  id: string;
  description: string;
}

export interface StoryboardScene {
  scene_id: string;
  location: string;
  action: string;
  dialogue: string;
  durationSeconds: number;
  mood_tone: string;
  shot_type: string;
  priority: 'critical' | 'low';
  continuity_locks: string[];
}

export interface OmniStoryboard {
  title: string;
  mood: string;
  mood_tone: string;
  continuity_locks: ContinuityLock[];
  characters: Array<{ name: string; description: string }>;
  scenes: StoryboardScene[];
  scriptProvider?: string;
}

const SHOWRUNNER_SYSTEM = `You are DeepSeek Showrunner for Xroga Omni-Reality video production.
Break the user's prompt into a Hollywood storyboard JSON. Enforce:
- 5-second hook in scene 1 (high contrast, central focal point)
- 180-degree rule between dialogue scenes
- Save-the-Cat beat structure for multi-scene
- continuity_locks (hero outfit, scars, props) that persist across scenes

Return ONLY valid JSON:
{
  "title": "",
  "mood": "",
  "mood_tone": "Triumphant|Suspenseful|Angsty|...",
  "continuity_locks": [{"id":"hero_jacket","description":"Red leather jacket"}],
  "characters": [{"name":"","description":""}],
  "scenes": [{
    "scene_id": "1",
    "location": "EXT. ALLEY",
    "action": "",
    "dialogue": "",
    "durationSeconds": 5,
    "mood_tone": "",
    "shot_type": "Wide establishing|Medium two-shot|Extreme close-up",
    "priority": "critical",
    "continuity_locks": ["hero_jacket"]
  }]
}`;

const GROQ_REFLEX_SYSTEM = `You are Groq Reflex Surgeon. A video QC inspector found defects.
Rewrite the render prompt to fix ONLY the listed issues. Add strict negative constraints.
Return ONLY JSON: {"correctedPrompt":"","negativePrompt":"No extra fingers, no warping..."}`;

const SIMPLIFY_SYSTEM = `You are DeepSeek. Simplify this video shot description so OSS video models can render it.
Reduce physical complexity: spinning kicks → slow turn; crowd → single figure; rain storm → light drizzle.
Return ONLY JSON: {"simplifiedPrompt":""}`;

export async function deepSeekStoryboard(
  userPrompt: string,
  durationSeconds: number,
  options?: { userId?: string; runId?: string }
): Promise<OmniStoryboard> {
  const sceneCount = durationSeconds <= 8 ? 1 : durationSeconds <= 15 ? 3 : Math.min(8, Math.ceil(durationSeconds / 5));

  try {
    if (process.env.DEEPSEEK_API_KEY) {
      const raw = await deepSeekChat(
        [
          { role: 'system', content: SHOWRUNNER_SYSTEM },
          {
            role: 'user',
            content: `Prompt: ${userPrompt}\nTotal duration: ~${durationSeconds}s\nScene count: ${sceneCount}`,
          },
        ],
        { model: 'deepseek-chat', maxTokens: 4096 }
      );
      const parsed = parseStoryboardJson(raw);
      if (parsed) return { ...parsed, scriptProvider: 'deepseek' };
    }
  } catch (err) {
    console.warn('[Trinity] DeepSeek storyboard failed:', (err as Error).message);
  }

  const { text, provider } = await callWithLlmFallback(
    SHOWRUNNER_SYSTEM,
    `Write storyboard for: ${userPrompt}. Duration ~${durationSeconds}s, ${sceneCount} scenes.`,
    { maxTokens: 4096, userId: options?.userId, runId: options?.runId, apiType: 'omni_storyboard', chain: ['groq', 'deepseek', 'gemini'] }
  );

  const parsed = parseStoryboardJson(text);
  if (parsed) return { ...parsed, scriptProvider: provider };

  return heuristicStoryboard(userPrompt, durationSeconds);
}

function parseStoryboardJson(raw: string): OmniStoryboard | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const data = JSON.parse(match[0]) as OmniStoryboard;
    if (!data.scenes?.length) return null;
    return {
      title: data.title ?? 'Xroga Video',
      mood: data.mood ?? 'cinematic',
      mood_tone: data.mood_tone ?? data.mood ?? 'cinematic',
      continuity_locks: data.continuity_locks ?? [],
      characters: data.characters ?? [],
      scenes: data.scenes.map((s, i) => ({
        scene_id: s.scene_id ?? String(i + 1),
        location: s.location ?? 'INT. SCENE',
        action: s.action ?? '',
        dialogue: s.dialogue ?? '',
        durationSeconds: s.durationSeconds ?? 5,
        mood_tone: s.mood_tone ?? data.mood_tone ?? 'cinematic',
        shot_type: s.shot_type ?? 'Medium shot',
        priority: (s.priority === 'critical' ? 'critical' : 'low') as 'critical' | 'low',
        continuity_locks: s.continuity_locks ?? [],
      })),
    };
  } catch {
    return null;
  }
}

function heuristicStoryboard(prompt: string, durationSeconds: number): OmniStoryboard {
  const sceneCount = durationSeconds <= 8 ? 1 : 3;
  const sceneDur = Math.max(3, Math.floor(durationSeconds / sceneCount));
  const scenes: StoryboardScene[] = [];

  for (let i = 0; i < sceneCount; i++) {
    scenes.push({
      scene_id: String(i + 1),
      location: i === 0 ? 'EXT. OPENING' : 'INT. ACTION',
      action: i === 0 ? `${prompt} — opening hook` : `${prompt} — beat ${i + 1}`,
      dialogue: i === 0 ? '' : '',
      durationSeconds: sceneDur,
      mood_tone: 'cinematic',
      shot_type: i === 0 ? 'Wide establishing' : 'Medium shot',
      priority: i === 0 || i === sceneCount - 1 ? 'critical' : 'low',
      continuity_locks: [],
    });
  }

  return {
    title: prompt.slice(0, 80),
    mood: 'cinematic',
    mood_tone: 'Suspenseful',
    continuity_locks: [],
    characters: [{ name: 'Protagonist', description: 'Main character' }],
    scenes,
    scriptProvider: 'heuristic',
  };
}

export interface GeminiVisionQC {
  face_similarity_score: number;
  physics_score: number;
  lighting_temp: string;
  flicker_detected: boolean;
  issues: string[];
  passed: boolean;
}

export async function geminiVisionQC(
  imageUrl: string,
  referencePrompt: string,
  referenceFaceUrl?: string
): Promise<GeminiVisionQC | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !imageUrl) return null;

  try {
    const frame = await fetchImageAsBase64(imageUrl);
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
      {
        text: `You are Gemini Art Director / Visual Truth inspector for video QC.
Analyze this video frame. Return ONLY JSON:
{"face_similarity_score":0.92,"physics_score":85,"lighting_temp":"Warm 3200K","flicker_detected":false,"issues":[],"passed":true}
- face_similarity_score 0-1 (vs prompt subject)
- physics_score 0-100 (hands, limbs, gravity)
- passed=true only if physics_score>=70 and face_similarity_score>=0.85
Flag: extra fingers, morphing hands, polygon edges, color flicker.

Scene prompt: ${referencePrompt.slice(0, 500)}`,
      },
      { inline_data: { mime_type: frame.mimeType, data: frame.data } },
    ];

    if (referenceFaceUrl) {
      const ref = await fetchImageAsBase64(referenceFaceUrl);
      parts.push({ text: 'Reference face for similarity:' });
      parts.push({ inline_data: { mime_type: ref.mimeType, data: ref.data } });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return null;

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as GeminiVisionQC;
    return {
      face_similarity_score: Number(parsed.face_similarity_score) || 0.8,
      physics_score: Number(parsed.physics_score) || 75,
      lighting_temp: parsed.lighting_temp ?? 'Neutral',
      flicker_detected: Boolean(parsed.flicker_detected),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      passed: parsed.passed !== false && (Number(parsed.physics_score) || 75) >= 70,
    };
  } catch (err) {
    console.warn('[Trinity] Gemini vision QC failed:', (err as Error).message);
    return null;
  }
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
  if (imageUrl.startsWith('data:image/')) {
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1], data: match[2] };
    throw new Error('Invalid data URL');
  }
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
  return { data: buffer.toString('base64'), mimeType };
}

export async function groqReflexPatch(
  originalPrompt: string,
  qcIssues: string[]
): Promise<{ correctedPrompt: string; negativePrompt: string }> {
  const issues = qcIssues.slice(0, 6).join('; ') || 'physics glitch, warping';

  try {
    if (process.env.GROQ_API_KEY) {
      const raw = await groqChat(
        [
          { role: 'system', content: GROQ_REFLEX_SYSTEM },
          { role: 'user', content: `Original: ${originalPrompt}\nQC issues: ${issues}` },
        ],
        { maxTokens: 512 }
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { correctedPrompt?: string; negativePrompt?: string };
        if (parsed.correctedPrompt) {
          return {
            correctedPrompt: parsed.correctedPrompt,
            negativePrompt: parsed.negativePrompt ?? 'No extra fingers, no warping, no morphing',
          };
        }
      }
    }
  } catch {
    /* fall through */
  }

  return {
    correctedPrompt: `${originalPrompt}. Photorealistic, rigid skeletal hands with 5 distinct fingers, sharp focus, realistic physics, smooth motion. ${issues}`,
    negativePrompt: 'No extra fingers, no blurry hands, no webbed fingers, no melting, no warping',
  };
}

export async function deepSeekSimplifyShot(complexPrompt: string): Promise<string> {
  try {
    if (process.env.DEEPSEEK_API_KEY) {
      const raw = await deepSeekChat(
        [
          { role: 'system', content: SIMPLIFY_SYSTEM },
          { role: 'user', content: complexPrompt },
        ],
        { maxTokens: 512 }
      );
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { simplifiedPrompt?: string };
        if (parsed.simplifiedPrompt) return parsed.simplifiedPrompt;
      }
    }
  } catch {
    /* fall through */
  }

  return `${complexPrompt.split('.')[0]}. Slow cinematic movement, single subject, stable camera, minimal motion complexity`;
}

export function buildRenderPromptFromScene(
  storyboard: OmniStoryboard,
  scene: StoryboardScene,
  aspectSuffix: string
): string {
  const locks = [...storyboard.continuity_locks, ...scene.continuity_locks.map((id) => storyboard.continuity_locks.find((l) => l.id === id)?.description ?? id)]
    .filter(Boolean)
    .join('; ');

  return [
    storyboard.title,
    scene.location,
    scene.shot_type,
    scene.action,
    locks ? `Continuity: ${locks}` : '',
    scene.dialogue ? `Dialogue mood: ${scene.dialogue.slice(0, 100)}` : '',
    `${scene.mood_tone}, ${aspectSuffix}`,
    'Cinematic blockbuster quality, realistic physics, smooth motion',
  ]
    .filter(Boolean)
    .join('. ');
}
