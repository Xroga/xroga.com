/** Google Gemini native image generation (Nano Banana / flash-image models) */

interface GeminiImagePart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface GeminiImageResponse {
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>;
}

/** Free-tier friendly models first, then newer previews */
const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-3.1-flash-image-preview',
] as const;

export async function generateGeminiImage(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  let lastErr: Error | null = null;

  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini image ${model} ${response.status}: ${errText.slice(0, 250)}`);
      }

      const data = (await response.json()) as GeminiImageResponse;
      const parts = data.candidates?.[0]?.content?.parts ?? [];

      for (const part of parts) {
        const inline = part.inlineData ?? part.inline_data;
        if (inline?.data) {
          const mime =
            ('mimeType' in inline && inline.mimeType) ||
            ('mime_type' in inline && inline.mime_type) ||
            'image/png';
          return `data:${mime};base64,${inline.data}`;
        }
      }

      throw new Error(`Gemini ${model} returned no image in response`);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[GeminiImage] ${model} failed:`, lastErr.message);
    }
  }

  throw lastErr ?? new Error('Gemini image generation failed on all models');
}
