/** Agnes AI — image generation (OpenAI-compatible hub) */

const AGNES_HUB = 'https://apihub.agnes-ai.com/v1';

function getAgnesKey(): string {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) throw new Error('AGNES_API_KEY not configured');
  return apiKey;
}

function parseAgnesImageResponse(data: unknown): string | null {
  const d = data as {
    data?: Array<{ url?: string; b64_json?: string }>;
    url?: string;
    image_url?: string;
    output?: { url?: string };
  };

  const item = d.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (d.url) return d.url;
  if (d.image_url) return d.image_url;
  if (d.output?.url) return d.output.url;
  return null;
}

async function requestAgnes(model: string, prompt: string, size: string): Promise<string> {
  const response = await fetch(`${AGNES_HUB}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAgnesKey()}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      response_format: 'url',
      extra_body: { response_format: 'url' },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Agnes image error ${response.status}: ${body.slice(0, 200)}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('Agnes returned invalid JSON');
  }

  const url = parseAgnesImageResponse(data);
  if (!url) throw new Error('Agnes image returned no URL or base64 data');
  return url;
}

export async function generateAgnesImage(prompt: string, size = '1024x1024'): Promise<string> {
  const models = ['agnes-image-2.1-flash', 'agnes-image-2.0-flash'];
  let lastErr: Error | null = null;

  for (const model of models) {
    try {
      return await requestAgnes(model, prompt, size);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[Agnes] ${model} failed:`, lastErr.message);
    }
  }

  throw lastErr ?? new Error('Agnes image generation failed');
}
