export interface ComposerDraftScope {
  owner: string;
  session: string;
  project: string;
}

export interface ComposerDraftSnapshot extends ComposerDraftScope {
  value: string;
  restoring: boolean;
}

/** Explicit hide only. Never flush a stale, ambiguous or restoring composer. */
export function draftForExplicitHide(
  snapshots: readonly ComposerDraftSnapshot[],
  scope: ComposerDraftScope,
  restoring: boolean,
): string | undefined {
  if (restoring || !scope.owner || !scope.session || snapshots.length !== 1) return undefined;
  const snapshot = snapshots[0];
  if (snapshot.restoring || snapshot.owner !== scope.owner || snapshot.session !== scope.session
    || snapshot.project !== scope.project) return undefined;
  // Empty is a deliberate clear, distinct from unavailable or stale input.
  return snapshot.value;
}
