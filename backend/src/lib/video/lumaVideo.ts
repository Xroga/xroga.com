/** Luma Dream Machine — premium cinematic video */

interface LumaGeneration {
  id: string;
  state: 'queued' | 'dreaming' | 'completed' | 'failed';
  failure_reason?: string;
  assets?: { video?: string };
}

const BASE = 'https://api.lumalabs.ai/dream-machine/v1';

async function pollGeneration(id: string, apiKey: string): Promise<LumaGeneration> {
  for (let i = 0; i < 80; i++) {
    const res = await fetch(`${BASE}/generations/${id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Luma poll error: ${res.status}`);
    const gen = (await res.json()) as LumaGeneration;
    if (gen.state === 'completed' || gen.state === 'failed') return gen;
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error('Luma video generation timed out');
}

export async function generateLumaVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const apiKey = process.env.LUMA_API_KEY;
  if (!apiKey) throw new Error('LUMA_API_KEY not configured');

  const createRes = await fetch(`${BASE}/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: '16:9',
      loop: false,
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Luma video error ${createRes.status}: ${errText.slice(0, 200)}`);
  }

  let gen = (await createRes.json()) as LumaGeneration;
  if (gen.state !== 'completed') {
    gen = await pollGeneration(gen.id, apiKey);
  }

  if (gen.state === 'failed') {
    throw new Error(gen.failure_reason ?? 'Luma video generation failed');
  }

  const url = gen.assets?.video;
  if (!url) throw new Error('Luma returned no video URL');
  return url;
}
