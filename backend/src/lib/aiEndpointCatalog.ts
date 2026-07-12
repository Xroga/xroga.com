/**
 * Curated free + paid AI/API endpoints for generated code.
 * Injected into build brief so users get working integrations with clear cost guidance.
 */

export interface AiEndpointOption {
  id: string;
  name: string;
  category: 'llm' | 'image' | 'speech' | 'search' | 'embedding';
  /** No API key required (local, public demo, or browser-only) */
  freeTier: boolean;
  requiresApiKey: boolean;
  endpoint: string;
  signupUrl?: string;
  notes: string;
  /** Shown in build output / instructions */
  userGuidance: string;
}

export const AI_ENDPOINT_CATALOG: AiEndpointOption[] = [
  {
    id: 'ollama-local',
    name: 'Ollama (local)',
    category: 'llm',
    freeTier: true,
    requiresApiKey: false,
    endpoint: 'http://localhost:11434/api/generate',
    notes: 'Runs on user machine — no cloud key',
    userGuidance: 'Free — install Ollama locally. No API key. Great for dev demos.',
  },
  {
    id: 'huggingface-inference-free',
    name: 'Hugging Face Inference (free tier)',
    category: 'llm',
    freeTier: true,
    requiresApiKey: true,
    endpoint: 'https://api-inference.huggingface.co/models/{model}',
    signupUrl: 'https://huggingface.co/settings/tokens',
    notes: 'Free tier with rate limits',
    userGuidance:
      'Free tier available — create a Hugging Face token (Settings → Access Tokens). Paid tiers unlock higher limits.',
  },
  {
    id: 'groq-free',
    name: 'Groq Cloud',
    category: 'llm',
    freeTier: true,
    requiresApiKey: true,
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    signupUrl: 'https://console.groq.com/keys',
    notes: 'Generous free tier for fast inference',
    userGuidance: 'Free tier — sign up at console.groq.com and paste your API key in .env as GROQ_API_KEY.',
  },
  {
    id: 'openrouter-free-models',
    name: 'OpenRouter (free model routes)',
    category: 'llm',
    freeTier: true,
    requiresApiKey: true,
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    signupUrl: 'https://openrouter.ai/settings/keys',
    notes: 'Some models marked :free',
    userGuidance:
      'Mix of free and paid models — create key at openrouter.ai. Use models tagged :free for no cost; paid models show pricing before use.',
  },
  {
    id: 'deepseek-api',
    name: 'DeepSeek API',
    category: 'llm',
    freeTier: false,
    requiresApiKey: true,
    endpoint: 'https://api.deepseek.com/chat/completions',
    signupUrl: 'https://platform.deepseek.com/api_keys',
    notes: 'Low-cost paid API',
    userGuidance: 'Paid (low cost) — create API key at platform.deepseek.com. Add DEEPSEEK_API_KEY to .env.',
  },
  {
    id: 'anthropic-api',
    name: 'Anthropic Claude',
    category: 'llm',
    freeTier: false,
    requiresApiKey: true,
    endpoint: 'https://api.anthropic.com/v1/messages',
    signupUrl: 'https://console.anthropic.com/settings/keys',
    notes: 'Paid — trial credits may apply',
    userGuidance: 'Paid — create key at console.anthropic.com. Trial credits may cover early usage.',
  },
  {
    id: 'pollinations-image',
    name: 'Pollinations.ai (image, no key)',
    category: 'image',
    freeTier: true,
    requiresApiKey: false,
    endpoint: 'https://image.pollinations.ai/prompt/{encoded_prompt}',
    notes: 'Public image URL — no auth',
    userGuidance: 'Free — no API key. Use URL with encoded prompt for demo images in UI.',
  },
  {
    id: 'web-speech-api',
    name: 'Web Speech API (browser)',
    category: 'speech',
    freeTier: true,
    requiresApiKey: false,
    endpoint: 'window.speechSynthesis / SpeechRecognition',
    notes: 'Built into modern browsers',
    userGuidance: 'Free — built into Chrome/Edge/Safari. No backend key required for voice demos.',
  },
];

export function detectAiIntegrationNeeds(prompt: string): AiEndpointOption[] {
  const t = prompt.toLowerCase();
  const picks: AiEndpointOption[] = [];
  const wantLlm = /\b(ai|chatbot|llm|gpt|assistant|agent|openai|claude|deepseek|grok)\b/.test(t);
  const wantImage = /\b(image gen|generate image|dall|stable diffusion|midjourney|picture)\b/.test(t);
  const wantVoice = /\b(voice|speech|tts|talk|audio)\b/.test(t);

  if (wantLlm) {
    picks.push(
      AI_ENDPOINT_CATALOG.find((e) => e.id === 'ollama-local')!,
      AI_ENDPOINT_CATALOG.find((e) => e.id === 'groq-free')!,
      AI_ENDPOINT_CATALOG.find((e) => e.id === 'openrouter-free-models')!,
      AI_ENDPOINT_CATALOG.find((e) => e.id === 'deepseek-api')!
    );
  }
  if (wantImage) picks.push(AI_ENDPOINT_CATALOG.find((e) => e.id === 'pollinations-image')!);
  if (wantVoice) picks.push(AI_ENDPOINT_CATALOG.find((e) => e.id === 'web-speech-api')!);

  if (!picks.length && /\b(api|integration|endpoint|connect)\b/.test(t)) {
    picks.push(
      AI_ENDPOINT_CATALOG.find((e) => e.id === 'groq-free')!,
      AI_ENDPOINT_CATALOG.find((e) => e.id === 'huggingface-inference-free')!
    );
  }

  return [...new Map(picks.filter(Boolean).map((p) => [p.id, p])).values()];
}

export function formatAiEndpointContext(prompt: string): string {
  const options = detectAiIntegrationNeeds(prompt);
  if (!options.length) return '';

  const lines = [
    'AI / API integration options for this build (prefer free tier when possible; label paid clearly in UI):',
  ];
  for (const o of options) {
    lines.push(
      `- ${o.name} (${o.freeTier ? 'FREE tier' : 'PAID'}): ${o.endpoint}\n  → ${o.userGuidance}${
        o.signupUrl ? `\n  Sign up: ${o.signupUrl}` : ''
      }`
    );
  }
  lines.push(
    'In generated code: wire free endpoints first; for paid APIs use .env placeholders and an in-app banner explaining free signup / trial.'
  );
  return lines.join('\n');
}
