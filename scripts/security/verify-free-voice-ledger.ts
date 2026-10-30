/** Isolated real Supabase/HTTP/JWT/accounting proof, stubbed speech only. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
let phase='isolation-admission';
async function main(){
assert.equal(process.env.CI,'true','CI-only isolated verification');
assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1','Disposable database required');
const dbUrl=new URL(process.env.SUPABASE_URL??'');
assert.ok(['127.0.0.1','localhost'].includes(dbUrl.hostname),'Production database forbidden');
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.SUPABASE_ANON_KEY,'Isolated keys required');
const require=createRequire(resolve('backend/package.json'));
const express=require('express');const {createClient}=require('@supabase/supabase-js');
process.env.CLOUDFLARE_VOICE_ACCOUNT_ID='a'.repeat(32);
process.env.CLOUDFLARE_VOICE_API_TOKEN='synthetic-free-provider-only';
process.env.CLOUDFLARE_VOICE_FREE_PLAN_CONFIRMED='true';
const {authMiddleware}=await import(pathToFileURL(resolve('backend/src/middleware/auth.ts')).href);
const {default:voice}=await import(pathToFileURL(resolve('backend/src/routes/voice.ts')).href);
const admin=createClient(dbUrl.href,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const guest=createClient(dbUrl.href,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const password='Isolated-'+randomUUID()+'-9xA!';const email='voice-fixture-'+randomUUID()+'@example.invalid';
phase='create-isolated-user';
const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);
const owner=created.data.user.id;
phase='isolated-sign-in';
const signed=await guest.auth.signInWithPassword({email,password});assert.ifError(signed.error);
const access=signed.data.session.access_token;
const audio=Buffer.alloc(44+44100);audio.write('RIFF');audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);
audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(22050,24);audio.writeUInt32LE(44100,28);
audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(44100,40);
for(let at=44;at<audio.length;at+=2)audio.writeInt16LE(3000,at);
const original=globalThis.fetch;let providerCalls=0;
globalThis.fetch=async(input,init)=>{
 const url=new URL(String(input));
 if(url.hostname==='api.cloudflare.com'){
  providerCalls++;assert.equal(url.pathname,'/client/v4/accounts/'+'a'.repeat(32)+'/ai/run/@cf/openai/whisper-large-v3-turbo');
  assert.equal(init?.redirect,'manual');
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-free-provider-only');
  assert.equal(JSON.parse(String(init?.body)).audio,audio.toString('base64'));
  return Response.json({success:true,errors:[],result:{text:'synthetic ledger fixture',transcription_info:{duration:1,language:'en'}}},{headers:{'cf-ray':'synthetic-ledger-receipt'}});
 }
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Unapproved external transport');
 return original(input,init);
};
const app=express();app.use('/api/voice',authMiddleware,voice);
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
const address=server.address();assert.ok(address&&typeof address!=='string');
const endpoint='http://127.0.0.1:'+address.port+'/api/voice/transcribe-free';
try{
 phase='unauthenticated-denials';
 for(const authorization of [undefined,'Bearer synthetic-invalid']){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'audio/wav',...(authorization?{Authorization:authorization}:{})},body:audio});
  assert.equal(response.status,401);assert.equal(providerCalls,0);
 }
 phase='authenticated-free-transcription';
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'audio/wav',Authorization:'Bearer '+access},body:audio});
 // Never print a response body on failure, it may contain a future unsafe error.
 assert.equal(response.status,200,'Authenticated real-ledger admission failed');
 assert.equal((await response.json()).text,'synthetic ledger fixture');assert.equal(providerCalls,1);
 phase='canonical-audit-and-settlement';
 const events=await admin.from('production_audit_log').select('user_id,actor_id,outcome,metadata').eq('user_id',owner).eq('action','voice_provider_request');
 assert.ifError(events.error);const done=events.data.filter((r:any)=>r.outcome==='COMPLETED');assert.equal(done.length,1);
 assert.equal(done[0].actor_id,owner);assert.equal(done[0].metadata.usage.cost,0);assert.equal(done[0].metadata.usage.seconds,1);
 const hold=await admin.from('xroga_provider_reservations').select('*').eq('id',done[0].metadata.reservationId).single();
 assert.ifError(hold.error);assert.equal(hold.data.user_id,owner);assert.equal(hold.data.status,'settled');assert.equal(Number(hold.data.settled_micro_usd),0);
 assert.equal(hold.data.provider_request_id,'synthetic-ledger-receipt');
 const proof={scope:'ISOLATED_REAL_SUPABASE_REAL_JWT_HTTP_CANONICAL_LEDGER_STUBBED_SPEECH',source:process.env.XB01_TEST_SOURCE_SHA,
  missingTokenDenied:true,invalidTokenDenied:true,issuedActor:true,reservationSettledZero:true,completedAuditOwnerBound:true,providerCalls,productionAccess:false,actualSpeechInference:false};
 writeFileSync(resolve(process.env.RUNNER_TEMP??'.','voice-free-real-ledger.json'),JSON.stringify(proof,null,2)+'\n');
 console.log('PASS_ISOLATED_REAL_JWT_AND_ZERO_COST_VOICE_LEDGER_NOT_REAL_ASR');
}finally{
 globalThis.fetch=original;audio.fill(0);server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));
 const cleaned=await admin.auth.admin.deleteUser(owner);assert.ifError(cleaned.error);
}
}
void main().catch(()=>{console.error('FAIL_ISOLATED_FREE_VOICE_LEDGER:'+phase);process.exitCode=1;});
