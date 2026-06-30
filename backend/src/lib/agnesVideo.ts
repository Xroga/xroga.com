/** Agnes Video V2.0 — apihub.agnes-ai.com (same hub as working image API) */

import { getSecret } from '../config/envSecrets.js';

const AGNES_HUB = 'https://apihub.agnes-ai.com/v1';
const AGNES_POLL = 'https://apihub.agnes-ai.com/agnesapi';

function getAgnesKey(): string {
  const apiKey = getSecret('AGNES_API_KEY');
  if (!apiKey) throw new Error('AGNES_API_KEY not configured');
  return apiKey;
}

/** num_frames must follow 8n+1 rule, max 441 */
function framesForDuration(durationSeconds: number): number {
  const raw = Math.min(441, Math.max(25, Math.ceil(durationSeconds * 24)));
  return Math.floor((raw - 1) / 8) * 8 + 1;
}

interface AgnesVideoCreateResponse {
  video_id?: string;
  task_id?: string;
  id?: string;
  data?: { video_id?: string; task_id?: string };
}

interface AgnesVideoPollResponse {
  status?: string;
  state?: string;
  video_url?: string;
  url?: string;
  output?: { video_url?: string; url?: string };
  data?: { video_url?: string; url?: string; status?: string };
}

function extractVideoId(data: AgnesVideoCreateResponse): string | null {
  return data.video_id ?? data.task_id ?? data.id ?? data.data?.video_id ?? data.data?.task_id ?? null;
}

function extractVideoUrl(data: AgnesVideoPollResponse): string | null {
  const raw = data as Record<string, unknown>;
  const dataObj = raw.data as Record<string, unknown> | undefined;
  const outputObj = raw.output as Record<string, unknown> | undefined;
  const resultObj = raw.result as Record<string, unknown> | undefined;
  const candidates = [
    data.video_url,
    data.url,
    data.output?.video_url,
    data.output?.url,
    data.data?.video_url,
    data.data?.url,
    resultObj?.video_url,
    resultObj?.url,
    dataObj?.output && typeof dataObj.output === 'object' ? (dataObj.output as { video_url?: string }).video_url : undefined,
    raw.video && typeof raw.video === 'object' ? (raw.video as { url?: string }).url : undefined,
    outputObj?.video && typeof outputObj.video === 'object' ? (outputObj.video as { url?: string }).url : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

function isDone(data: AgnesVideoPollResponse): boolean {
  const status = (data.status ?? data.state ?? data.data?.status ?? '').toLowerCase();
  return ['completed', 'succeeded', 'success', 'done', 'finished'].includes(status);
}

function isFailed(data: AgnesVideoPollResponse): boolean {
  const status = (data.status ?? data.state ?? data.data?.status ?? '').toLowerCase();
  return ['failed', 'error', 'cancelled', 'canceled'].includes(status);
}

async function pollAgnesVideo(videoId: string, apiKey: string): Promise<string> {
  for (let i = 0; i < 90; i++) {
    const res = await fetch(`${AGNES_POLL}?video_id=${encodeURIComponent(videoId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const alt = await fetch(`${AGNES_HUB}/videos/${videoId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (alt.ok) {
        const altData = (await alt.json()) as AgnesVideoPollResponse;
        const url = extractVideoUrl(altData);
        if (url) return url;
        if (isFailed(altData)) throw new Error('Agnes video generation failed');
      }
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    const data = (await res.json()) as AgnesVideoPollResponse;
    const url = extractVideoUrl(data);
    if (url) return url;
    if (isDone(data) && !url) throw new Error('Agnes video completed but returned no URL');
    if (isFailed(data)) throw new Error('Agnes video generation failed');

    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Agnes video timed out');
}

export async function generateAgnesVideo(prompt: string, durationSeconds = 5): Promise<string> {
  const apiKey = getAgnesKey();

  const createRes = await fetch(`${AGNES_HUB}/videos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'agnes-video-v2.0',
      prompt: prompt.slice(0, 1000),
      height: 768,
      width: 1152,
      num_frames: framesForDuration(durationSeconds),
      frame_rate: 24,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const body = await createRes.text();
  if (!createRes.ok) {
    throw new Error(`Agnes video error ${createRes.status}: ${body.slice(0, 300)}`);
  }

  let data: AgnesVideoCreateResponse;
  try {
    data = JSON.parse(body) as AgnesVideoCreateResponse;
  } catch {
    throw new Error(`Agnes video returned invalid JSON: ${body.slice(0, 200)}`);
  }

  const immediateUrl = extractVideoUrl(data as AgnesVideoPollResponse);
  if (immediateUrl) return immediateUrl;

  const videoId = extractVideoId(data);
  if (!videoId) throw new Error('Agnes video returned no video_id');

  return pollAgnesVideo(videoId, apiKey);
}
