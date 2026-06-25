interface CloudflareImageResult {
  result?: { image?: string };
  success: boolean;
  errors?: Array<{ message: string }>;
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
      body: JSON.stringify({ prompt }),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudflare AI error: ${response.status}`);
  }

  const data = (await response.json()) as CloudflareImageResult;
  if (!data.success || !data.result?.image) {
    throw new Error(data.errors?.[0]?.message ?? 'Cloudflare image generation failed');
  }

  return `data:image/png;base64,${data.result.image}`;
}
