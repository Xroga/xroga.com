/** Fal.ai image generation — Flux schnell (sync) with dev fallback */

const FAL_MODELS = [
  { endpoint: 'https://fal.run/fal-ai/flux/schnell', body: { num_inference_steps: 4 } },
  { endpoint: 'https://fal.run/fal-ai/flux/dev', body: { num_inference_steps: 28, guidance_scale: 3.5 } },
] as const;

export async function generateFalImage(prompt: string): Promise<string> {
  const apiKey = (process.env.FAL_KEY ?? process.env.FAL_API_KEY)?.trim();
  if (!apiKey) throw new Error('FAL_KEY not configured');

  let lastErr: Error | null = null;

  for (const { endpoint, body } of FAL_MODELS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.slice(0, 900),
          image_size: 'square_hd',
          num_images: 1,
          enable_safety_checker: false,
          ...body,
        }),
        signal: AbortSignal.timeout(55_000),
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`Fal.ai ${response.status}: ${raw.slice(0, 300)}`);
      }

      let data: {
        images?: Array<{ url?: string }>;
        image?: { url?: string };
        output?: { images?: Array<{ url?: string }> };
      };
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        throw new Error(`Fal.ai invalid JSON: ${raw.slice(0, 120)}`);
      }

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
