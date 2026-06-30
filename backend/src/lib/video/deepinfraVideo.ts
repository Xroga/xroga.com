/** DeepInfra OSS text-to-video — Wan 2.2/2.6, Pruna (open-source hosted) */

import { getSecret } from '../../config/envSecrets.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

const MODELS = [
  'Wan-AI/Wan2.2-T2V-A14B',
  'Wan-AI/Wan2.6-T2V',
  'Wan-AI/Wan2.1-T2V-14B',
  'PrunaAI/p-video',
] as const;

interface DeepInfraResponse {
  video?: string;
  video_url?: string;
  output?: { video?: string; url?: string };
  results?: Array<{ video?: string; url?: string }>;
  request_id?: string;
  status?: string;
}

async function pollDeepInfra(apiKey: string, model: string, requestId: string): Promise<string> {
  const pollUrl = `https://api.deepinfra.com/v1/inference/${model}/${requestId}`;
  for (let i = 0; i < 90; i++) {
    const res = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`DeepInfra poll error: ${res.status}`);
    const data = (await res.json()) as DeepInfraResponse & { inference_status?: { status?: string } };
    const url = extractVideoUrl(data);
    if (url) return url;
    const st = data.status ?? data.inference_status?.status ?? '';
    if (st === 'failed' || st === 'error') throw new Error('DeepInfra video failed');
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error('DeepInfra video timed out');
}

function extractVideoUrl(data: DeepInfraResponse): string | null {
  if (typeof data.video === 'string' && data.video.startsWith('http')) return data.video;
  if (typeof data.video_url === 'string' && data.video_url.startsWith('http')) return data.video_url;
  if (data.output?.video?.startsWith('http')) return data.output.video;
  if (data.output?.url?.startsWith('http')) return data.output.url;
  const r0 = data.results?.[0];
  if (r0?.video?.startsWith('http')) return r0.video;
  if (r0?.url?.startsWith('http')) return r0.url;
  return null;
}

async function tryModel(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`https://api.deepinfra.com/v1/inference/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000) }),
    signal: AbortSignal.timeout(120_000),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`DeepInfra ${model} error ${res.status}: ${body.slice(0, 200)}`);

  const data = JSON.parse(body) as DeepInfraResponse & { request_id?: string };
  const immediate = extractVideoUrl(data);
  if (immediate) return immediate;
  if (data.request_id) return pollDeepInfra(apiKey, model, data.request_id);
  throw new Error(`DeepInfra ${model} returned no video URL`);
}

export async function generateDeepInfraVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const apiKey = getSecret('DEEPINFRA_API_KEY');
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY not configured');

  const clean = sanitizeVideoPrompt(prompt);
  const errors: string[] = [];
  for (const model of MODELS) {
    try {
      return await tryModel(apiKey, model, clean);
    } catch (err) {
      errors.push(`${model}: ${(err as Error).message.slice(0, 80)}`);
    }
  }
  throw new Error(`DeepInfra failed. ${errors.join(' | ')}`);
}
