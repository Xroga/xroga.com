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

function bufferToDataUrl(buf: Buffer, contentType?: string | null): string {
  if (contentType?.includes('image/')) {
    const mime = contentType.split(';')[0].trim();
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  if (isPngBuffer(buf)) return `data:image/png;base64,${buf.toString('base64')}`;
  if (isJpegBuffer(buf)) return `data:image/jpeg;base64,${buf.toString('base64')}`;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function generateImageCloudflare(prompt: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Workers AI credentials not configured');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 900) }),
      signal: AbortSignal.timeout(60_000),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Cloudflare AI error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const contentType = response.headers.get('content-type');
  const buffer = Buffer.from(await response.arrayBuffer());

  // Workers AI often returns raw PNG bytes instead of JSON
  if (contentType?.includes('image/') || isPngBuffer(buffer) || isJpegBuffer(buffer)) {
    return bufferToDataUrl(buffer, contentType);
  }

  const text = buffer.toString('utf8');
  try {
    const data = JSON.parse(text) as CloudflareImageResult;
    if (data.result?.image) {
      const b64 = data.result.image;
      return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
    }
    throw new Error(data.errors?.[0]?.message ?? 'Cloudflare returned no image in JSON');
  } catch (err) {
    if (isPngBuffer(buffer) || isJpegBuffer(buffer)) {
      return bufferToDataUrl(buffer, contentType);
    }
    if (err instanceof SyntaxError) {
      throw new Error('Cloudflare returned non-JSON binary — could not parse image');
    }
    throw err;
  }
}
