import OpenAI from 'openai';
import { openaiImageSize, type ImageProviderOptions } from './imageAspect.js';

export async function generateOpenAIImage(prompt: string, options?: ImageProviderOptions): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const size = openaiImageSize(options?.aspectFormat);
  const client = new OpenAI({ apiKey });
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt: prompt.slice(0, 3900),
    n: 1,
    size,
    quality: 'standard',
    response_format: 'url',
  });

  const url = response.data?.[0]?.url;
  if (!url) throw new Error('OpenAI DALL-E returned no image URL');
  return url;
}
