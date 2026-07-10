/**
 * Shared Supabase helpers for migrations CI.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

/** Supabase project region — detected from pooler probe (ap-southeast-1). */
export const DEFAULT_POOLER_HOST = 'aws-1-ap-southeast-1.pooler.supabase.com';

export function projectRefFromConfig() {
  try {
    const toml = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8');
    const match = toml.match(/^project_id\s*=\s*"([^"]+)"/m);
    return match?.[1] ?? 'mweinwhoekwjrecsodip';
  } catch {
    return 'mweinwhoekwjrecsodip';
  }
}

export function normalizePassword(raw) {
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

export function supabaseRestUrl() {
  const url = process.env.SUPABASE_URL?.trim();
  if (url) return url.replace(/\/$/, '');
  return `https://${projectRefFromConfig()}.supabase.co`;
}

/** Check if user_token_usage exists using service role (no DB password needed). */
export async function phase1TableExistsViaRest() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!key) return null;

  const base = supabaseRestUrl();
  try {
    const res = await fetch(`${base}/rest/v1/user_token_usage?select=user_id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    // 200 or 206 = table exists; 42P01 often comes as 404/500 from PostgREST
    if (res.ok) return true;
    const text = await res.text();
    if (/relation.*does not exist|42P01/i.test(text)) return false;
    return null;
  } catch {
    return null;
  }
}
