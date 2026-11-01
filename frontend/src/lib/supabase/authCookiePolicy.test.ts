import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import { authCookieOptions } from './authCookiePolicy';

const projectRef='nzenxdfumxrnsmybazmo';
test('hosted Auth cookie and SDK storage key enforce host-only HTTPS session isolation',()=>{
  const cookieOptions=authCookieOptions(projectRef);
  assert.deepEqual(cookieOptions,{name:`__Host-sb-${projectRef}-auth-token`,secure:true,path:'/',sameSite:'lax'});
  assert.equal(cookieOptions.domain,undefined);assert.equal(Object.isFrozen(cookieOptions),true);
  const client=createServerClient(`https://${projectRef}.supabase.co`,'sb_publishable_synthetic_only',{
    cookieOptions,cookies:{getAll:()=>[],setAll:()=>{}},
  });
  assert.equal((client.auth as unknown as {storageKey:string}).storageKey,cookieOptions.name);
});
test('only the admitted disposable realm retains local HTTP cookie behavior',()=>{
  assert.deepEqual(authCookieOptions('local-disposable'),{path:'/',secure:false,sameSite:'lax'});
  assert.equal(authCookieOptions('self-hosted-staging').name,'__Host-sb-self-hosted-staging-auth-token');
  for(const value of ['', 'localhost','production','local-disposable.attacker','../host','project; Domain=xroga.com']){
    assert.throws(()=>authCookieOptions(value),/realm is invalid/);
  }
});
test('all actual SSR constructors share the cookie policy without legacy fallback',()=>{
  for(const name of ['client.ts','server.ts','middleware.ts']){
    const source=readFileSync(new URL(name,import.meta.url),'utf8');
    assert.match(source,/cookieOptions:\s*authCookieOptions\(config\.projectRef\)/);
    assert.doesNotMatch(source,/legacyCookie|unprefixedCookie|fallbackCookie/);
  }
});
