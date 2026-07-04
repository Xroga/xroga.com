import { getSecret } from '../config/envSecrets.js';

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export async function geminiGenerate(
  systemPrompt: string,
  userPrompt: string,
  options?: { model?: string; maxTokens?: number; apiKey?: string }
): Promise<string> {
  const apiKey = options?.apiKey ?? getSecret('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const model = options?.model ?? 'gemini-1.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { maxOutputTokens: options?.maxTokens ?? 8192, temperature: 0.4 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function geminiFactCheck(claims: string[], sources: string[]): Promise<string> {
  return geminiGenerate(
    'You are a fact-checker. Verify claims against sources. Return JSON: {"verified":bool,"issues":[]}',
    `Claims:\n${claims.join('\n')}\n\nSources:\n${sources.slice(0, 20).join('\n---\n')}`,
    { model: 'gemini-2.0-flash', maxTokens: 2048 }
  );
}
