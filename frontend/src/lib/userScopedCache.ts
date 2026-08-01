export const USER_SCOPED_STORAGE_KEYS = [
  'xroga_workspace_session',
  'xroga_pending_build_jobs',
  'xroga-repo-context',
  'xroga_chat_archive',
  'xroga_local_projects',
  'xroga_media_gallery',
  'xroga_item_meta',
  'xroga_repo_sessions_v1',
  'xroga_terminal_history',
  'xroga-project-workspace',
  'xroga-repo-analysis-cache',
  'xroga-repo-list-cache',
  'xroga_pending_prompt',
  'xroga_custom_credentials',
  'xroga_vault_hash',
  'xroga_vault_secrets',
  'xroga-privacy-v1',
  'xroga-companion',
  'xroga-composer-tools',
  'xroga-voice-prefs',
  'xroga-smoky-position',
  'xroga_vercel_preferred_project',
  'xroga_pending_showcase_v1',
  'xroga_user_feedback',
  'xroga-oauth-result',
  'xroga-github-connected-session',
  'xroga-vercel-setup-error',
] as const;

export const USER_SCOPED_DATABASES = [
  'xroga_workspace_v1',
  'xroga_terminal_sessions_v1',
  'xroga-workspace-preview',
  'xroga_landing_builds_v1',
] as const;

export function clearUserScopedCaches() {
  if (typeof window === 'undefined') return;
  for (const key of USER_SCOPED_STORAGE_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  for (const name of USER_SCOPED_DATABASES) {
    try {
      indexedDB.deleteDatabase(name);
    } catch {
      // A blocked or private store must never prevent logout.
    }
  }
}
