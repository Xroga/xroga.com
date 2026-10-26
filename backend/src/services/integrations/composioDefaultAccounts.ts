import { getSupabaseAdmin } from '../../config/supabase.js';

/**
 * The connected account a user chose as the default for an app (Composio multi-account).
 * The row holds only a Composio account id. Every query carries the verified owner explicitly; the
 * caller (composioAccounts.ts) still proves the id is one of the owner's own active private accounts
 * before it is used, so a stale or tampered row can only ever fail closed.
 */
export interface DefaultAccountStore {
  get(userId: string, toolkit: string): Promise<string | null>;
  set(userId: string, toolkit: string, accountId: string): Promise<void>;
  clear(userId: string, toolkit: string): Promise<void>;
}

const TOOLKIT = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const ACCOUNT = /^[A-Za-z0-9_-]{4,64}$/;
const USER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function check(userId: string, toolkit: string): void {
  if (!USER.test(userId) || !TOOLKIT.test(toolkit)) throw new Error('Invalid default account scope');
}

export const supabaseDefaultAccountStore: DefaultAccountStore = {
  async get(userId, toolkit) {
    check(userId, toolkit);
    const { data, error } = await getSupabaseAdmin()
      .from('composio_default_accounts')
      .select('connected_account_id')
      .eq('user_id', userId)
      .eq('toolkit', toolkit)
      .maybeSingle();
    if (error) throw new Error('The default account could not be read.');
    const id = (data as { connected_account_id?: unknown } | null)?.connected_account_id;
    return typeof id === 'string' && ACCOUNT.test(id) ? id : null;
  },
  async set(userId, toolkit, accountId) {
    check(userId, toolkit);
    if (!ACCOUNT.test(accountId)) throw new Error('Invalid default account scope');
    const { error } = await getSupabaseAdmin()
      .from('composio_default_accounts')
      .upsert({ user_id: userId, toolkit, connected_account_id: accountId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,toolkit' });
    if (error) throw new Error('The default account could not be saved.');
  },
  async clear(userId, toolkit) {
    check(userId, toolkit);
    const { error } = await getSupabaseAdmin().from('composio_default_accounts').delete().eq('user_id', userId).eq('toolkit', toolkit);
    if (error) throw new Error('The default account could not be cleared.');
  },
};

/** In-memory store with the same owner scoping, for tests. */
export function memoryDefaultAccountStore(): DefaultAccountStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  const key = (userId: string, toolkit: string) => `${userId}\u0000${toolkit}`;
  return {
    rows,
    async get(userId, toolkit) { check(userId, toolkit); return rows.get(key(userId, toolkit)) ?? null; },
    async set(userId, toolkit, accountId) { check(userId, toolkit); if (!ACCOUNT.test(accountId)) throw new Error('Invalid default account scope'); rows.set(key(userId, toolkit), accountId); },
    async clear(userId, toolkit) { check(userId, toolkit); rows.delete(key(userId, toolkit)); },
  };
}
