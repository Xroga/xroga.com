import { getKlingBearerToken } from './klingAuth.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

interface KlingTaskResponse {
  data?: { task_id?: string; task_status?: string; task_result?: { videos?: Array<{ url: string }> } };
  code?: number;
  message?: string;
}

async function pollKlingTask(taskId: string, token: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Kling poll error: ${res.status}`);
    const data = (await res.json()) as KlingTaskResponse;
    const status = data.data?.task_status ?? '';
    if (status === 'succeed' && data.data?.task_result?.videos?.[0]?.url) {
      return data.data.task_result.videos[0].url;
    }
    if (status === 'failed') throw new Error(data.message ?? 'Kling video failed');
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Kling video timed out');
}

export async function generateKlingVideo(
  prompt: string,
  durationSeconds: number,
  options?: { aspectRatio?: '9:16' | '16:9' }
): Promise<string> {
  const token = await getKlingBearerToken();
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  const duration = durationSeconds >= 8 ? '10' : '5';

  const response = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model_name: 'kling-v2-5-turbo',
      prompt: cleanPrompt.slice(0, 2000),
      duration,
      mode: 'std',
      aspect_ratio: options?.aspectRatio === '9:16' ? '9:16' : '16:9',
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Kling AI error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = JSON.parse(body) as KlingTaskResponse;
  const taskId = data.data?.task_id;
  if (!taskId) throw new Error(data.message ?? 'Kling returned no task_id');

  return pollKlingTask(taskId, token);
}
