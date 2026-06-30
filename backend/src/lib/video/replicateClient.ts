/**
 * Shared Replicate prediction runner — no Prefer header (avoids 422 on wait>60).
 * Creates async prediction and polls until complete.
 */

import { getSecret } from '../../config/envSecrets.js';

export interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

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

function parseRetryAfterMs(errText: string, status: number): number {
  if (status !== 429) return 0;
  try {
    const parsed = JSON.parse(errText) as { retry_after?: number };
    if (typeof parsed.retry_after === 'number' && parsed.retry_after > 0) {
      return Math.min(parsed.retry_after * 1000 + 500, 15_000);
    }
  } catch {
    /* ignore */
  }
  return 5000;
}

export async function runReplicateModel(
  modelPath: string,
  input: Record<string, unknown>,
  label: string
): Promise<string> {
  const apiKey = getSecret('REPLICATE_API_TOKEN');
  if (!apiKey) throw new Error('REPLICATE_API_TOKEN not configured');

  let createRes: Response | null = null;
  let errText = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    createRes = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(30_000),
    });

    if (createRes.ok) break;

    errText = await createRes.text();
    const waitMs = parseRetryAfterMs(errText, createRes.status);
    if (createRes.status === 429 && attempt < 3 && waitMs > 0) {
      console.warn(`[Replicate] ${label} rate limited — retry in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`${label} failed ${createRes.status}: ${errText.slice(0, 250)}`);
  }

  if (!createRes?.ok) {
    throw new Error(`${label} failed ${createRes?.status ?? 0}: ${errText.slice(0, 250)}`);
  }

  let prediction = (await createRes.json()) as ReplicatePrediction;
  if (prediction.status !== 'succeeded') {
    prediction = await pollPrediction(apiKey, prediction);
  }
  return extractOutputUrl(prediction, label);
}
