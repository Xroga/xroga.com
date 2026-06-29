import crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.js';

const TTL_MS = 60 * 60 * 1000; // 1 hour

function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt.trim().toLowerCase()).digest('hex');
}

export async function getCachedResponse(prompt: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const key = hashPrompt(prompt);
    const { data } = await supabase
      .from('response_cache')
      .select('response_text, ttl_expires_at')
      .eq('cache_key', key)
      .maybeSingle();

    if (!data) return null;
    if (new Date(data.ttl_expires_at) < new Date()) return null;
    return data.response_text;
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  prompt: string,
  responseText: string,
  featureCategory?: string
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const key = hashPrompt(prompt);
    const expires = new Date(Date.now() + TTL_MS).toISOString();
    await supabase.from('response_cache').upsert({
      cache_key: key,
      prompt_hash: key,
      response_text: responseText,
      feature_category: featureCategory ?? null,
      ttl_expires_at: expires,
    });
  } catch {
    /* non-fatal */
  }
}
