/** Replicate Stable Video Diffusion — image-to-video with real keyframe */

import { getSecret } from '../../config/envSecrets.js';
import { generateAgnesImage } from '../agnes.js';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

async function pollPrediction(apiKey: string, prediction: ReplicatePrediction): Promise<ReplicatePrediction> {
  for (let i = 0; i < 90; i++) {
    if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
      return prediction;
    }
    await new Promise((r) => setTimeout(r, 3000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`Replicate poll failed: ${pollRes.status}`);
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }
  throw new Error('Replicate SVD timed out');
}

async function resolveKeyframe(prompt: string): Promise<string> {
  try {
    return await generateAgnesImage(`Cinematic film still: ${prompt.slice(0, 400)}`);
  } catch {
    return `https://placehold.co/1280x720/1a1a2e/006aff/png?text=${encodeURIComponent(prompt.slice(0, 30))}`;
  }
}

export async function generateReplicateVideo(prompt: string): Promise<string> {
  const apiKey = getSecret('REPLICATE_API_TOKEN');
  if (!apiKey) throw new Error('REPLICATE_API_TOKEN not configured');

  const inputImage = await resolveKeyframe(prompt);

  const createRes = await fetch('https://api.replicate.com/v1/models/stability-ai/stable-video-diffusion/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      Prefer: 'wait=90',
    },
    body: JSON.stringify({
      input: {
        cond_aug: 0.02,
        decoding_t: 14,
        input_image: inputImage,
        video_length: '25_frames_with_svd',
        sizing_strategy: 'maintain_aspect_ratio',
        motion_bucket_id: 127,
        frames_per_second: 6,
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Replicate SVD failed ${createRes.status}: ${errText.slice(0, 200)}`);
  }

  let prediction = (await createRes.json()) as ReplicatePrediction;
  if (prediction.status !== 'succeeded') {
    prediction = await pollPrediction(apiKey, prediction);
  }

  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    throw new Error(prediction.error ?? 'Replicate SVD failed');
  }

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url || typeof url !== 'string') throw new Error('Replicate SVD returned no video URL');
  return url;
}
