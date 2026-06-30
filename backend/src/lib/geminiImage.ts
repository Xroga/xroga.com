/** Google Gemini native image generation (Nano Banana / flash-image models) */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiImagePart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>;
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
}

interface InteractionContentBlock {
  type?: string;
  data?: string;
  mime_type?: string;
  mimeType?: string;
  text?: string;
}

interface InteractionStep {
  type?: string;
  content?: InteractionContentBlock[];
}

interface InteractionResponse {
  status?: string;
  output_image?: InteractionContentBlock;
  steps?: InteractionStep[];
  outputs?: InteractionContentBlock[];
}

type ImageAttempt = {
  label: string;
  run: (prompt: string, timeoutMs: number) => Promise<string>;
};

const INTERACTION_MODELS = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image'] as const;
const GENERATE_CONTENT_MODELS = ['gemini-2.5-flash-image'] as const;

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  return apiKey;
}

function geminiHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

function toDataUrl(mime: string | undefined, data: string): string {
  const safeMime = mime?.trim() || 'image/png';
  return `data:${safeMime};base64,${data}`;
}

function extractImageFromInteraction(data: InteractionResponse): string | null {
  const output = data.output_image;
  if (output?.data) {
    return toDataUrl(output.mime_type ?? output.mimeType, output.data);
  }

  for (const block of data.outputs ?? []) {
    if (block.type === 'image' && block.data) {
      return toDataUrl(block.mime_type ?? block.mimeType, block.data);
    }
  }

  for (const step of data.steps ?? []) {
    if (step.type !== 'model_output') continue;
    for (const block of step.content ?? []) {
      if (block.type === 'image' && block.data) {
        return toDataUrl(block.mime_type ?? block.mimeType, block.data);
      }
    }
  }

  return null;
}

function extractImageFromGenerateContent(data: GeminiGenerateContentResponse): string | null {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    if (inline?.data) {
      const mime =
        ('mimeType' in inline && inline.mimeType) ||
        ('mime_type' in inline && inline.mime_type) ||
        'image/png';
      return toDataUrl(mime, inline.data);
    }
  }
  return null;
}

function formatApiError(status: number, body: string): string {
  const trimmed = body.replace(/\s+/g, ' ').trim().slice(0, 320);
  return trimmed ? `HTTP ${status}: ${trimmed}` : `HTTP ${status}`;
}

async function callInteractionsApi(
  model: string,
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const apiKey = getApiKey();
  const response = await fetch(`${GEMINI_BASE}/interactions`, {
    method: 'POST',
    headers: geminiHeaders(apiKey),
    body: JSON.stringify({
      model,
      input: prompt.slice(0, 900),
      response_format: { type: 'image', aspect_ratio: '1:1' },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Interactions ${model} ${formatApiError(response.status, raw)}`);
  }

  let data: InteractionResponse;
  try {
    data = JSON.parse(raw) as InteractionResponse;
  } catch {
    throw new Error(`Interactions ${model} returned invalid JSON`);
  }

  if (data.status && data.status !== 'completed' && data.status !== 'in_progress') {
    throw new Error(`Interactions ${model} status: ${data.status}`);
  }

  const imageUrl = extractImageFromInteraction(data);
  if (!imageUrl) {
    throw new Error(`Interactions ${model} returned no image`);
  }

  return imageUrl;
}

async function callGenerateContentApi(
  model: string,
  prompt: string,
  timeoutMs: number
): Promise<string> {
  const apiKey = getApiKey();
  const response = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: geminiHeaders(apiKey),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt.slice(0, 900) }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`generateContent ${model} ${formatApiError(response.status, raw)}`);
  }

  let data: GeminiGenerateContentResponse;
  try {
    data = JSON.parse(raw) as GeminiGenerateContentResponse;
  } catch {
    throw new Error(`generateContent ${model} returned invalid JSON`);
  }

  const blocked = data.promptFeedback?.blockReason;
  if (blocked) {
    const detail = data.promptFeedback?.blockReasonMessage?.trim();
    throw new Error(
      detail ? `blocked: ${blocked}` : `blocked: ${blocked}`
    );
  }

  const imageUrl = extractImageFromGenerateContent(data);
  if (!imageUrl) {
    throw new Error(`generateContent ${model} returned no image`);
  }

  return imageUrl;
}

export async function generateGeminiImage(prompt: string): Promise<string> {
  const attempts: ImageAttempt[] = [
    ...INTERACTION_MODELS.map(
      (model): ImageAttempt => ({
        label: `interactions:${model}`,
        run: (p, timeoutMs) => callInteractionsApi(model, p, timeoutMs),
      })
    ),
    ...GENERATE_CONTENT_MODELS.map(
      (model): ImageAttempt => ({
        label: `generateContent:${model}`,
        run: (p, timeoutMs) => callGenerateContentApi(model, p, timeoutMs),
      })
    ),
  ];

  const started = Date.now();
  const totalBudgetMs = 34_000;
  let lastErr: Error | null = null;

  for (const attempt of attempts) {
    const elapsed = Date.now() - started;
    const remaining = totalBudgetMs - elapsed;
    if (remaining < 5_000) break;

    const timeoutMs = Math.min(remaining, 28_000);

    try {
      return await attempt.run(prompt, timeoutMs);
    } catch (err) {
      lastErr = err as Error;
      console.warn(`[GeminiImage] ${attempt.label} failed:`, lastErr.message);
    }
  }

  throw lastErr ?? new Error('Gemini image generation failed on all models');
}
