import type {TestContext} from 'node:test';
import type {TenantContext} from '../../../security/tenantContext.js';
const installed=new WeakSet<object>();
/** Synthetic source store for focused transport tests. No authority issuer. */
export function withSupabaseSourceFixture(t:TestContext,context:TenantContext,provider:typeof fetch):typeof fetch{
 const origin='https://supabase-management-tests.invalid';
 if(!installed.has(t)){
  installed.add(t);const old={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY};
  process.env.SUPABASE_URL=origin;process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-source-store';
  t.after(()=>{
   if(old.SUPABASE_URL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.SUPABASE_URL;
   if(old.SUPABASE_SERVICE_ROLE_KEY===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=old.SUPABASE_SERVICE_ROLE_KEY;
  });
 }
 return async(input,init)=>{
  const url=new URL(String(input));
  if(url.origin!==origin)return provider(input,init);
  if(url.pathname!=='/rest/v1/user_integrations'||url.searchParams.get('user_id')!=='eq.'+context.userId)throw Error('Unexpected source query');
  return Response.json([]);
 };
}
