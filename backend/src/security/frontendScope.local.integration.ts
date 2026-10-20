import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {getGlobalSupabaseAdmin} from './serviceRoleGuard.js';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
// Use the frontend's existing SSR dependency, regardless of npm hoisting.
type Cookie={name:string;value:string;options:{maxAge?:number}};
const createServerClient=createRequire(new URL('../../../frontend/package.json',import.meta.url))('@supabase/ssr').createServerClient as
 (url:string,key:string,options:{cookies:{getAll:()=>{name:string;value:string}[];setAll:(values:Cookie[])=>void}})=>SupabaseClient;

/** Exercise the actual Next server components through verified local cookies.
 * No browser hydration, external provider request or mocked success response.
 */
export function registerFrontendScopeTests(admin:SupabaseClient):void{
 test('real browser proxy origin receipt binds the current disposable source and review-only constructor keys grant no access',()=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const source=process.env.XB01_TEST_SOURCE_SHA??process.env.EXPECTED_RELEASE_SHA;assert.match(source??'',/^[a-f0-9]{40}$/);
  const receipt=JSON.parse(readFileSync(new URL('../../../frontend/test-results/proxy-origin-evidence.json',import.meta.url),'utf8'));
  assert.deepEqual(receipt,{sourceSha:source,disposableOnly:true,authenticatedOwnFile:true,foreignFileDenied:true,untrustedScriptExecutesInOpaqueOrigin:true,appCookieStorageParentAndPrivateFileDenied:true,rasterBytesRetained:true,htmlImageRefused:true,rawSvgControlExecutes:true,svgScriptDenied:true,escapedErrorReflection:true,externalProviderCalled:false,command010EgressVerified:false});
  assert.throws(()=>getGlobalSupabaseAdmin('reviewed_named_internal_client_construction' as never),/Unregistered service operation/);
 });
 test('real server page reads bind verified cookies to own profile and current role despite forged query ownership',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const actors:{id:string;email:string;label:string}[]=[],password=`Synthetic-${randomUUID()}!`,cookies=new Map<string,string>();let publicPost:string|undefined;
  t.after(async()=>{if(publicPost)assert.equal((await admin.from('community_posts').delete().eq('id',publicPost)).error,null);for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
  const complete={status:'completed',currentStep:'complete'},pending={status:'in_progress',currentStep:'build_type'};
  for(let i=0;i<2;i++){
   const email=i===1?'hello@xroga.com':`server-scope-${randomUUID()}@example.invalid`,label=`SSR_SCOPE_${i}_${randomUUID().replaceAll('-','')}`;
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'owner'}});assert.equal(created.error,null);assert.ok(created.data.user);
   actors.push({id:created.data.user.id,email,label});assert.equal((await admin.from('profiles').update({role:i===0?'owner':'member',display_name:label,onboarding:i===0?complete:pending}).eq('id',created.data.user.id)).error,null);
  }
  const [owner,member]=actors;
  const post=await admin.from('community_posts').insert({author_id:owner.id,category:'question',title:'Disposable public profile boundary',body:'Synthetic local scope fixture only.'}).select('id').single();assert.equal(post.error,null);publicPost=post.data!.id;
  const client=createServerClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:values=>{for(const {name,value,options}of values){if(options.maxAge===0)cookies.delete(name);else cookies.set(name,value);}}}});
  const page=async(path:string)=>fetch(`http://127.0.0.1:3000${path}`,{headers:{Cookie:[...cookies].map(([name,value])=>`${name}=${value}`).join('; ')},redirect:'manual',signal:AbortSignal.timeout(30_000)});
  const uiRedirect=async(response:Response,target:string,foreignLabel=owner.label)=>{
   if([302,303,307,308].includes(response.status)){assert.equal(new URL(response.headers.get('location')!,'http://127.0.0.1:3000').pathname,target);return;}
   // Next's installed make-get-server-inserted-html emits this exact marker
   // when a server component redirects after streaming began. A plain200 fails.
   assert.equal(response.status,200);const body=await response.text();assert.ok(body.includes('id="__next-page-redirect"'));assert.ok(body.includes(`content="1;url=${target}"`)||body.includes(`content="0;url=${target}"`));assert.ok(!body.includes(foreignLabel));
  };
  const role=async(expected:string)=>{const r=await client.rpc('current_community_role');assert.equal(r.error,null);assert.equal(r.data,expected);};
  const setup=async(actor:typeof owner,state:typeof complete)=>{
   const r=await client.rpc('read_current_profile_setup');assert.equal(r.error,null);assert.deepEqual(r.data,{id:actor.id,display_name:actor.label,onboarding:state});
   assert.equal((await client.from('profiles').select('onboarding').eq('id',actor.id)).error?.code,'42501','Private column must remain unavailable even on a visible profile row');
   const forged=await client.rpc('read_current_profile_setup',{p_user_id:actors.find(a=>a.id!==actor.id)!.id});assert.ok(forged.error);assert.equal(forged.data,null);
  };
  const anonymousClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});assert.ok((await anonymousClient.rpc('read_current_profile_setup')).error);
  const anonymous=await page('/onboarding');assert.ok([302,303,307,308].includes(anonymous.status));assert.match(anonymous.headers.get('location')??'',/\/auth\/login/);
  assert.equal((await client.auth.signInWithPassword({email:owner.email,password})).error,null);assert.equal((await client.auth.getUser()).data.user?.id,owner.id);await role('owner');
  await setup(owner,complete);assert.ok(cookies.size>0);
  for(const path of ['/dashboard','/workspace']){
   const response=await page(`${path}?userId=${member.id}&tenantId=${member.id}`);assert.equal(response.status,200);const body=await response.text();assert.ok(body.includes(owner.label),`${path} must render its exact verified profile label`);assert.ok(!body.includes(member.label));
  }
  const completed=await page(`/onboarding?userId=${member.id}`);await uiRedirect(completed,'/workspace',member.label);
  for(const path of ['/admin','/admin/community']){const response=await page(`${path}?userId=${member.id}&role=member`);assert.equal(response.status,200);assert.ok(!(await response.text()).includes('Community staff only'));}
  assert.equal((await client.auth.signOut()).error,null);assert.equal((await client.auth.signInWithPassword({email:member.email,password})).error,null);assert.equal((await client.auth.getUser()).data.user?.id,member.id);await role('member');
  await setup(member,pending);const publicProfile=await client.from('profiles').select('id,display_name').eq('id',owner.id).single();assert.equal(publicProfile.error,null);assert.deepEqual(publicProfile.data,{id:owner.id,display_name:owner.label});assert.equal((await client.from('profiles').select('onboarding').eq('id',owner.id)).error?.code,'42501');
  const onboarding=await page(`/onboarding?userId=${owner.id}&role=owner`);assert.equal(onboarding.status,200);assert.ok((await onboarding.text()).includes('Set up Xroga'));
  assert.equal((await admin.from('profiles').update({onboarding:complete}).eq('id',member.id)).error,null);
  const denied=await page(`/admin?userId=${owner.id}&role=owner`);await uiRedirect(denied,'/dashboard');
  const community=await page(`/admin/community?userId=${owner.id}&role=owner`);assert.equal(community.status,200);assert.ok((await community.text()).includes('Community staff only'));
  // Current database role, not user metadata or the earlier JWT, decides access.
  assert.equal((await page('/os-preview/founder')).status,403);
  assert.equal((await admin.from('profiles').update({role:'owner'}).eq('id',member.id)).error,null);await role('owner');assert.equal((await page('/admin')).status,200);assert.equal((await page('/os-preview/founder')).status,403);
  // Same real local TOTP path as the retained authenticated browser fixture.
  const enrolled=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable server scope'});assert.equal(enrolled.error,null);assert.ok(enrolled.data);
  const challenge=await client.auth.mfa.challenge({factorId:enrolled.data.id});assert.equal(challenge.error,null);assert.ok(challenge.data);
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of enrolled.data.totp.secret.toUpperCase().replace(/=+$/,'')){const digit=alphabet.indexOf(c);assert.ok(digit>=0);bits+=digit.toString(2).padStart(5,'0');}
  const bytes:number[]=[];for(let n=0;n+8<=bits.length;n+=8)bytes.push(parseInt(bits.slice(n,n+8),2));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30_000)));const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=digest[digest.length-1]&15,code=((digest.readUInt32BE(offset)&0x7fffffff)%1_000_000).toString().padStart(6,'0');
  assert.equal((await client.auth.mfa.verify({factorId:enrolled.data.id,challengeId:challenge.data.id,code})).error,null);
  const founder=await page(`/os-preview/founder?userId=${owner.id}`);assert.equal(founder.status,200);assert.ok((await founder.text()).includes('Private interactive example'));
  assert.equal((await admin.from('profiles').update({role:'member'}).eq('id',member.id)).error,null);await role('member');await uiRedirect(await page('/admin'),'/dashboard');assert.equal((await page('/os-preview/founder')).status,403);
  const retained=await admin.from('profiles').select('display_name,onboarding,role').eq('id',owner.id).single();assert.equal(retained.error,null);assert.equal(retained.data?.display_name,owner.label);assert.deepEqual(retained.data?.onboarding,complete);assert.equal(retained.data?.role,'owner');
 });
}
