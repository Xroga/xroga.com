/** PiAPI gateway — SkyReels V1 human-centric video (optional PIAPI_API_KEY) */

import { getSecret } from '../../config/envSecrets.js';
import { generateImage } from '../../services/builder/imageGen.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

interface PiApiTaskResponse {
  data?: {
    task_id?: string;
    status?: string;
    output?: { video_url?: string; works?: Array<{ video?: { resource?: string } }> };
  };
}

export async function generateSkyReelsVideo(
  prompt: string,
  options?: { userId?: string; keyframeUrl?: string; aspectRatio?: '9:16' | '16:9' }
): Promise<string> {
  const apiKey = getSecret('PIAPI_API_KEY');
  if (!apiKey) throw new Error('PIAPI_API_KEY not configured for SkyReels');

  let image = options?.keyframeUrl;
  if (!image) {
    const out = await generateImage(`Portrait cinematic still: ${sanitizeVideoPrompt(prompt)}`, {
      userId: options?.userId,
      fast: true,
      aspectFormat: options?.aspectRatio === '9:16' ? '9:16' : '16:9',
    });
    if (out.type === 'image_blocked' || !out.imageUrl) {
      throw new Error('SkyReels needs a reference image');
    }
    image = out.imageUrl;
  }

  const clean = sanitizeVideoPrompt(prompt).slice(0, 800);
  const aspect = options?.aspectRatio === '9:16' ? '9:16' : options?.aspectRatio === '16:9' ? '16:9' : '16:9';

  const createRes = await fetch('https://api.piapi.ai/api/v1/task', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model: 'Qubico/skyreels',
      task_type: 'img2video',
      input: {
        prompt: `FPS-24, ${clean}`,
        image,
        aspect_ratio: aspect,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!createRes.ok) {
    throw new Error(`PiAPI SkyReels error ${createRes.status}: ${(await createRes.text()).slice(0, 200)}`);
  }

  const created = (await createRes.json()) as PiApiTaskResponse;
  const taskId = created.data?.task_id;
  if (!taskId) throw new Error('PiAPI returned no task_id');

  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const pollRes = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!pollRes.ok) continue;

    const poll = (await pollRes.json()) as PiApiTaskResponse;
    const status = poll.data?.status ?? '';
    const url =
      poll.data?.output?.video_url ??
      poll.data?.output?.works?.[0]?.video?.resource;
    if (url && (status === 'completed' || status === 'success')) return url;
    if (status === 'failed' || status === 'error') {
      throw new Error('SkyReels task failed on PiAPI');
    }
  }

  throw new Error('SkyReels timed out on PiAPI');
}
