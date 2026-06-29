/** Agnes AI — image + video generation (OpenAI-compatible hub) */

const AGNES_HUB = 'https://apihub.agnes-ai.com/v1';

function getAgnesKey(): string {
  const apiKey = process.env.AGNES_API_KEY;
  if (!apiKey) throw new Error('AGNES_API_KEY not configured');
  return apiKey;
}

export async function generateAgnesImage(prompt: string, size = '1024x1024'): Promise<string> {
  const response = await fetch(`${AGNES_HUB}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAgnesKey()}`,
    },
    body: JSON.stringify({
      model: 'agnes-image-2.1-flash',
      prompt,
      size,
      extra_body: { response_format: 'url' },
    }),
  });

  if (!response.ok) {
    throw new Error(`Agnes image error: ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
    url?: string;
  };

  const url = data.data?.[0]?.url ?? data.url;
  if (!url) throw new Error('Agnes image returned no URL');
  return url;
}
