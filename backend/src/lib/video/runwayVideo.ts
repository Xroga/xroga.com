import { getSecret } from '../../config/envSecrets.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

/** Runway Gen-3 Alpha — premium cinematic video */

interface RunwayTask {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  output?: string[];
  failure?: string;
}

const BASE = 'https://api.dev.runwayml.com/v1';

async function pollTask(id: string, apiKey: string): Promise<RunwayTask> {
  for (let i = 0; i < 80; i++) {
    const res = await fetch(`${BASE}/tasks/${id}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
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

export async function generateRunwayVideo(
  prompt: string,
  durationSeconds = 5,
  options?: { aspectRatio?: '9:16' | '16:9' }
): Promise<string> {
  const apiKey = getSecret('RUNWAY_API_KEY');
  if (!apiKey) throw new Error('RUNWAY_API_KEY not configured');

  const cleanPrompt = sanitizeVideoPrompt(prompt);

  const createRes = await fetch(`${BASE}/text_to_video`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: 'gen3a_turbo',
      promptText: cleanPrompt.slice(0, 1000),
      duration: Math.min(durationSeconds, 10),
      ratio: options?.aspectRatio === '9:16' ? '768:1280' : '1280:768',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Runway video error ${createRes.status}: ${errText.slice(0, 200)}`);
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
  return url;
}
