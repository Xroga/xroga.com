import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { authorizeFounderRequest } from '@/lib/osFounderAccess';

/** All OS preview pages require the same server-verified founder policy. */
export async function hasFounderSession(): Promise<boolean> {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return false;
  const decision = await authorizeFounderRequest({
    getUser: async () => {
      const { data, error } = await supabase.auth.getUser();
      return error ? null : data.user;
    },
    getRole: async () => {
      const { data, error } = await supabase.rpc('current_community_role');
      return error ? null : data;
    },
    getAal: async () => {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      return error ? null : data.currentLevel;
    },
  });
  return decision.allowed;
}
