import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {getVercelToken,refreshVercelOAuthToken} from '../services/integrations/vercelAuth.js';
import {ensurePrivateOAuthBucket} from '../services/integrations/credentialStorageBucket.js';

/** Real canonical rows, leases, RPCs and Auth. Provider responses are synthetic
 * and never forwarded to Vercel. No token, account or deployment is live. */
export function registerVercelRefreshAccountTests(admin:SupabaseClient,request:(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>):void{
  test('real Vercel refresh retains exact account ownership and rejects foreign refresh and post-disconnect response without mirror resurrection',{timeout:30000},async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const actors:{id:string;token:string;refresh:string;account:string;revision:string}[]=[],bucket='xroga-github-tokens';
    const original=globalThis.fetch,previousId=process.env.VERCEL_CLIENT_ID,previousSecret=process.env.VERCEL_CLIENT_SECRET;
    process.env.VERCEL_CLIENT_ID='synthetic-client';process.env.VERCEL_CLIENT_SECRET='synthetic-secret';
    let hold=false,release:()=>void=()=>{},entered:()=>void=()=>{},pending:Promise<string|null>|undefined;
    let enteredPromise=Promise.resolve(),holdPromise=Promise.resolve();
    const calls:string[]=[];
    t.after(async()=>{
      release();if(pending)await pending.catch(()=>{});globalThis.fetch=original;
      if(previousId===undefined)delete process.env.VERCEL_CLIENT_ID;else process.env.VERCEL_CLIENT_ID=previousId;
      if(previousSecret===undefined)delete process.env.VERCEL_CLIENT_SECRET;else process.env.VERCEL_CLIENT_SECRET=previousSecret;
      if(actors.length)assert.equal((await admin.storage.from(bucket).remove(actors.map(actor=>`${actor.id}/vercel.json`))).error,null);
      for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);
    });
    for(let index=0;index<2;index++){
      const email=`vercel-account-${randomUUID()}@example.invalid`,password=`Synthetic-${randomUUID()}!`;
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
      const actor={id:created.data.user.id,token:'',refresh:`SYNTHETIC_REFRESH_${randomUUID()}`,account:`synthetic-account-${randomUUID()}`,revision:randomUUID()};actors.push(actor);
      const client:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
      const signed=await client.auth.signInWithPassword({email,password});assert.equal(signed.error,null);assert.ok(signed.data.session);actor.token=signed.data.session.access_token;
    }
    const [owner,other]=actors;assert.equal(await ensurePrivateOAuthBucket(),true);
    const expired=new Date(Date.now()-120000).toISOString();
    assert.equal((await admin.from('user_integrations').insert(actors.map(actor=>({user_id:actor.id,provider:'vercel',provider_user_id:actor.account,access_token:`SYNTHETIC_OLD_${actor.id}`,refresh_token:actor.refresh,credential_revision:actor.revision,metadata:{username:'fixture',auth_kind:'sign_in_with_vercel',expires_at:expired}})))).error,null);
    const mirrors=new Map(actors.map(actor=>[actor.id,JSON.stringify({access_token:`SYNTHETIC_STALE_MIRROR_${actor.id}`})]));
    for(const actor of actors)assert.equal((await admin.storage.from(bucket).upload(`${actor.id}/vercel.json`,mirrors.get(actor.id)!,{contentType:'application/json'})).error,null);
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input instanceof Request?input.url:input));
      if(url.origin!=='https://api.vercel.com'){
        assert.equal(url.hostname,'127.0.0.1','Only disposable Auth/DB/API may receive non-stub traffic');return original(input,init);
      }
      assert.equal(url.pathname,'/login/oauth/token');assert.equal(init?.method,'POST');
      const refresh=new URLSearchParams(String(init?.body)).get('refresh_token')!,actor=actors.find(actor=>refresh===actor.refresh||refresh===`${actor.refresh}_ROTATED`);assert.ok(actor);calls.push(actor.id);
      if(hold){assert.equal(actor.id,owner.id);entered();await holdPromise;}
      return Response.json({access_token:`SYNTHETIC_CURRENT_${actor.id}`,refresh_token:`${actor.refresh}_ROTATED`,expires_in:3600});
    };
    await assert.rejects(refreshVercelOAuthToken(owner.id,other.refresh),/connection changed before refresh/);assert.equal(calls.length,0);
    const tokens=await Promise.all([getVercelToken(owner.id),getVercelToken(owner.id),getVercelToken(other.id)]);
    assert.deepEqual(tokens,[`SYNTHETIC_CURRENT_${owner.id}`,`SYNTHETIC_CURRENT_${owner.id}`,`SYNTHETIC_CURRENT_${other.id}`]);
    assert.equal(calls.filter(id=>id===owner.id).length,1);assert.equal(calls.filter(id=>id===other.id).length,1);
    const read=async(user:string)=>{const row=await admin.from('user_integrations').select('*').eq('user_id',user).eq('provider','vercel').single();assert.equal(row.error,null);return row.data;};
    for(const actor of actors){
      const row=await read(actor.id);assert.equal(row.user_id,actor.id);assert.equal(row.provider,'vercel');assert.equal(row.provider_user_id,actor.account);
      assert.equal(row.access_token,`SYNTHETIC_CURRENT_${actor.id}`);assert.equal(row.refresh_token,`${actor.refresh}_ROTATED`);assert.notEqual(row.credential_revision,actor.revision);
    }
    const foreignBefore=await read(other.id);
    assert.equal((await admin.from('user_integrations').update({metadata:{username:'fixture',auth_kind:'sign_in_with_vercel',expires_at:expired}}).eq('user_id',owner.id).eq('provider','vercel')).error,null);
    enteredPromise=new Promise<void>(resolve=>{entered=resolve;});holdPromise=new Promise<void>(resolve=>{release=resolve;});hold=true;
    pending=getVercelToken(owner.id);await enteredPromise;
    const disconnected=await request('/api/vercel/disconnect',owner.token,'DELETE',{userId:other.id});assert.equal(disconnected.status,200);
    const revoked=await read(owner.id);assert.equal(revoked.access_token,'');assert.equal(revoked.metadata.revoked,true);
    release();assert.equal(await pending,null);pending=undefined;hold=false;
    assert.deepEqual(await read(owner.id),revoked,'A delayed response and lease cleanup cannot overwrite canonical revocation');
    assert.deepEqual(await read(other.id),foreignBefore);
    const ownObject=await admin.storage.from(bucket).download(`${owner.id}/vercel.json`);assert.ok(ownObject.error);assert.equal(ownObject.data,null);
    const foreignObject=await admin.storage.from(bucket).download(`${other.id}/vercel.json`);assert.equal(foreignObject.error,null);assert.equal(await foreignObject.data!.text(),mirrors.get(other.id));
    assert.equal((await admin.storage.from(bucket).upload(`${owner.id}/vercel.json`,mirrors.get(owner.id)!,{contentType:'application/json'})).error,null);
    assert.equal(await getVercelToken(owner.id),null);assert.equal(await getVercelToken(other.id),`SYNTHETIC_CURRENT_${other.id}`);
    assert.deepEqual(await read(other.id),foreignBefore);
  });
}
