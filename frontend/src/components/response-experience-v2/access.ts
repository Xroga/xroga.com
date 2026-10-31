import { authorizeFounderRequest, type FounderAuthDependencies } from '@/lib/osFounderAccess';

export async function responseV2Access(enabled: boolean, optedIn: boolean, deps: FounderAuthDependencies): Promise<boolean> {
  if (!enabled || !optedIn) return false;
  return (await authorizeFounderRequest(deps)).allowed;
}
