import crypto from 'crypto';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';

const TTL_MS = 60 * 60 * 1000; // 1 hour

export function tenantResponseCacheKey(prompt: string, context: TenantContext): string {
  const scope = requireTenantContext(context);
  return crypto.createHash('sha256').update(`xroga:tenant-response:v1\0${scope.userId}\0${prompt.trim()}`).digest('hex');
}

export async function getCachedResponse(prompt: string, context?: TenantContext): Promise<string | null> {
  try {
    const scope = requireTenantContext(context);
    const supabase = getTenantSupabaseAdmin(scope);
    const key = tenantResponseCacheKey(prompt, scope);
    const { data } = await supabase
      .from('response_cache')
      .select('response_text, ttl_expires_at')
      .eq('cache_key', key)
      .maybeSingle();

    if (!data) return null;
    const expiry=Date.parse(data.ttl_expires_at);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;
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
): Promise<void> {
  try {
    const scope = requireTenantContext(context);
    const supabase = getTenantSupabaseAdmin(scope);
    const key = tenantResponseCacheKey(prompt, scope);
    const expires = new Date(Date.now() + TTL_MS).toISOString();
    await supabase.from('response_cache').upsert({
      cache_key: key,
      prompt_hash: key,
      response_text: responseText,
      feature_category: featureCategory ?? null,
      ttl_expires_at: expires,
    }, {onConflict:'cache_key'});
  } catch {
    /* non-fatal */
  }
}
