/** Free image generation — no API keys (Pollinations.ai) */

export async function generatePollinationsImage(
  prompt: string,
  options?: { vertical?: boolean }
): Promise<string> {
  const vertical = options?.vertical ?? false;
  const w = vertical ? 720 : 1280;
  const h = vertical ? 1280 : 720;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 500))}?width=${w}&height=${h}&nologo=true&seed=${Date.now() % 99999}`;

  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Pollinations image failed: ${res.status}`);

  const finalUrl = res.url || url;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Pollinations did not return an image');
  }

  return finalUrl;
}
