/**
 * OSS video models via Replicate — CogVideoX, AnimateDiff (80% workhorse tier).
 */

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
  const apiKey = process.env.REPLICATE_API_TOKEN;
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

/** CogVideoX text-to-video — free-tier OSS workhorse */
export async function generateCogVideoX(prompt: string, _durationSeconds = 5): Promise<string> {
  return runReplicateModel(
    'lucataco/cogvideox-5b',
    {
      prompt: prompt.slice(0, 1000),
      num_inference_steps: 30,
      guidance_scale: 7,
    },
    'CogVideoX'
  );
}

/** AnimateDiff — OSS motion from prompt */
export async function generateAnimateDiff(prompt: string, _durationSeconds = 5): Promise<string> {
  return runReplicateModel(
    'lucataco/animate-diff',
    {
      prompt: prompt.slice(0, 800),
      n_prompt: 'blurry, low quality, extra limbs, warping',
      num_inference_steps: 25,
    },
    'AnimateDiff'
  );
}
