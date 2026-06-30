/**
 * OSS video models via Replicate — MiniMax, Wan, CogVideoX workhorse tier.
 */

import { getSecret } from '../../config/envSecrets.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

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
    await new Promise((r) => setTimeout(r, 4000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`Replicate poll failed: ${pollRes.status}`);
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }
  throw new Error('Replicate OSS video timed out');
}

async function runReplicateModel(
  modelPath: string,
  input: Record<string, unknown>,
  label: string
): Promise<string> {
  const apiKey = getSecret('REPLICATE_API_TOKEN');
  if (!apiKey) throw new Error('REPLICATE_API_TOKEN not configured');

  const createRes = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      Prefer: 'wait=90',
    },
    body: JSON.stringify({ input }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`${label} failed ${createRes.status}: ${errText.slice(0, 200)}`);
  }

  let prediction = (await createRes.json()) as ReplicatePrediction;
  if (prediction.status !== 'succeeded') {
    prediction = await pollPrediction(apiKey, prediction);
  }

  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    throw new Error(prediction.error ?? `${label} failed`);
  }

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url || typeof url !== 'string') throw new Error(`${label} returned no video URL`);
  return url;
}

/** MiniMax video-01 via Replicate — reliable text-to-video */
export async function generateMinimaxReplicateVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel('minimax/video-01', { prompt: cleanPrompt.slice(0, 2000) }, 'MiniMax-Replicate');
}

/** Wan 2.1 text-to-video — fast OSS workhorse */
export async function generateWanReplicateVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'wavespeedai/wan-2.1-t2v-480p',
    { prompt: cleanPrompt.slice(0, 1000) },
    'Wan-2.1'
  );
}

/** CogVideoX text-to-video */
export async function generateCogVideoX(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'thudm/cogvideox-2b',
    {
      prompt: cleanPrompt.slice(0, 1000),
      num_inference_steps: 30,
      guidance_scale: 7,
    },
    'CogVideoX'
  );
}

/** AnimateDiff — OSS motion from prompt */
export async function generateAnimateDiff(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'lucataco/animate-diff',
    {
      prompt: cleanPrompt.slice(0, 800),
      n_prompt: 'blurry, low quality, extra limbs, warping',
      num_inference_steps: 25,
    },
    'AnimateDiff'
  );
}
