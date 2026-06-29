/** Fal.ai image-to-image — style transfer from a source photo */

const FAL_IMG2IMG = 'https://fal.run/fal-ai/flux/dev/image-to-image';

export async function generateFalStyleTransfer(
  sourceImageUrl: string,
  prompt: string,
  strength = 0.72
): Promise<string> {
  const apiKey = (process.env.FAL_KEY ?? process.env.FAL_API_KEY)?.trim();
  if (!apiKey) throw new Error('FAL_KEY not configured');

  const response = await fetch(FAL_IMG2IMG, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_url: sourceImageUrl,
      prompt,
      strength,
      num_inference_steps: 28,
      enable_safety_checker: true,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Fal style transfer ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    images?: Array<{ url?: string }>;
    image?: { url?: string };
  };

  const url = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error('Fal style transfer returned no image URL');
  return url;
}
