import { authorizeFounderRequest, type FounderAuthDependencies } from '@/lib/osFounderAccess';

/** Presentation eligibility only. It never grants access to data or actions. */
export function responseV2Audience(mode: string | undefined, userId: string | null, allowlist = ''): boolean {
  if (!userId) return false;
  if (mode === 'authenticated') return true;
  return mode === 'canary' && allowlist.split(',').map(id => id.trim()).filter(Boolean).includes(userId);
}

export async function responseV2Decision(enabled: boolean, optedIn: boolean, deps: FounderAuthDependencies) {
  if (!enabled || !optedIn) return { allowed: false as const, reason: 'disabled' as const };
  return authorizeFounderRequest(deps);
}

export async function responseV2Access(enabled: boolean, optedIn: boolean, deps: FounderAuthDependencies): Promise<boolean> {
  return (await responseV2Decision(enabled, optedIn, deps)).allowed;
}
