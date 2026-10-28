import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin: SupabaseClient | null = null;

/** Supabase's configured project is a fixed credential recipient. SDK-internal
 * redirects must never forward apikey, user JWTs or sealed credential mirrors.
 * Return a terminal HTTP denial so SDK network-retry handling cannot replay it.
 * This transport grants no query, row, storage or tenant authority. */
function supabaseFetchFor(projectUrl:string):typeof fetch {
  const base=new URL(projectUrl);
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/'
    ||!(base.protocol==='https:'||base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw new Error('Supabase project origin is invalid.');
  const denied=()=>Response.json({code:'CAPABILITY_AUTH_REQUIRED',message:'Supabase destination denied by security policy.',details:null,hint:null},{status:403});
  return async(input,init)=>{
    let target:URL;
    try{target=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
      if(target.origin!==base.origin||target.username||target.password||target.hash)return denied();}
    catch{return denied();}
    const signal=init?.signal??(input instanceof Request?input.signal:undefined);
    signal?.throwIfAborted();
    const response=await fetch(input,{...init,redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(30000),...(signal?[signal]:[])])});
    if(signal?.aborted){await response.body?.cancel().catch(()=>undefined);signal.throwIfAborted();}
    if(response.type==='opaqueredirect'||response.redirected||response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);return denied();}
    return response;
  };
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }

    supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: supabaseFetchFor(url) },
    });
  }

  return supabaseAdmin;
}

export function createSupabaseClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  }

  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${accessToken}` }, fetch:supabaseFetchFor(url) },
  });
}
