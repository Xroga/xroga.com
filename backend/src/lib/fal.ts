/** Fal.ai image generation — SDXL / Flux schnell fallback */

export async function generateFalImage(prompt: string): Promise<string> {
  const apiKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!apiKey) throw new Error('FAL_KEY not configured');

  const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: 'landscape_4_3',
      num_inference_steps: 4,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Fal.ai image error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await response.json()) as { images?: Array<{ url?: string }> };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error('Fal.ai returned no image URL');
  return url;
}
