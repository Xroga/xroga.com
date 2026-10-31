import { authorizeFounderRequest, type FounderAuthDependencies } from '@/lib/osFounderAccess';

export async function responseV2Decision(enabled: boolean, optedIn: boolean, deps: FounderAuthDependencies) {
  if (!enabled || !optedIn) return { allowed: false as const, reason: 'disabled' as const };
  return authorizeFounderRequest(deps);
}

export async function responseV2Access(enabled: boolean, optedIn: boolean, deps: FounderAuthDependencies): Promise<boolean> {
  return (await responseV2Decision(enabled, optedIn, deps)).allowed;
}
