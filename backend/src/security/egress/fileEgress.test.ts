import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTenantContext } from '../tenantContext.js';
import { preparedActionDigest } from '../authority/digest.js';
import { executeAuthorizedAction } from '../authority/enforce.js';
import type { PreparedAuthorityScope } from '../authority/types.js';
import { digestBytes } from '../../services/storage/fileDeliveryPolicy.js';
import { executeOwnedFileEgress } from './fileEgress.js';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import type { PublicPostTransport } from './urlPolicy.js';
function network(effect:()=>void):PublicPostTransport {return {resolve:async()=>[{address:'8.8.8.8',family:4}],open:async(_url,_pin,_signal,bytes)=>{
  effect();assert.equal(bytes.toString(),'ordinary private file');return Object.assign(Readable.from([Buffer.from('safe provider receipt')]),{statusCode:201,headers:{}}) as IncomingMessage;
}};}
const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
const projectId='33333333-3333-4333-8333-333333333333',fileId='44444444-4444-4444-8444-444444444444';
function fixture(content='ordinary private file',contentType='text/plain') {
  let row:any={id:fileId,project_id:projectId,file_name:'fixture.txt',file_path:'fixture.txt',file_url:null,file_type:'other',content,
    storage_metadata:{provider:'database',ownerId:owner,size:Buffer.byteLength(content),sha256:digestBytes(content),contentType},delivery_version:1,projects:{user_id:owner}};
  const db={from:(table:string)=>{assert.equal(table,'project_files');const filters:any={};const q:any={select:()=>q,eq:(k:string,v:string)=>{filters[k]=v;return q;},maybeSingle:async()=>{
    assert.equal(filters.id,fileId);assert.equal(filters.project_id,projectId);assert.equal(filters['projects.user_id'],owner);
    return {error:null,data:row};}};return q;}} as unknown as SupabaseClient;
  const destination='https://provider.example/upload',recipient='selected-recipient';
  const payload={projectId,fileId,destination,recipient,sha256:digestBytes(content)};
  const context=createTenantContext({userId:owner,via:'remote_getuser'});
  const scope:PreparedAuthorityScope={version:'1',userId:owner,tenantId:owner,provider:'fixture',connectedAccountId:'account-A',operation:'UPLOAD_FILE',targetDigest:preparedActionDigest(payload),planDigest:'b'.repeat(64),actionClass:'EXTERNAL_UPLOAD',risk:'write',projectId,runId:null,issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),nonce:'issued',maxSpendMicroUsd:null,currency:null};
  const claim={id:'original-claim',userId:owner,scopeDigest:preparedActionDigest(scope),expiresAt:scope.expiresAt,claimedAt:new Date().toISOString()};
  const binding={userId:owner,provider:scope.provider,connectedAccountId:scope.connectedAccountId,operation:scope.operation,targetDigest:scope.targetDigest,planDigest:scope.planDigest};
  return {db,context,scope,claim,revalidateBeforeEffect:async()=>claim,input:{context,binding,projectId,fileId,destination,recipient,purpose:'approved-file-transfer'},
    changeOwner:()=>{row={...row,projects:{user_id:foreign}};}};
}
test('actual owned-file adapter permits exact same-owner bytes and refuses foreign ownership before upload',async()=>{
  const f=fixture();let effects=0;
  await executeAuthorizedAction(f,async permit=>{
    assert.equal((await executeOwnedFileEgress({...f.input,authorityPermit:permit},async()=>{},f.db,network(()=>{effects++;}))).statusCode,201);
  });
  const other=fixture();other.changeOwner();
  await executeAuthorizedAction(other,async permit=>{
    await assert.rejects(executeOwnedFileEgress({...other.input,authorityPermit:permit},async()=>{},other.db,network(()=>{effects++;})),{status:404});
  });assert.equal(effects,1);
});
test('owner changes during receipt wait, altered recipient and secret file canaries produce zero uploads',async()=>{
  let effects=0;
  const f=fixture();
  await executeAuthorizedAction(f,async permit=>{
    await assert.rejects(executeOwnedFileEgress({...f.input,authorityPermit:permit},async()=>{f.changeOwner();},f.db,network(()=>{effects++;})),/outcome unavailable/);
  });
  const altered=fixture();
  await executeAuthorizedAction(altered,async permit=>{
    await assert.rejects(executeOwnedFileEgress({...altered.input,recipient:'foreign-recipient',authorityPermit:permit},async()=>{},altered.db,network(()=>{effects++;})),/denied/);
  });
  const secret=fixture('SYNTHETIC_CREDENTIAL_CANARY_MUST_NOT_UPLOAD');let receipt='';
  await executeAuthorizedAction(secret,async permit=>{
    await assert.rejects(executeOwnedFileEgress({...secret.input,authorityPermit:permit},async r=>{receipt=JSON.stringify(r);},secret.db,network(()=>{effects++;})),/denied/);
  });assert.equal(effects,0);assert.ok(!receipt.includes('SYNTHETIC_CREDENTIAL_CANARY'));
});

test('uninspected binary documents cannot bypass the text credential boundary',async()=>{
  const f=fixture('ordinary private file','application/pdf');let effects=0;
  await executeAuthorizedAction(f,async permit=>{
    await assert.rejects(executeOwnedFileEgress({...f.input,authorityPermit:permit},async()=>{},f.db,network(()=>{effects++;})),/Unsupported external file inspection/);
  });assert.equal(effects,0);
});

test('ownership revocation during durable authority revalidation prevents dispatch',async()=>{
  const f=fixture();let effects=0;
  await executeAuthorizedAction({...f,revalidateBeforeEffect:async()=>{f.changeOwner();return f.claim;}},async permit=>{
    await assert.rejects(executeOwnedFileEgress({...f.input,authorityPermit:permit},async()=>{},f.db,network(()=>{effects++;})),/outcome unavailable/);
  });assert.equal(effects,0);
});
