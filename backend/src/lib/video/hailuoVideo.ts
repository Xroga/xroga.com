/** Hailuo / MiniMax — https://platform.minimax.io/docs/api-reference/video-generation-t2v */

import { getSecret } from '../../config/envSecrets.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

interface MiniMaxTaskResponse {
  task_id?: string;
  base_resp?: { status_code: number; status_msg?: string };
}

interface MiniMaxQueryResponse {
  status?: string;
  file_id?: string;
  base_resp?: { status_code: number; status_msg?: string };
}

interface MiniMaxFileResponse {
  file?: { download_url?: string; file_id?: string };
  base_resp?: { status_code: number; status_msg?: string };
}

function getHailuoKey(): string {
  const key = getSecret('HAILUO_API_KEY');
  if (!key) throw new Error('HAILUO_API_KEY not configured');
  return key;
}

const API_BASE = 'https://api.minimax.io';

async function pollVideoTask(taskId: string, apiKey: string): Promise<string> {
  for (let i = 0; i < 45; i++) {
    const res = await fetch(`${API_BASE}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Hailuo poll error: ${res.status}`);
    const data = (await res.json()) as MiniMaxQueryResponse;
    const status = (data.status ?? '').toLowerCase();

    if (status === 'success' && data.file_id) {
      return fetchDownloadUrl(data.file_id, apiKey);
    }
    if (status === 'fail' || status === 'failed') {
      throw new Error(data.base_resp?.status_msg ?? 'Hailuo video failed');
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('Hailuo video timed out');
}

async function fetchDownloadUrl(fileId: string, apiKey: string): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/files/retrieve?file_id=${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Hailuo file retrieve error: ${res.status}`);
  const data = (await res.json()) as MiniMaxFileResponse;
  const url = data.file?.download_url;
  if (!url) throw new Error('Hailuo returned no download URL');
  return url;
}

export async function generateHailuoVideo(
  prompt: string,
  durationSeconds = 5,
  options?: { aspectRatio?: '9:16' | '16:9' }
): Promise<string> {
  const apiKey = getHailuoKey();
  const dur = durationSeconds <= 6 ? 6 : 10;
  const cleanPrompt = sanitizeVideoPrompt(prompt).slice(0, 2000);

  const response = await fetch(`${API_BASE}/v1/video_generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'MiniMax-Hailuo-2.3',
      prompt: cleanPrompt,
      duration: dur,
      resolution: '768P',
      prompt_optimizer: true,
      fast_pretreatment: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Hailuo video error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = JSON.parse(body) as MiniMaxTaskResponse;
  if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
    throw new Error(data.base_resp.status_msg ?? 'Hailuo task creation failed');
  }
  if (!data.task_id) throw new Error('Hailuo returned no task_id');

  return pollVideoTask(data.task_id, apiKey);
}
