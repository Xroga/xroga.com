/** Luma AI Dream Machine — premium cinematic image generation */

interface LumaGeneration {
  id: string;
  state: 'queued' | 'dreaming' | 'completed' | 'failed';
  failure_reason?: string;
  assets?: { image?: string };
}

const BASE = 'https://api.lumalabs.ai/dream-machine/v1';

function getLumaKey(): string {
  const key = process.env.LUMA_API_KEY;
  if (!key) throw new Error('LUMA_API_KEY not configured');
  return key;
}

async function pollGeneration(id: string, apiKey: string): Promise<LumaGeneration> {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${BASE}/generations/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Luma poll error: ${res.status}`);
    const gen = (await res.json()) as LumaGeneration;
    if (gen.state === 'completed' || gen.state === 'failed') return gen;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Luma image generation timed out');
}

export async function generateLumaImage(prompt: string): Promise<string> {
  const apiKey = getLumaKey();

  const createRes = await fetch(`${BASE}/generations/image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '16:9',
      model: 'photon-1',
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Luma image error ${createRes.status}: ${errText.slice(0, 200)}`);
  }

  let gen = (await createRes.json()) as LumaGeneration;
  if (gen.state !== 'completed') {
    gen = await pollGeneration(gen.id, apiKey);
  }

  if (gen.state === 'failed') {
    throw new Error(gen.failure_reason ?? 'Luma image generation failed');
  }

  const url = gen.assets?.image;
  if (!url) throw new Error('Luma returned no image URL');
  return url;
}
