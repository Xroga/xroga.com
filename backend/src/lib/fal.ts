/** Fal.ai image generation — sync fal.run with queue.fal.run fallback */

import { falImageSize, type ImageProviderOptions } from './imageAspect.js';

const FAL_KEY = () => (process.env.FAL_KEY ?? process.env.FAL_API_KEY)?.trim();

type FalModel = {
  id: string;
  syncUrl: string;
  queueUrl: string;
  body: Record<string, unknown>;
};

function buildFalModels(imageSize: string): FalModel[] {
  return [
    {
      id: 'flux/schnell',
      syncUrl: 'https://fal.run/fal-ai/flux/schnell',
      queueUrl: 'https://queue.fal.run/fal-ai/flux/schnell',
      body: { num_inference_steps: 4, image_size: imageSize },
    },
    {
      id: 'flux/dev',
      syncUrl: 'https://fal.run/fal-ai/flux/dev',
      queueUrl: 'https://queue.fal.run/fal-ai/flux/dev',
      body: { num_inference_steps: 28, guidance_scale: 3.5, image_size: imageSize },
    },
    {
      id: 'flux-2/flash',
      syncUrl: 'https://fal.run/fal-ai/flux-2/flash',
      queueUrl: 'https://queue.fal.run/fal-ai/flux-2/flash',
      body: { image_size: imageSize, num_images: 1 },
    },
  ];
}

type FalImagePayload = {
  images?: Array<{ url?: string }>;
  image?: { url?: string };
  output?: { images?: Array<{ url?: string }> };
  data?: { images?: Array<{ url?: string }> };
  request_id?: string;
  response_url?: string;
  status_url?: string;
};

function parseFalImageUrl(data: FalImagePayload): string | null {
  return (
    data.images?.[0]?.url ??
    data.image?.url ??
    data.output?.images?.[0]?.url ??
    data.data?.images?.[0]?.url ??
    null
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollFalQueue(
  apiKey: string,
  model: FalModel,
  requestId: string,
  responseUrl?: string,
  statusUrl?: string
): Promise<string> {
  const statusEndpoint =
    statusUrl ?? `https://queue.fal.run/fal-ai/${model.id}/requests/${requestId}/status`;
  const resultEndpoint =
    responseUrl ?? `https://queue.fal.run/fal-ai/${model.id}/requests/${requestId}`;

  const headers = { Authorization: `Key ${apiKey}` };

  for (let i = 0; i < 90; i++) {
    const statusRes = await fetch(statusEndpoint, { headers, signal: AbortSignal.timeout(15_000) });
    const statusRaw = await statusRes.text();
    if (!statusRes.ok) {
      throw new Error(`Fal queue status ${statusRes.status}: ${statusRaw.slice(0, 200)}`);
    }

    let statusJson: { status?: string; queue_position?: number };
    try {
      statusJson = JSON.parse(statusRaw) as { status?: string; queue_position?: number };
    } catch {
      throw new Error(`Fal queue invalid status JSON: ${statusRaw.slice(0, 120)}`);
    }

    const status = statusJson.status?.toUpperCase();
    if (status === 'COMPLETED' || status === 'OK') {
      const resultRes = await fetch(resultEndpoint, { headers, signal: AbortSignal.timeout(30_000) });
      const resultRaw = await resultRes.text();
      if (!resultRes.ok) {
        throw new Error(`Fal queue result ${resultRes.status}: ${resultRaw.slice(0, 200)}`);
      }
      let resultJson: FalImagePayload & { payload?: FalImagePayload };
      try {
        resultJson = JSON.parse(resultRaw) as FalImagePayload & { payload?: FalImagePayload };
      } catch {
        throw new Error(`Fal queue invalid result JSON: ${resultRaw.slice(0, 120)}`);
      }
      const url = parseFalImageUrl(resultJson.payload ?? resultJson);
      if (!url) throw new Error('Fal queue completed but returned no image URL');
      return url;
    }

    if (status === 'FAILED' || status === 'CANCELLED' || status === 'CANCELED') {
      throw new Error(`Fal queue ${status}: ${statusRaw.slice(0, 200)}`);
    }

    await sleep(status === 'IN_QUEUE' ? 800 : 1200);
  }

  throw new Error('Fal queue timed out waiting for image');
}

async function callFalSync(apiKey: string, model: FalModel, prompt: string): Promise<string> {
  const response = await fetch(model.syncUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt.slice(0, 900),
      num_images: 1,
      enable_safety_checker: false,
      output_format: 'jpeg',
      ...model.body,
    }),
    signal: AbortSignal.timeout(70_000),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Fal sync ${response.status}: ${raw.slice(0, 300)}`);
  }

  let data: FalImagePayload;
  try {
    data = JSON.parse(raw) as FalImagePayload;
  } catch {
    throw new Error(`Fal sync invalid JSON: ${raw.slice(0, 120)}`);
  }

  const directUrl = parseFalImageUrl(data);
  if (directUrl) return directUrl;

  if (data.request_id) {
    return pollFalQueue(apiKey, model, data.request_id, data.response_url, data.status_url);
  }

  throw new Error('Fal sync returned no image URL');
}

async function callFalQueue(apiKey: string, model: FalModel, prompt: string): Promise<string> {
  const response = await fetch(model.queueUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt.slice(0, 900),
      num_images: 1,
      enable_safety_checker: false,
      output_format: 'jpeg',
      ...model.body,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Fal queue submit ${response.status}: ${raw.slice(0, 300)}`);
  }

  let data: FalImagePayload;
  try {
    data = JSON.parse(raw) as FalImagePayload;
  } catch {
    throw new Error(`Fal queue submit invalid JSON: ${raw.slice(0, 120)}`);
  }

  const directUrl = parseFalImageUrl(data);
  if (directUrl) return directUrl;

  if (!data.request_id) {
    throw new Error('Fal queue submit returned no request_id or image');
  }

  return pollFalQueue(apiKey, model, data.request_id, data.response_url, data.status_url);
}

export async function generateFalImage(prompt: string, options?: ImageProviderOptions): Promise<string> {
  const apiKey = FAL_KEY();
  if (!apiKey) throw new Error('FAL_KEY not configured');

  const imageSize = falImageSize(options?.aspectFormat);
  const FAL_MODELS = buildFalModels(imageSize);
  let lastErr: Error | null = null;

  for (const model of FAL_MODELS) {
    for (const mode of ['sync', 'queue'] as const) {
      try {
        const url =
          mode === 'sync'
            ? await callFalSync(apiKey, model, prompt)
            : await callFalQueue(apiKey, model, prompt);
        if (url) return url;
      } catch (err) {
        lastErr = err as Error;
        console.warn(`[Fal] ${model.id} (${mode}) failed:`, lastErr.message);
      }
    }
  }

  throw lastErr ?? new Error('Fal.ai image generation failed');
}
