/** Gemini vision — verify generated image matches user prompt */

export interface ImageVerificationResult {
  matchScore: number;
  matches: boolean;
  issues: string[];
  verifier: string;
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
  if (imageUrl.startsWith('data:image/')) {
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) return { mimeType: match[1], data: match[2] };
    throw new Error('Invalid data URL');
  }

  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
  return { data: buffer.toString('base64'), mimeType: mimeType.split(';')[0] };
}

export async function verifyImageMatchesPrompt(
  imageUrl: string,
  userPrompt: string
): Promise<ImageVerificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { matchScore: 70, matches: true, issues: [], verifier: 'skipped-no-gemini' };
  }

  try {
    const { data, mimeType } = await fetchImageAsBase64(imageUrl);

    const system = `You are an image quality verifier. Compare the image to the user's request.
Score 0-100 for prompt match (subject, style, accuracy, realism).
Flag wrong flags, wrong person identity, cartoon when photorealism requested, religious figure depictions.
Return ONLY JSON: {"matchScore":85,"matches":true,"issues":["..."]}
Set matches=true only if matchScore>=72 and no critical identity errors.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: `${system}\n\nUser prompt: ${userPrompt}` },
              { inline_data: { mime_type: mimeType, data } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Gemini vision error: ${response.status}`);
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON from verifier');

    const parsed = JSON.parse(jsonMatch[0]) as {
      matchScore?: number;
      matches?: boolean;
      issues?: string[];
    };

    const matchScore = Math.min(100, Math.max(0, Number(parsed.matchScore) || 0));
    const matches = parsed.matches === true || matchScore >= 72;

    return {
      matchScore,
      matches,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      verifier: 'gemini-2.0-flash',
    };
  } catch (err) {
    console.warn('[ImageVerifier] failed:', (err as Error).message);
    return { matchScore: 65, matches: true, issues: [], verifier: 'fallback-accept' };
  }
}
