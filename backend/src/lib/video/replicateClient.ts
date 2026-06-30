/**
 * Shared Replicate prediction runner — Prefer: wait max is 60 seconds.
 */

import { getSecret } from '../../config/envSecrets.js';

export interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

const REPLICATE_WAIT_SEC = 60;

async function pollPrediction(apiKey: string, prediction: ReplicatePrediction): Promise<ReplicatePrediction> {
  for (let i = 0; i < 120; i++) {
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
  throw new Error('Replicate prediction timed out');
}

function extractOutputUrl(prediction: ReplicatePrediction, label: string): string {
  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    throw new Error(prediction.error ?? `${label} failed`);
  }
  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url || typeof url !== 'string') throw new Error(`${label} returned no video URL`);
  return url;
}

export async function runReplicateModel(
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
      Prefer: `wait=${REPLICATE_WAIT_SEC}`,
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(130_000),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`${label} failed ${createRes.status}: ${errText.slice(0, 250)}`);
  }

  let prediction = (await createRes.json()) as ReplicatePrediction;
  if (prediction.status !== 'succeeded') {
    prediction = await pollPrediction(apiKey, prediction);
  }
  return extractOutputUrl(prediction, label);
}
