/** ComfyUI local fallback — zero-cost open-source image generation */

interface ComfyGenerateResponse {
  image?: string;
  url?: string;
  images?: string[];
}

/**
 * Expects COMFYUI_URL pointing to either:
 * - A simple wrapper exposing POST /api/generate { prompt, model }
 * - Or a ComfyUI instance with the standard /prompt queue API
 */
export async function generateComfyUIImage(prompt: string): Promise<string> {
  const baseUrl = process.env.COMFYUI_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('COMFYUI_URL not configured');

  // Simple wrapper endpoint (recommended for Fly.io sidecar)
  try {
    const simpleRes = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: 'sdxl', width: 1024, height: 768 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (simpleRes.ok) {
      const data = (await simpleRes.json()) as ComfyGenerateResponse;
      if (data.url) return data.url;
      if (data.image) {
        return data.image.startsWith('data:') ? data.image : `data:image/png;base64,${data.image}`;
      }
      if (data.images?.[0]) return data.images[0];
    }
  } catch {
    /* try native ComfyUI queue */
  }

  // Native ComfyUI: minimal txt2img via external API bridge
  const bridgeRes = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, negative_prompt: 'blurry, low quality', steps: 20 }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!bridgeRes.ok) {
    throw new Error(`ComfyUI error: ${bridgeRes.status}`);
  }

  const data = (await bridgeRes.json()) as ComfyGenerateResponse;
  if (data.url) return data.url;
  if (data.image) {
    return data.image.startsWith('data:') ? data.image : `data:image/png;base64,${data.image}`;
  }

  throw new Error('ComfyUI returned no image');
}
