interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

const OFFICIAL_MODELS = [
  'black-forest-labs/flux-schnell',
  'black-forest-labs/flux-1.1-pro',
] as const;

async function pollPrediction(apiKey: string, prediction: ReplicatePrediction): Promise<ReplicatePrediction> {
  for (let i = 0; i < 90; i++) {
    if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
      return prediction;
    }
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollRes.ok) throw new Error(`Replicate poll failed: ${pollRes.status}`);
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }
  throw new Error('Replicate prediction timed out');
}

function extractOutputUrl(prediction: ReplicatePrediction): string {
  if (prediction.status === 'failed' || prediction.status === 'canceled') {
    throw new Error(prediction.error ?? 'Replicate prediction failed');
  }
  if (!prediction.output) throw new Error('Replicate returned empty output');
  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  if (!url || typeof url !== 'string') throw new Error('Replicate output is not a URL');
  return url;
}

async function runOfficialModel(apiKey: string, model: string, prompt: string): Promise<string> {
  const createRes = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: '16:9',
        output_format: 'webp',
        num_outputs: 1,
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Replicate ${model} failed ${createRes.status}: ${errText.slice(0, 200)}`);
  }

  let prediction = (await createRes.json()) as ReplicatePrediction;
  if (prediction.status !== 'succeeded') {
    prediction = await pollPrediction(apiKey, prediction);
  }
  return extractOutputUrl(prediction);
}

async function runLegacyVersion(apiKey: string, prompt: string): Promise<string> {
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      version: 'black-forest-labs/flux-schnell',
      input: { prompt, aspect_ratio: '16:9', output_format: 'webp' },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Replicate legacy create failed: ${createRes.status}`);
  }

  const prediction = await pollPrediction(apiKey, (await createRes.json()) as ReplicatePrediction);
  return extractOutputUrl(prediction);
}

export async function generateImageFlux(prompt: string): Promise<string> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) throw new Error('REPLICATE_API_TOKEN not configured');

  let lastErr: Error | null = null;
  for (const model of OFFICIAL_MODELS) {
    try {
      return await runOfficialModel(apiKey, model, prompt);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[Replicate] ${model} failed:`, lastErr.message);
    }
  }

  try {
    return await runLegacyVersion(apiKey, prompt);
  } catch (err) {
    throw lastErr ?? (err as Error);
  }
}
