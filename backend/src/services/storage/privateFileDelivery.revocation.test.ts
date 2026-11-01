import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { digestBytes } from './fileDeliveryPolicy.js';
import { downloadPrivateFile } from './privateFileDelivery.js';

test('actual private R2 delivery rechecks ownership and file revision after the asynchronous object read', async t => {
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  const project='33333333-3333-4333-8333-333333333333',file='44444444-4444-4444-8444-444444444444';
  const context=createTenantContext({userId:owner,via:'persisted_owner'}),bytes=Buffer.from('synthetic private bytes');
  const env={CLOUDFLARE_R2_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_R2_PRIVATE_BUCKET:'private-fixture',CLOUDFLARE_R2_ACCESS_KEY:'synthetic',CLOUDFLARE_R2_SECRET_KEY:'synthetic',CLOUDFLARE_R2_METADATA_READ_TOKEN:'synthetic'};
  const prior=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
  let row:any,mode='normal',metadata=0,reads=0;
  const reset=()=>{row={id:file,project_id:project,file_name:'fixture.txt',file_path:`users/${owner}/fixture.txt`,file_url:null,content:null,delivery_version:1,
    projects:{user_id:owner},storage_metadata:{provider:'private_r2',ownerId:owner,bucket:'private-fixture',key:`users/${owner}/fixture.txt`,size:bytes.length,sha256:digestBytes(bytes),contentType:'text/plain'}};};
  const db={from:(table:string)=>{assert.equal(table,'project_files');const filters:Record<string,string>={};const q:any={select:()=>q,eq:(key:string,value:string)=>{filters[key]=value;return q;},maybeSingle:async()=>{
    assert.deepEqual(filters,{id:file,project_id:project,'projects.user_id':owner});return {data:structuredClone(row),error:null};}};return q;}} as unknown as SupabaseClient;
  t.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
    metadata++;const url=new URL(String(input));assert.equal(url.hostname,'api.cloudflare.com');assert.equal(init?.redirect,'error');
    return Response.json({success:true,result:url.pathname.endsWith('/domains/managed')?{enabled:false}:url.pathname.endsWith('/domains/custom')?{domains:[]}:{name:'private-fixture'}});
  });
  t.mock.method(S3Client.prototype,'send',async(command:unknown)=>{
    assert.ok(command instanceof GetObjectCommand);assert.equal(command.input.Bucket,'private-fixture');assert.equal(command.input.Key,`users/${owner}/fixture.txt`);reads++;
    return {ContentLength:bytes.length,ContentType:'text/plain',Body:(async function*(){
      if(mode==='owner')row.projects.user_id=other;
      if(mode==='revision')row.delivery_version++;
      if(mode==='metadata')row.storage_metadata.sha256='a'.repeat(64);
      yield bytes;
    })()};
  });
  try {
    reset();assert.equal((await downloadPrivateFile(context,project,file,undefined,db)).buffer.toString(),bytes.toString());
    for(const change of ['owner','revision','metadata']){
      reset();mode=change;
      await assert.rejects(downloadPrivateFile(context,project,file,undefined,db),change==='owner'?{status:404}:{status:409});
    }
    reset();mode='normal';const before={metadata,reads};row.projects.user_id=other;
    await assert.rejects(downloadPrivateFile(context,project,file,undefined,db),{status:404});
    await assert.rejects(downloadPrivateFile({...context} as TenantContext,project,file,undefined,db),{status:401});
    assert.deepEqual({metadata,reads},before);
  } finally {for(const[key,value]of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
