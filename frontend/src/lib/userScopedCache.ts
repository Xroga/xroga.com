import {
  GUEST_AUTH_INTENT_KEY,
  GUEST_MIGRATION_MARKER_KEY,
  GUEST_SESSION_ID_KEY,
  GUEST_WORKSPACE_SNAPSHOT_KEY,
  GUEST_WORKSPACE_TTL_MS,
} from './guestWorkspace';

export const USER_CACHE_OWNER_KEY = 'xroga-cache-owner';
export const USER_CACHE_SCOPE_VERSION = 'v2';

export const USER_SCOPED_STORAGE_KEYS = [
  USER_CACHE_OWNER_KEY,
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
  'xroga-project-contexts',
  'xroga_landing_builds_v1',
] as const;

/**
 * Runs before React hydrates the authenticated shell. A missing owner marker is
 * deliberately treated as untrusted: older Xroga releases stored workspace
 * state without an account owner, so preserving it could expose one user's
 * repository names and terminal history to the next account on the device.
 */
export function buildUserCacheScopeScript(userId: string) {
  return `(function(){try{
    var ownerKey=${JSON.stringify(USER_CACHE_OWNER_KEY)};
    var userId=${JSON.stringify(userId)};
    var scopePrefix=${JSON.stringify(`${USER_CACHE_SCOPE_VERSION}:`)};
    var scopedOwner=scopePrefix+userId;
    var guestOwner=scopePrefix+'guest';
    var guestSnapshotKey=${JSON.stringify(GUEST_WORKSPACE_SNAPSHOT_KEY)};
    var guestSessionIdKey=${JSON.stringify(GUEST_SESSION_ID_KEY)};
    var guestIntentKey=${JSON.stringify(GUEST_AUTH_INTENT_KEY)};
    var guestMigrationKey=${JSON.stringify(GUEST_MIGRATION_MARKER_KEY)};
    var guestTtl=${JSON.stringify(GUEST_WORKSPACE_TTL_MS)};
    var previous=localStorage.getItem(ownerKey);
    var migratingGuest=userId!=='guest'&&previous===guestOwner;
    var guestRaw=migratingGuest?localStorage.getItem(guestSnapshotKey):null;
    var guestIntentRaw=migratingGuest?localStorage.getItem(guestIntentKey):null;
    if(previous!==scopedOwner){
      var keys=${JSON.stringify(USER_SCOPED_STORAGE_KEYS)};
      for(var i=0;i<keys.length;i++){localStorage.removeItem(keys[i]);sessionStorage.removeItem(keys[i]);}
      if(typeof indexedDB!=='undefined'){
        ${JSON.stringify(USER_SCOPED_DATABASES)}.forEach(function(name){try{indexedDB.deleteDatabase(name);}catch(e){}});
      }
      if(migratingGuest){
        var migratedGuestId=null;
        var migratedReason=null;
        var restoredWorkspace=false;
        var intent=null;
        if(guestIntentRaw){
          try{
            var parsedIntent=JSON.parse(guestIntentRaw);
            var intentCreated=Date.parse(parsedIntent.createdAt||'');
            if(parsedIntent.version===1&&typeof parsedIntent.guestSessionId==='string'&&Number.isFinite(intentCreated)&&(Date.now()-intentCreated)<=guestTtl){
              intent=parsedIntent;
            }
          }catch(e){}
        }
        if(guestRaw){
          try{
            var guest=JSON.parse(guestRaw);
            var updatedAt=Date.parse(guest.updatedAt||(guest.workspaceSession&&guest.workspaceSession.updatedAt)||'');
            var fresh=Number.isFinite(updatedAt)&&(Date.now()-updatedAt)<=guestTtl;
            var workspace=guest.workspaceSession;
            var hasWorkspace=workspace&&Array.isArray(workspace.messages)&&(workspace.messages.length>0||String(workspace.prompt||'').trim().length>0);
            if(fresh&&hasWorkspace&&typeof guest.guestSessionId==='string'){
              localStorage.setItem('xroga_workspace_session',JSON.stringify(workspace));
              migratedGuestId=guest.guestSessionId;
              restoredWorkspace=true;
            }
          }catch(e){}
        }
        if(!migratedGuestId&&intent&&typeof intent.guestSessionId==='string'){
          migratedGuestId=intent.guestSessionId;
        }
        if(intent&&migratedGuestId&&intent.guestSessionId===migratedGuestId&&typeof intent.reason==='string'){
          migratedReason=intent.reason.slice(0,48);
        }
        if(migratedGuestId){
          localStorage.setItem(guestMigrationKey,JSON.stringify({
            version:1,
            guestSessionId:migratedGuestId,
            reason:migratedReason||undefined,
            migratedAt:new Date().toISOString(),
            restoredWorkspace:restoredWorkspace
          }));
        }
        localStorage.removeItem(guestSnapshotKey);
        localStorage.removeItem(guestSessionIdKey);
        localStorage.removeItem(guestIntentKey);
      }
    }
    localStorage.setItem(ownerKey,scopedOwner);
  }catch(e){}})();`;
}

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
