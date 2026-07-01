import { getSecret } from '../../config/envSecrets.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import { generateImage } from '../../services/builder/imageGen.js';
import { generateAgnesImage } from '../agnes.js';

interface RunwayTask {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  output?: string[];
  failure?: string;
}

const BASE = 'https://api.dev.runwayml.com/v1';
const RUNWAY_VERSION = '2024-11-06';

async function pollTask(id: string, apiKey: string): Promise<RunwayTask> {
  for (let i = 0; i < 80; i++) {
    const res = await fetch(`${BASE}/tasks/${id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
    });
    if (!res.ok) throw new Error(`Runway poll error: ${res.status}`);
    const task = (await res.json()) as RunwayTask;
    if (task.status === 'SUCCEEDED' || task.status === 'FAILED' || task.status === 'CANCELLED') {
      return task;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error('Runway video generation timed out');
}

async function submitRunwayTask(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>
): Promise<RunwayTask> {
  const createRes = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': RUNWAY_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Runway ${endpoint} error ${createRes.status}: ${errText.slice(0, 250)}`);
  }

  let task = (await createRes.json()) as RunwayTask;
  if (task.status !== 'SUCCEEDED') {
    task = await pollTask(task.id, apiKey);
  }
  if (task.status === 'FAILED' || task.status === 'CANCELLED') {
    throw new Error(task.failure ?? 'Runway video generation failed');
  }
  const url = task.output?.[0];
  if (!url) throw new Error('Runway returned no video URL');
  return task;
}

async function resolveKeyframe(prompt: string, userId?: string): Promise<string> {
  const clean = sanitizeVideoPrompt(prompt);
  try {
    return await generateAgnesImage(`Cinematic still: ${clean.slice(0, 400)}`);
  } catch {
    const out = await generateImage(`Cinematic still: ${clean}`, { userId, fast: true, aspectFormat: '16:9' });
    if (out.type === 'image_blocked') throw new Error('Keyframe blocked');
    return out.imageUrl;
  }
}

export async function generateRunwayImageToVideo(
  prompt: string,
  durationSeconds = 5,
  options?: { aspectRatio?: '9:16' | '16:9'; userId?: string; keyframeUrl?: string }
): Promise<string> {
  const apiKey = getSecret('RUNWAY_API_KEY');
  if (!apiKey) throw new Error('RUNWAY_API_KEY not configured');

  const cleanPrompt = sanitizeVideoPrompt(prompt);
  const dur = Math.min(Math.max(durationSeconds, 2), 10);
  const ratio = options?.aspectRatio === '9:16' ? '720:1280' : '1280:720';
  const keyframe = options?.keyframeUrl ?? (await resolveKeyframe(cleanPrompt, options?.userId));

  const task = await submitRunwayTask(apiKey, 'image_to_video', {
    model: 'gen4_turbo',
    promptImage: keyframe,
    promptText: cleanPrompt.slice(0, 1000),
    duration: dur,
    ratio,
  });
  const url = task.output?.[0];
  if (!url) throw new Error('Runway i2v returned no video URL');
  return url;
}

export async function generateRunwayVideo(
  prompt: string,
  durationSeconds = 5,
  options?: { aspectRatio?: '9:16' | '16:9'; userId?: string }
): Promise<string> {
  const apiKey = getSecret('RUNWAY_API_KEY');
  if (!apiKey) throw new Error('RUNWAY_API_KEY not configured');

  const cleanPrompt = sanitizeVideoPrompt(prompt);
  const dur = Math.min(Math.max(durationSeconds, 2), 10);
  const ratio = options?.aspectRatio === '9:16' ? '720:1280' : '1280:720';
  const errors: string[] = [];

  const textModels = ['gen4.5', 'veo3.1_fast'] as const;
  for (const model of textModels) {
    try {
      const task = await submitRunwayTask(apiKey, 'text_to_video', {
        model,
        promptText: cleanPrompt.slice(0, 1000),
        duration: dur,
        ratio,
      });
      const url = task.output?.[0];
      if (url) return url;
    } catch (err) {
      errors.push(`${model}: ${(err as Error).message.slice(0, 80)}`);
    }
  }

  try {
    const keyframe = await resolveKeyframe(cleanPrompt, options?.userId);
    return await generateRunwayImageToVideo(cleanPrompt, dur, {
      aspectRatio: options?.aspectRatio,
      userId: options?.userId,
      keyframeUrl: keyframe,
    });
  } catch (err) {
    errors.push(`gen4_turbo-i2v: ${(err as Error).message.slice(0, 80)}`);
  }

  throw new Error(`Runway failed. ${errors.join(' | ')}`);
}
