/** ComfyUI local video fallback via AnimateDiff / SVD bridge */

export async function generateComfyUIVideo(prompt: string, durationSeconds = 5): Promise<string> {
  const baseUrl = process.env.COMFYUI_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('COMFYUI_URL not configured');

  const res = await fetch(`${baseUrl}/api/generate-video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, duration: durationSeconds, fps: 24 }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    throw new Error(`ComfyUI video error: ${res.status}`);
  }

  const data = (await res.json()) as { url?: string; video?: string };
  if (data.url) return data.url;
  if (data.video) {
    return data.video.startsWith('http') ? data.video : `data:video/mp4;base64,${data.video}`;
  }

  throw new Error('ComfyUI returned no video URL');
}
