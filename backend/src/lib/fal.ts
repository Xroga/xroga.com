/** Fal.ai image generation — Flux schnell (primary) */

const FAL_ENDPOINTS = [
  'https://fal.run/fal-ai/flux/schnell',
  'https://queue.fal.run/fal-ai/flux/schnell',
] as const;

export async function generateFalImage(prompt: string): Promise<string> {
  const apiKey = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
  if (!apiKey) throw new Error('FAL_KEY not configured');

  let lastErr: Error | null = null;

  for (const endpoint of FAL_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          image_size: 'landscape_4_3',
          num_inference_steps: 4,
          enable_safety_checker: true,
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Fal.ai ${response.status}: ${errText.slice(0, 300)}`);
      }

      const data = (await response.json()) as {
        images?: Array<{ url?: string }>;
        image?: { url?: string };
        output?: { images?: Array<{ url?: string }> };
      };

      const url =
        data.images?.[0]?.url ??
        data.image?.url ??
        data.output?.images?.[0]?.url;

      if (!url) throw new Error('Fal.ai returned no image URL');
      return url;
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[Fal] ${endpoint} failed:`, lastErr.message);
    }
  }

  throw lastErr ?? new Error('Fal.ai image generation failed');
}
