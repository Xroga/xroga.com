import type { FounderIdentity } from '@/lib/osFounderAccess';

type PresentationIdentity = { getUser: () => Promise<FounderIdentity | null> };

/** Presentation only, never grants operations, data access, roles or actions.
 * Server getUser verifies the current identity. Privileged operations retain
 * their separate owner/AAL2 policy and all existing backend authorization. */
export async function responseV2Decision(enabled: boolean, optedIn: boolean, deps: PresentationIdentity) {
  if (!enabled || !optedIn) return { allowed: false as const, reason: 'disabled' as const };
  try {
    const user = await deps.getUser();
    if (!user?.id || !user.email_confirmed_at || user.email?.trim().toLowerCase() !== 'hello@xroga.com') return { allowed: false as const, reason: 'identity' as const };
    return { allowed: true as const };
  } catch { return { allowed: false as const, reason: 'identity' as const }; }
}

export async function responseV2Access(enabled: boolean, optedIn: boolean, deps: PresentationIdentity): Promise<boolean> {
  return (await responseV2Decision(enabled, optedIn, deps)).allowed;
}
