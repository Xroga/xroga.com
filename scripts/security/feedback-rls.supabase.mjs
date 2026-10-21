/** Real disposable Supabase Auth/PostgREST/PG proof, no production credentials. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID,createHmac,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL,dbUrl=new URL(process.env.XB01_LOCAL_DATABASE_URL??'http://invalid');
assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
assert.equal(url,'http://127.0.0.1:54321');assert.equal(dbUrl.hostname,'127.0.0.1');assert.equal(dbUrl.port,'54322');assert.equal(dbUrl.pathname,'/postgres');
const apiKey=process.env.SUPABASE_ANON_KEY,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(apiKey&&serviceKey);const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(url,serviceKey,options),anon=createClient(url,apiKey,options);
const db=new pg.Client({connectionString:dbUrl.href});await db.connect();
const original=readFileSync('supabase/migrations/20261018211950_product_feedback_admin.sql','utf8');
const correction=readFileSync('supabase/migrations/20261021100000_feedback_founder_authorization.sql','utf8');
const receipts=[];
const ok=result=>{assert.equal(result.error,null);return result.data;};
const count=async id=>(await db.query('select count(*)::int n from public.product_feedback where id=$1',[id])).rows[0].n;
async function waitForFeedbackSchema(){
  // PostgREST applies NOTIFY asynchronously. Wait only for the specific schema
  // cache miss, never retry an authorization or persistence failure as success.
  for(let attempt=0;attempt<40;attempt++){
    const result=await admin.from('product_feedback').select('id').limit(0);
    if(!result.error)return;
    assert.equal(result.error.code,'PGRST205');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error('Disposable feedback schema cache did not become ready');
}
async function identity(email,role){
  const password=`SyntheticOnly-${randomUUID()}-aA1!`;
  const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true})).user;
  await db.query('insert into public.profiles(id,role) values($1,$2)',[user.id,role]);
  const client=createClient(url,apiKey,options);ok(await client.auth.signInWithPassword({email,password}));return {id:user.id,client,email};
}
function totp(secret){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');
  const key=Buffer.from((bits.match(/.{8}/g)??[]).map(byte=>parseInt(byte,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)&15;
  return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
async function mfa(client){
  const factor=ok(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'isolated-feedback-proof'}));
  const challenge=ok(await client.auth.mfa.challenge({factorId:factor.id}));
  ok(await client.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}));
  assert.equal(ok(await client.auth.mfa.getAuthenticatorAssuranceLevel()).currentLevel,'aal2');
}
// Minimal target-schema fixture only. Auth, signed sessions, MFA and PostgREST
// are the real Supabase stack. This does not claim full-history schema parity.
await db.query('create schema if not exists community_private; revoke all on schema community_private from public,anon; grant usage on schema community_private to authenticated; create table public.profiles(id uuid primary key references auth.users(id),role text not null); alter table public.profiles enable row level security;');
const owner=await identity('member-a@example.invalid','member'),other=await identity('member-b@example.invalid','member'),founder=await identity('hello@xroga.com','owner');
const staleFounder=createClient(url,apiKey,options);ok(await staleFounder.auth.setSession(ok(await founder.client.auth.getSession()).session));
try {
for(const phase of ['upgrade','fresh']){
  await db.query('drop table if exists public.product_feedback');await db.query(original);
  await waitForFeedbackSchema();
  const seed=randomUUID();ok(await owner.client.from('product_feedback').insert({id:seed,rating:5,experience:'Synthetic pre-upgrade receipt'}));
  if(phase==='upgrade')assert.equal(ok(await staleFounder.from('product_feedback').select('id')).length,1,'Reproduce old email-only policy');
  await db.query(correction);assert.equal(await count(seed),1,'Migration preserves existing submissions');
  await db.query(correction);assert.equal(await count(seed),1,'Migration replay preserves existing submissions and founder policies');
  const founderPolicies=(await db.query("select policyname,permissive from pg_policies where schemaname='public' and tablename='product_feedback' and policyname in ('Verified founder can review product feedback','Feedback founder read guard') order by policyname")).rows;
  assert.deepEqual(founderPolicies,[{policyname:'Feedback founder read guard',permissive:'RESTRICTIVE'},{policyname:'Verified founder can review product feedback',permissive:'PERMISSIVE'}]);
  await db.query("select pg_notify('pgrst','reload schema')");
  await test(`${phase}: authenticated and anonymous submissions persist exact caller ownership`,async()=>{
    for(const actor of [owner,other,{client:anon,id:null,email:null}]){
      const id=randomUUID();ok(await actor.client.from('product_feedback').insert({id,rating:4,experience:'Synthetic feedback'}));
      const row=(await db.query('select user_id,submitter_email,experience from public.product_feedback where id=$1',[id])).rows[0];
      assert.deepEqual(row,{user_id:actor.id,submitter_email:actor.email,experience:'Synthetic feedback'});
    }
  });
  await test(`${phase}: forged owner/email and mixed batches roll back with no receipt`,async()=>{
    for(const [client,extra] of [[owner.client,{user_id:other.id}],[owner.client,{submitter_email:other.email}],[anon,{user_id:owner.id}],[anon,{submitter_email:owner.email}]]){
      const id=randomUUID(),result=await client.from('product_feedback').insert({id,rating:4,experience:'Denied',...extra});assert.ok(result.error);assert.equal(await count(id),0);
    }
    const a=randomUUID(),b=randomUUID();assert.ok((await owner.client.from('product_feedback').insert([{id:a,rating:5,experience:'First'},{id:b,rating:5,experience:'Second',user_id:other.id}])).error);assert.equal(await count(a),0);assert.equal(await count(b),0);
  });
  await test(`${phase}: foreign, anonymous and founder AAL1 cannot read; mutation grants denied`,async()=>{
    assert.equal(ok(await owner.client.from('product_feedback').select('id')).length,0);assert.equal(ok(await other.client.from('product_feedback').select('id')).length,0);
    assert.ok((await anon.from('product_feedback').select('id')).error);
    assert.equal(ok(await staleFounder.from('product_feedback').select('id')).length,0);
    for(const client of [owner.client,other.client,anon,founder.client]){
      assert.ok((await client.from('product_feedback').update({ideas:'Forbidden'}).eq('id',seed)).error);
      assert.ok((await client.from('product_feedback').delete().eq('id',seed)).error);
    }assert.equal(await count(seed),1);
  });
  if(phase==='upgrade')await mfa(founder.client);
  await test(`${phase}: real MFA founder reads, current role/confirmation/email revocation deny`,async()=>{
    assert.ok(ok(await founder.client.from('product_feedback').select('id')).some(row=>row.id===seed));
    for(const [revoke,restore] of [
      ["update public.profiles set role='member' where id=$1","update public.profiles set role='owner' where id=$1"],
      ['update auth.users set email_confirmed_at=null where id=$1','update auth.users set email_confirmed_at=now() where id=$1'],
      ["update auth.users set email='revoked@example.invalid' where id=$1","update auth.users set email='hello@xroga.com' where id=$1"]]){
      await db.query(revoke,[founder.id]);assert.equal(ok(await founder.client.from('product_feedback').select('id')).length,0);await db.query(restore,[founder.id]);
      assert.ok(ok(await founder.client.from('product_feedback').select('id')).some(row=>row.id===seed));
    }
    await db.query('create policy deliberately_broad_feedback on public.product_feedback for select to authenticated using(true)');
    assert.equal(ok(await other.client.from('product_feedback').select('id')).length,0);await db.query('drop policy deliberately_broad_feedback on public.product_feedback');
  });
  await test(`${phase}: malformed identity and input constraints cannot create rows`,async()=>{
    const session=ok(await owner.client.auth.getSession()).session;
    const forged=session.access_token.split('.');forged[1]=Buffer.from(JSON.stringify({sub:other.id,role:'authenticated'})).toString('base64url');
    const response=await fetch(`${url}/rest/v1/product_feedback?select=id`,{headers:{apikey:apiKey,Authorization:`Bearer ${forged.join('.')}`}});assert.equal(response.status,401);
    for(const extra of [{rating:0},{rating:6},{experience:'',ideas:''},{experience:'x'.repeat(2001)}]){
      const id=randomUUID();assert.ok((await owner.client.from('product_feedback').insert({id,rating:4,experience:'Synthetic',...extra})).error);assert.equal(await count(id),0);
    }
  });
  receipts.push({phase,status:'PASS',migrationPreservedSeed:true,provider:'REAL_DISPOSABLE_SUPABASE_AUTH_MFA_POSTGREST_PG17'});
}
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();mkdirSync('artifacts/feedback-security',{recursive:true});
writeFileSync('artifacts/feedback-security/receipts.json',JSON.stringify({sourceSha:source,receipts,production:false,fullHistoryParity:false,originalSha256:createHash('sha256').update(original).digest('hex'),correctionSha256:createHash('sha256').update(correction).digest('hex')},null,2));
}finally{await db.end();}
