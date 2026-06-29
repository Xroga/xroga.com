/** Hailuo / MiniMax — cheap draft video clips */

interface MiniMaxVideoResponse {
  task_id?: string;
  data?: { video_url?: string };
  base_resp?: { status_code: number; status_msg?: string };
}

function getHailuoKey(): string {
  const key = process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY;
  if (!key) throw new Error('HAILUO_API_KEY not configured');
  return key;
}

async function pollTask(taskId: string, apiKey: string, base: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${base}/v1/video_generation/query?task_id=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Hailuo poll error: ${res.status}`);
    const data = (await res.json()) as MiniMaxVideoResponse;
    if (data.data?.video_url) return data.data.video_url;
    if (data.base_resp?.status_code && data.base_resp.status_code !== 0 && data.base_resp.status_code !== 1) {
      throw new Error(data.base_resp.status_msg ?? 'Hailuo video failed');
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error('Hailuo video timed out');
}

export async function generateHailuoVideo(prompt: string, durationSeconds = 5): Promise<string> {
  const apiKey = getHailuoKey();
  const base = process.env.MINIMAX_API_BASE ?? 'https://api.minimax.io';

  const response = await fetch(`${base}/v1/video_generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'video-01',
      prompt,
      duration: Math.min(durationSeconds, 6),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hailuo video error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as MiniMaxVideoResponse;
  if (data.data?.video_url) return data.data.video_url;
  if (!data.task_id) throw new Error('Hailuo returned no task_id');

  return pollTask(data.task_id, apiKey, base);
}
