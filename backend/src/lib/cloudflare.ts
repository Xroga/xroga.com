interface CloudflareImageResult {
  result?: { image?: string };
  success?: boolean;
  errors?: Array<{ message: string }>;
}

function isPngBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}

function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

function isWebpBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  );
}

function isBinaryImage(buf: Buffer, contentType?: string | null): boolean {
  if (contentType?.includes('image/')) return true;
  return isPngBuffer(buf) || isJpegBuffer(buf) || isWebpBuffer(buf);
}

function bufferToDataUrl(buf: Buffer, contentType?: string | null): string {
  if (contentType?.includes('image/')) {
    const mime = contentType.split(';')[0].trim();
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  if (isJpegBuffer(buf)) return `data:image/jpeg;base64,${buf.toString('base64')}`;
  if (isWebpBuffer(buf)) return `data:image/webp;base64,${buf.toString('base64')}`;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

const CF_MODELS = [
  '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  '@cf/bytedance/stable-diffusion-xl-lightning',
] as const;

async function runCloudflareModel(accountId: string, apiToken: string, model: string, prompt: string): Promise<string> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 900) }),
      signal: AbortSignal.timeout(90_000),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Cloudflare AI ${model} error ${response.status}: ${errText.slice(0, 240)}`);
  }

  const contentType = response.headers.get('content-type');
  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length < 64) {
    throw new Error(`Cloudflare ${model} returned empty or tiny response (${buffer.length} bytes)`);
  }

  if (isBinaryImage(buffer, contentType)) {
    return bufferToDataUrl(buffer, contentType);
  }

  // JSON envelope — only parse when payload looks like JSON
  if (buffer[0] === 0x7b) {
    const text = buffer.toString('utf8');
    const data = JSON.parse(text) as CloudflareImageResult;
    if (data.result?.image) {
      const b64 = data.result.image;
      return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
    }
    throw new Error(data.errors?.[0]?.message ?? `Cloudflare ${model} JSON had no image`);
  }

  throw new Error(`Cloudflare ${model} returned unrecognized payload (${buffer.length} bytes)`);
}

export async function generateImageCloudflare(prompt: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Workers AI credentials not configured');
  }

  let lastErr: Error | null = null;
  for (const model of CF_MODELS) {
    try {
      return await runCloudflareModel(accountId, apiToken, model, prompt);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[Cloudflare] ${model} failed:`, lastErr.message);
    }
  }

  throw lastErr ?? new Error('Cloudflare image generation failed');
}
