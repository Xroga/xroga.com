interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

const FLUX_MODEL =
  'black-forest-labs/flux-1.1-pro' as const;

export async function generateImageFlux(prompt: string): Promise<string> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: FLUX_MODEL,
      input: { prompt, aspect_ratio: '16:9', output_format: 'webp' },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Replicate create failed: ${createRes.status}`);
  }

  let prediction = (await createRes.json()) as ReplicatePrediction;

  for (let i = 0; i < 60; i++) {
    if (prediction.status === 'succeeded') break;
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(prediction.error ?? 'Replicate prediction failed');
    }

    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }

  if (prediction.status !== 'succeeded' || !prediction.output) {
    throw new Error('Replicate prediction timed out');
  }

  const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  return url;
}
