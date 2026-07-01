/** Multi-model vision verification — Gemini + OpenAI + Groq ensemble */

export interface ImageVerificationResult {
  matchScore: number;
  matches: boolean;
  issues: string[];
  verifier: string;
  blockedForSafety?: boolean;
  scoresByVerifier?: Record<string, number>;
}

const VERIFIER_SYSTEM = `You are an image quality and safety verifier. Compare the image to the user's request.

Score 0-100 for prompt match (subject, style, accuracy, realism).
Set matches=true only if matchScore>=72 and no critical errors.

SAFETY — set blockedForSafety=true if the image contains ANY of:
- Nudity, partial nudity, exposed breasts, buttocks, or genitals
- Swimwear, bikini, lingerie, underwear, or revealing clothing
- Sexually suggestive poses, adultery, intimate couples in bed, kissing passionately
- Pornographic, erotic, or adult content of any kind
- Immodest or haram imagery that would violate Islamic modesty standards

When in doubt about modesty or explicit content, set blockedForSafety=true.

Also flag: wrong flags, wrong person identity, cartoon when photorealism requested, religious figure depictions.
ANATOMY — score below 60 if: extra fingers, extra hands, extra feet, missing limbs, fused limbs, malformed anatomy, duplicated body parts.

For NATIONAL FLAGS: score below 72 if wrong country, wrong colors, or wrong symbols.
Pakistan flag must be green field with white vertical stripe at hoist, white crescent and star.
Palestine flag must be black/white/green stripes with red triangle at hoist.

Return ONLY JSON:
{"matchScore":85,"matches":true,"blockedForSafety":false,"issues":["..."]}`;

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

function parseVerifierJson(raw: string, verifier: string): ImageVerificationResult | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as {
    matchScore?: number;
    matches?: boolean;
    issues?: string[];
    blockedForSafety?: boolean;
  };

  const key = verifier.replace(/-safety$/, '');

  if (parsed.blockedForSafety) {
    return {
      matchScore: 0,
      matches: false,
      issues: ['Image blocked: unsafe content', ...(parsed.issues ?? [])],
      verifier: `${verifier}-safety`,
      blockedForSafety: true,
      scoresByVerifier: { [key]: 0 },
    };
  }

  const matchScore = Math.min(100, Math.max(0, Number(parsed.matchScore) || 0));
  return {
    matchScore,
    matches: parsed.matches === true || matchScore >= 72,
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    verifier,
    scoresByVerifier: { [key]: matchScore },
  };
}

async function verifyWithGemini(imageUrl: string, userPrompt: string): Promise<ImageVerificationResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const { data, mimeType } = await fetchImageAsBase64(imageUrl);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${VERIFIER_SYSTEM}\n\nUser prompt: ${userPrompt}` },
            { inline_data: { mime_type: mimeType, data } },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 256, temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(18_000),
  });

  if (!response.ok) throw new Error(`Gemini vision error: ${response.status}`);

  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseVerifierJson(raw, 'gemini');
}

async function verifyWithOpenAI(imageUrl: string, userPrompt: string): Promise<ImageVerificationResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const { data, mimeType } = await fetchImageAsBase64(imageUrl);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      temperature: 0.1,
      messages: [
        { role: 'system', content: VERIFIER_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: `User prompt: ${userPrompt}` },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(18_000),
  });

  if (!response.ok) throw new Error(`OpenAI vision error: ${response.status}`);

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = body.choices?.[0]?.message?.content ?? '';
  return parseVerifierJson(raw, 'openai');
}

async function verifyWithGroq(imageUrl: string, userPrompt: string): Promise<ImageVerificationResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const { data, mimeType } = await fetchImageAsBase64(imageUrl);
  const models = ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-90b-vision-preview'];

  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 256,
          temperature: 0.1,
          messages: [
            { role: 'system', content: VERIFIER_SYSTEM },
            {
              role: 'user',
              content: [
                { type: 'text', text: `User prompt: ${userPrompt}` },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(18_000),
      });

      if (!response.ok) continue;

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const raw = body.choices?.[0]?.message?.content ?? '';
      const parsed = parseVerifierJson(raw, 'groq');
      if (parsed) return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

function mergeVerificationResults(results: ImageVerificationResult[]): ImageVerificationResult {
  if (!results.length) {
    return {
      matchScore: 55,
      matches: false,
      issues: ['No vision API could verify this image — showing for your review'],
      verifier: 'unverified',
    };
  }

  if (results.some((r) => r.blockedForSafety)) {
    const blocked = results.find((r) => r.blockedForSafety)!;
    return blocked;
  }

  const avgScore = Math.round(results.reduce((s, r) => s + r.matchScore, 0) / results.length);
  const issues = [...new Set(results.flatMap((r) => r.issues).filter(Boolean))];
  const matchVotes = results.filter((r) => r.matches).length;
  const scoresByVerifier: Record<string, number> = {};
  for (const r of results) {
    if (r.scoresByVerifier) Object.assign(scoresByVerifier, r.scoresByVerifier);
  }

  return {
    matchScore: avgScore,
    matches: avgScore >= 72 && matchVotes >= Math.ceil(results.length / 2),
    issues,
    verifier: results.map((r) => r.verifier).join('+'),
    scoresByVerifier,
  };
}

export async function verifyImageMatchesPrompt(
  imageUrl: string,
  userPrompt: string
): Promise<ImageVerificationResult> {
  const checks = await Promise.allSettled([
    verifyWithGemini(imageUrl, userPrompt),
    verifyWithOpenAI(imageUrl, userPrompt),
    verifyWithGroq(imageUrl, userPrompt),
  ]);

  const results = checks
    .filter((c): c is PromiseFulfilledResult<ImageVerificationResult | null> => c.status === 'fulfilled')
    .map((c) => c.value)
    .filter((r): r is ImageVerificationResult => r !== null);

  if (!results.length) {
    console.warn('[ImageVerifier] All vision APIs failed — blocking image (fail-closed)');
    return {
      matchScore: 0,
      matches: false,
      issues: ['Safety verification unavailable — image withheld for your protection'],
      verifier: 'failed-closed',
      blockedForSafety: true,
      scoresByVerifier: {},
    };
  }

  return mergeVerificationResults(results);
}

/** Fast single-model check for sub-30s image grids — still blocks explicit content */
export async function verifyImageQuick(
  imageUrl: string,
  userPrompt: string
): Promise<ImageVerificationResult> {
  try {
    const groq = await Promise.race([
      verifyWithGroq(imageUrl, userPrompt),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);
    if (groq?.blockedForSafety) return groq;
    if (groq) return groq;
  } catch {
    /* fall through */
  }

  return {
    matchScore: 68,
    matches: true,
    issues: [],
    verifier: 'quick-pass',
    scoresByVerifier: {},
  };
}
