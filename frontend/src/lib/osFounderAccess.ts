/** Pure policy, tested independently of Supabase's server client. All checks must pass. */
export interface FounderIdentity { id: string; email?: string | null; email_confirmed_at?: string | null }
export type FounderDecision = { allowed: true } | { allowed: false; reason: 'signed-out' | 'identity' | 'role' | 'assurance' };

export function resolveFounderAccess(user: FounderIdentity | null, role: unknown, aal: unknown): FounderDecision {
  if (!user?.id) return { allowed: false, reason: 'signed-out' };
  if (user.email?.trim().toLowerCase() !== 'hello@xroga.com' || !user.email_confirmed_at) {
    return { allowed: false, reason: 'identity' };
  }
  if (role !== 'owner') return { allowed: false, reason: 'role' };
  if (aal !== 'aal2') return { allowed: false, reason: 'assurance' };
  return { allowed: true };
}

export interface FounderAuthDependencies {
  getUser: () => Promise<FounderIdentity | null>;
  getRole: () => Promise<unknown>;
  getAal: () => Promise<unknown>;
}

/** Request-scoped policy entry point; dependencies are server implementations in the route. */
export async function authorizeFounderRequest(deps: FounderAuthDependencies): Promise<FounderDecision> {
  try {
    const user = await deps.getUser();
    const identity = resolveFounderAccess(user, 'owner', 'aal2');
    if (!identity.allowed) return identity;
    const role = await deps.getRole();
    if (role !== 'owner') return { allowed: false, reason: 'role' };
    const aal = await deps.getAal();
    return resolveFounderAccess(user, role, aal);
  } catch {
    return { allowed: false, reason: 'identity' };
  }
}
