export interface ComposerDraftScope {
  owner: string;
  session: string;
  project: string;
}

export interface ComposerDraftSnapshot extends ComposerDraftScope {
  value: string;
  restoring: boolean;
}

/** History titles and submitted prompts are metadata, never a new draft.
 * Keep the latest scoped input only when reopening the already active chat. */
export function draftForConversationRestore(
  snapshots: readonly ComposerDraftSnapshot[], scope: ComposerDraftScope,
  targetSession: string, restoring: boolean, currentDraft: string,
): string {
  if (!scope.owner || !scope.session || targetSession !== scope.session || restoring) return '';
  return draftForExplicitHide(snapshots, scope, false) ?? currentDraft;
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
