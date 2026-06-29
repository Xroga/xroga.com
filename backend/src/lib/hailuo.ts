/** Hailuo / MiniMax — fast draft image generation */

interface MiniMaxImageResponse {
  data?: { image_urls?: string[]; image_base64?: string[] };
  base_resp?: { status_code: number; status_msg?: string };
}

function getHailuoKey(): string {
  const key = process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY;
  if (!key) throw new Error('HAILUO_API_KEY not configured');
  return key;
}

export async function generateHailuoImage(prompt: string): Promise<string> {
  const apiKey = getHailuoKey();
  const base = process.env.MINIMAX_API_BASE ?? 'https://api.minimax.io';

  const response = await fetch(`${base}/v1/image_generation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'image-01',
      prompt,
      aspect_ratio: '16:9',
      response_format: 'url',
      n: 1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hailuo/MiniMax image error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as MiniMaxImageResponse;
  if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
    throw new Error(data.base_resp.status_msg ?? 'Hailuo image generation failed');
  }

  const url = data.data?.image_urls?.[0];
  if (url) return url;

  const b64 = data.data?.image_base64?.[0];
  if (b64) return `data:image/jpeg;base64,${b64}`;

  throw new Error('Hailuo returned no image data');
}
