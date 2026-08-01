import { USER_SCOPED_DATABASES, USER_SCOPED_STORAGE_KEYS } from '@/lib/userScopedCache';

const USER_CACHE_OWNER_KEY = 'xroga-cache-owner';

/**
 * Runs before the authenticated shell is parsed. If another account used this
 * browser, remove only user-owned workspace data while retaining device-level
 * choices such as theme, language, density, and reduced motion.
 */
export function UserCacheScopeBootstrap({ userId }: { userId: string }) {
  const script = `(function(){try{
    var ownerKey=${JSON.stringify(USER_CACHE_OWNER_KEY)};
    var userId=${JSON.stringify(userId)};
    var previous=localStorage.getItem(ownerKey);
    if(previous&&previous!==userId){
      var keys=${JSON.stringify(USER_SCOPED_STORAGE_KEYS)};
      for(var i=0;i<keys.length;i++){localStorage.removeItem(keys[i]);sessionStorage.removeItem(keys[i]);}
      if(typeof indexedDB!=='undefined'){
        ${JSON.stringify(USER_SCOPED_DATABASES)}.forEach(function(name){try{indexedDB.deleteDatabase(name);}catch(e){}});
      }
    }
    localStorage.setItem(ownerKey,userId);
  }catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
