import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../../config/supabase.js';

const BUCKET = 'xroga-github-tokens';

/** Internal admission shared by the EXISTING token stores, not a new vault.
 * Existing public/unknown bucket configuration is never repaired silently.
 */
export async function ensurePrivateOAuthBucket(supabase: SupabaseClient = getSupabaseAdmin()): Promise<boolean> {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr || !Array.isArray(buckets)) return false;
  const existing = buckets.find((bucket) => bucket.id === BUCKET || bucket.name === BUCKET);
  if (existing) return existing.public === false;
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 16384,
  });
  if (createErr && !/already exists|duplicate/i.test(createErr.message)) return false;
  // Neither create success nor a concurrent duplicate proves bucket privacy.
  const { data: confirmed, error: confirmErr } = await supabase.storage.listBuckets();
  if (confirmErr || !Array.isArray(confirmed)) return false;
  return confirmed.find((bucket) => bucket.id === BUCKET || bucket.name === BUCKET)?.public === false;
}
