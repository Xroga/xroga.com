/**
 * Hybrid Swarm + Council configuration.
 * ALLOW_PAID_API=true (default) → Elite Council (Groq/Gemini/DeepSeek) primary.
 * ALLOW_PAID_API=false → OSS Reserve Army only (Ollama / free-tier Groq).
 */

export type CouncilLayer = 'elite' | 'reserve' | 'blackhole';

export function isPaidApiAllowed(): boolean {
  const v = process.env.ALLOW_PAID_API?.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no') return false;
  return true;
}

export function isGrokEnabled(): boolean {
  return Boolean(process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim());
}
