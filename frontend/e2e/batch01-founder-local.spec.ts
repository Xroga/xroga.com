import { test, expect, type BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const url=process.env.SUPABASE_URL!;
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const createdIds:string[]=[];
const password=`Test!${randomUUID()}aA9`;
test.beforeAll(()=>{
  if(process.env.CI!=='true'||process.env.XB01_DISPOSABLE_SUPABASE!=='1'||url!=='http://127.0.0.1:54321'||process.env.NEXT_PUBLIC_SUPABASE_URL!==url||process.env.E2E_BACKEND_URL!=='http://127.0.0.1:4000') throw new Error('Founder fixtures require the real disposable loopback stack');
});
test.afterAll(async()=>{for(const id of createdIds){const result=await admin.auth.admin.deleteUser(id);expect(result.error).toBeNull();}});
async function identity(email:string,role:'owner'|'member') {
  const result=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(result.error).toBeNull();expect(result.data.user).toBeTruthy();
  const id=result.data.user!.id;createdIds.push(id);
  const updated=await admin.from('profiles').update({role,onboarding:{status:'completed',current_step:'complete'}}).eq('id',id).select('role').single();
  expect(updated.error).toBeNull();expect(updated.data?.role).toBe(role);return id;
}
function session(context:BrowserContext) {
  return createServerClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{
    getAll:async()=>context.cookies(),
    setAll:async(cookies)=>{await context.addCookies(cookies.map(({name,value,options})=>({name,value,domain:'127.0.0.1',path:options.path??'/',secure:false,httpOnly:options.httpOnly??false,sameSite:'Lax' as const,...(options.maxAge===0?{expires:1}:{})})));},
  }});
}
function totp(secret:string) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of secret.toUpperCase().replace(/=+$/,'')){const digit=alphabet.indexOf(char);if(digit<0)throw new Error('Invalid temporary TOTP encoding');bits+=digit.toString(2).padStart(5,'0');}
  const bytes=[];for(let n=0;n+8<=bits.length;n+=8)bytes.push(parseInt(bits.slice(n,n+8),2));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest=createHmac('sha1',Buffer.from(bytes)).update(counter).digest(),offset=digest[digest.length-1]&15;
  return ((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
async function denied(context:BrowserContext,label:string) {
  for(const path of ['/os-preview','/os-preview/founder']) {
    for(const headers of [{},{RSC:'1','Next-Router-Prefetch':'1'}]) {
      const response=await context.request.get(path,{headers,maxRedirects:0});
      expect([302,303,307,308,403,404],`${label} ${path}`).toContain(response.status());
      const body=await response.text();expect(body).not.toContain('SIMULATED SCENARIO');expect(body).not.toContain('Private interactive example');expect(body).not.toContain('fixture_timeout');
    }
  }
}

test('real action approval UI shows exact owner account and redacted parameters, cancels safely and blocks legacy plans',async({browser})=>{
  test.setTimeout(90000);
  const email=`action-approval-${randomUUID()}@example.invalid`,owner=await identity(email,'member');
  const context=await browser.newContext({baseURL:'http://127.0.0.1:3000'});
  try {
    expect((await session(context).auth.signInWithPassword({email,password})).error).toBeNull();
    const issuedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+10*60000).toISOString();
    const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
      ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,canonical(child)])):value;
    const seed=async(scoped:boolean)=>{
      const id=randomUUID(),unsigned={version:'1.0',sessionId:`trs_${randomUUID()}`,useCase:'Approve an isolated synthetic action',
        toolkit:'slack',toolSlug:'SLACK_DELETE_MESSAGE',arguments:{channel:'visible-fixture-channel',message:'visible-fixture-message',api_key:'SYNTHETIC_UI_SECRET_CANARY'},
        summary:'Delete the isolated synthetic message',risk:'destructive',requiresConfirmation:true,requiredScopes:[],scopeRequirements:null,
        ...(scoped?{authority:{version:'1',userId:owner,tenantId:owner,connectedAccountId:'visible-fixture-account',actionClass:'DELETE',projectId:null,runId:null,
          issuedAt,expiresAt,nonce:randomUUID(),maxSpendMicroUsd:null,currency:null}}:{})};
      const digest=createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex');
      expect((await admin.from('business_action_confirmations').insert({id,user_id:owner,status:'pending',plan:{...unsigned,planDigest:digest},
        plan_digest:digest,summary:unsigned.summary,toolkit:unsigned.toolkit,risk:unsigned.risk,expires_at:expiresAt})).error).toBeNull();
      return{id,digest};
    };
    const scoped=await seed(true),page=await context.newPage();
    await page.goto(`/dashboard/actions/confirm/${scoped.id}`);
    const approval=page.getByRole('region',{name:'Exact action approval'});
    await expect(approval).toBeVisible({timeout:30000});
    await expect(approval).toContainText('visible-fixture-account');await expect(approval).toContainText('visible-fixture-channel');
    await expect(approval).toContainText(scoped.digest);await expect(approval).toContainText('[REDACTED]');
    await expect(page.locator('body')).not.toContainText('SYNTHETIC_UI_SECRET_CANARY');
    await expect(page.getByRole('button',{name:'Confirm action',exact:true})).toBeEnabled();
    // Do not click confirm or contact any external provider. Cancellation is a
    // real owner-scoped write against this disposable fixture only.
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(page.getByText('cancelled',{exact:true})).toBeVisible();
    const persisted=await admin.from('business_action_confirmations').select('status,effect_started_at,effect_receipt').eq('id',scoped.id).single();
    expect(persisted.error).toBeNull();expect(persisted.data).toEqual({status:'cancelled',effect_started_at:null,effect_receipt:null});
    const legacy=await seed(false);await page.goto(`/dashboard/actions/confirm/${legacy.id}`);
    await expect(page.getByRole('alert')).toContainText('needs to be prepared again');
    await expect(page.getByRole('button',{name:'Confirm action',exact:true})).toBeDisabled();
  } finally {await context.close();}
});
test('real founder email, server role and TOTP AAL2 gate HTML/RSC without a client bypass',async({browser})=>{
  test.setTimeout(180000);
  const context=await browser.newContext({baseURL:'http://127.0.0.1:3000'});
  try {
    await denied(context,'anonymous');
    const wrong=`wrong-founder-${randomUUID()}@example.invalid`;
    await identity(wrong,'owner');
    let client=session(context);
    expect((await client.auth.signInWithPassword({email:wrong,password})).error).toBeNull();
    await denied(context,'wrong-email-owner');
    expect((await client.auth.signOut()).error).toBeNull();
    const founderId=await identity('hello@xroga.com','member');
    client=session(context);
    expect((await client.auth.signInWithPassword({email:'hello@xroga.com',password})).error).toBeNull();
    await denied(context,'correct-email-no-role');
    expect((await admin.from('profiles').update({role:'owner'}).eq('id',founderId)).error).toBeNull();
    await denied(context,'owner-no-mfa');
    const enrolled=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Disposable CI factor'});expect(enrolled.error).toBeNull();expect(enrolled.data).toBeTruthy();
    const challenge=await client.auth.mfa.challenge({factorId:enrolled.data!.id});expect(challenge.error).toBeNull();
    const verified=await client.auth.mfa.verify({factorId:enrolled.data!.id,challengeId:challenge.data!.id,code:totp(enrolled.data!.totp.secret)});expect(verified.error).toBeNull();
    const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();expect(assurance.error).toBeNull();expect(assurance.data?.currentLevel).toBe('aal2');
    const response=await context.request.get('/os-preview/founder');expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Private interactive example');
    const page=await context.newPage();await page.goto('/os-preview/founder');
    await expect(page.getByRole('button',{name:'Scenario & Error Lab',exact:true})).toBeVisible();
    // Role revocation is read from the server, not a stale JWT role or UI toggle.
    expect((await admin.from('profiles').update({role:'member'}).eq('id',founderId)).error).toBeNull();
    await denied(context,'revoked-owner');
    await mkdir('test-results',{recursive:true});
    await writeFile('test-results/batch01-founder-evidence.json',JSON.stringify({environment:'disposable_supabase',anonymous:'DENIED',wrongEmailOwner:'DENIED',correctEmailNoRole:'DENIED',ownerWithoutMfa:'DENIED',realTotpAal2Owner:'ALLOWED',revokedRole:'DENIED',payloads:['HTML','RSC'],productionData:false},null,2));
  } finally {await context.close();}
});
