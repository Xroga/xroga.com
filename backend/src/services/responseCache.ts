import crypto from 'crypto';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_TEXT_BYTES = 1024 * 1024;
function boundedText(value: unknown): value is string {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= MAX_TEXT_BYTES;
}

export function tenantResponseCacheKey(prompt: string, context: TenantContext): string {
  const scope = requireTenantContext(context);
  if (!boundedText(prompt) || !prompt.trim()) throw new Error('Invalid cache prompt');
  return crypto.createHash('sha256').update(`xroga:tenant-response:v1\0${scope.userId}\0${prompt.trim()}`).digest('hex');
}

export async function getCachedResponse(prompt: string, context?: TenantContext): Promise<string | null> {
  try {
    const scope = requireTenantContext(context);
    const supabase = getTenantSupabaseAdmin(scope);
    const key = tenantResponseCacheKey(prompt, scope);
    const { data, error } = await supabase
      .from('response_cache')
      .select('cache_key,prompt_hash,response_text,ttl_expires_at')
      .eq('cache_key', key)
      .maybeSingle();

    if (error || !data || data.cache_key !== key || data.prompt_hash !== key
      || !boundedText(data.response_text) || typeof data.ttl_expires_at !== 'string') return null;
    const expiry=Date.parse(data.ttl_expires_at);
    const now = Date.now();
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + TTL_MS) return null;
    return data.response_text;
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  prompt: string,
  responseText: string,
  featureCategory?: string,
  context?: TenantContext,
): Promise<boolean> {
  try {
    const scope = requireTenantContext(context);
    if (!boundedText(responseText) || (featureCategory !== undefined
      && (typeof featureCategory !== 'string' || featureCategory.length > 128))) return false;
    const supabase = getTenantSupabaseAdmin(scope);
    const key = tenantResponseCacheKey(prompt, scope);
    const expires = new Date(Date.now() + TTL_MS).toISOString();
    const { data, error } = await supabase.from('response_cache').upsert({
      cache_key: key,
      prompt_hash: key,
      response_text: responseText,
      feature_category: featureCategory ?? null,
      ttl_expires_at: expires,
    }, {onConflict:'cache_key'}).select('cache_key,prompt_hash,response_text,feature_category,ttl_expires_at').single();
    return !error && !!data && data.cache_key === key && data.prompt_hash === key
      && data.response_text === responseText && data.feature_category === (featureCategory ?? null)
      && typeof data.ttl_expires_at === 'string' && Date.parse(data.ttl_expires_at) === Date.parse(expires);
  } catch {
    return false; // A cache failure never becomes a successful write receipt.
  }
}
