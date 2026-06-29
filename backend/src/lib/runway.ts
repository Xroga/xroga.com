/** Runway Gen-4 Image API — premium artistic image generation */

interface RunwayTask {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  output?: string[];
  failure?: string;
  failureCode?: string;
}

const BASE = 'https://api.dev.runwayml.com/v1';

function getRunwayKey(): string {
  const key = process.env.RUNWAY_API_KEY;
  if (!key) throw new Error('RUNWAY_API_KEY not configured');
  return key;
}

async function pollTask(id: string, apiKey: string): Promise<RunwayTask> {
  for (let i = 0; i < 60; i++) {
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
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Runway image generation timed out');
}

export async function generateRunwayImage(prompt: string): Promise<string> {
  const apiKey = getRunwayKey();

  const createRes = await fetch(`${BASE}/text_to_image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: 'gen4_image_turbo',
      promptText: prompt.slice(0, 1000),
      ratio: '1920:1080',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Runway image error ${createRes.status}: ${errText.slice(0, 200)}`);
  }

  let task = (await createRes.json()) as RunwayTask;
  if (task.status !== 'SUCCEEDED') {
    task = await pollTask(task.id, apiKey);
  }

  if (task.status === 'FAILED' || task.status === 'CANCELLED') {
    throw new Error(task.failure ?? task.failureCode ?? 'Runway image generation failed');
  }

  const url = task.output?.[0];
  if (!url) throw new Error('Runway returned no image URL');
  return url;
}
