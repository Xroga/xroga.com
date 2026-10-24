import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTenantContext } from '../../security/tenantContext.js';
import { digestBytes,signFileLink,verifyFileLink,selectFileRange,fileResponseHeaders,type OwnedFileRow } from './fileDeliveryPolicy.js';
import { readPrivateFile,publicFileView } from './privateFileDelivery.js';
import { privateR2Configuration,assertOwnedR2Key,verifyPrivateR2Bucket,buildR2Key } from '../../lib/r2.js';
import { storeUserFile,readStoredFile } from './projectFiles.js';
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333',fid='44444444-4444-4444-8444-444444444444';
const scope=createTenantContext({userId:uid,via:'persisted_owner'}),foreign=createTenantContext({userId:other,via:'persisted_owner'});
const env={FILE_DELIVERY_SIGNING_KEY:Buffer.alloc(32,7).toString('base64')};
const row=():OwnedFileRow=>({id:fid,project_id:pid,file_name:'fixture.html',file_type:'code',file_path:'fixture.html',file_url:'https://legacy.invalid/private',content:'safe fixture',storage_metadata:{provider:'database',ownerId:uid,size:12,sha256:digestBytes('safe fixture'),contentType:'text/plain'},delivery_version:1,projects:{user_id:uid}});
test('signed file capability binds actor/resource/bytes/version and denies tampering and expiry',async()=>{
  const file=row(),now=1700000000000,{token}=await signFileLink(scope,file,60,now,env);
  await verifyFileLink(scope,file,token,now,env);
  for(const altered of [{...file,id:pid},{...file,project_id:fid},{...file,delivery_version:2},{...file,content:'edited'}, {...file,projects:{user_id:other}}])await assert.rejects(verifyFileLink(scope,altered,token,now,env),{status:404});
  await assert.rejects(verifyFileLink(foreign,file,token,now,env),{status:404});
  await assert.rejects(verifyFileLink(scope,file,token,now+60000,env),{status:404});
  await assert.rejects(verifyFileLink(scope,file,token.slice(0,-8)+'tampered',now,env),{status:404});
});
test('file links require a dedicated strong key, bounded expiry and issued context, no dev/provider fallback',async()=>{
  for(const config of [{},{FILE_DELIVERY_SIGNING_KEY:'weak'}, {SUPABASE_SERVICE_ROLE_KEY:'not-a-file-signing-key'}])await assert.rejects(signFileLink(scope,row(),60,1700000000000,config),{status:503});
  for(const ttl of [0,301,Infinity,1.5])await assert.rejects(signFileLink(scope,row(),ttl,1700000000000,env),{status:400});
  await assert.rejects(signFileLink({...scope},row(),60,1700000000000,env));
});
test('owner database content passes checksum; corrupt or foreign content cannot produce bytes',async()=>{
  assert.equal((await readPrivateFile(scope,row())).buffer.toString(),'safe fixture');
  await assert.rejects(readPrivateFile(foreign,row()),{status:404});
  await assert.rejects(readPrivateFile(scope,{...row(),content:'changed'}),{status:503});
  await assert.rejects(readPrivateFile(scope,{...row(),storage_metadata:{...(row().storage_metadata as object),ownerId:other}}),{status:503});
});
test('legacy public/data URL and raw-key delivery never fetch or fabricate success',async()=>{
  let calls=0;
  for(const url of ['https://legacy.invalid/file','data:text/plain;base64,c2VjcmV0'])await assert.rejects(readPrivateFile(scope,{...row(),storage_metadata:null,content:null,file_url:url},async()=>{calls++;return {buffer:Buffer.from('bad'),contentType:'text/plain'};}),{status:503});
  assert.equal(calls,0);await assert.rejects(storeUserFile(uid,'fixture','bytes','text/plain'));await assert.rejects(readStoredFile(`users/${uid}/file`));
});
test('private object path is owner-bound before any injected object read',async()=>{
  let calls=0;const file={...row(),content:null,file_path:`users/${other}/fixture`,storage_metadata:{provider:'private_r2',ownerId:uid,size:12,sha256:digestBytes('safe fixture'),contentType:'text/plain',bucket:'private-fixture',key:`users/${other}/fixture`}};
  await assert.rejects(readPrivateFile(scope,file,async()=>{calls++;return {buffer:Buffer.from('safe fixture'),contentType:'text/plain'};}),{status:404});assert.equal(calls,0);
});
test('public file serialization does not disclose storage internals or unsafe URLs',()=>{
  const safe=publicFileView(row() as unknown as Record<string,unknown>);assert.equal(safe.file_url,`/api/private-files/${pid}/${fid}`);assert.equal('storage_metadata'in safe,false);assert.equal('delivery_version'in safe,false);
  assert.equal(publicFileView({...row(),content:null,storage_metadata:null}).file_url,null);
});
test('file range parser has bounded single-range and suffix semantics',()=>{
  const buffer=Buffer.from('0123456789');assert.equal(selectFileRange(buffer,'bytes=2-4').body.toString(),'234');assert.equal(selectFileRange(buffer,'bytes=-3').body.toString(),'789');assert.equal(selectFileRange(buffer,'bytes=5-').body.toString(),'56789');
  for(const range of ['bytes=2-1','bytes=10-','bytes=-0','bytes=0-1,3-4','bytes=','bytes=0-'+ '9'.repeat(100)])assert.throws(()=>selectFileRange(buffer,range),{status:416});
});
test('untrusted active file MIME is attachment-only, with no cache/referrer/sniffing',()=>{
  const headers=fileResponseHeaders('a\r\nb.html','text/html');assert.equal(headers['Content-Type'],'application/octet-stream');assert.match(headers['Content-Disposition'],/^attachment/);assert.ok(!headers['Content-Disposition'].includes('\r'));assert.equal(headers['Cache-Control'],'private, no-store');assert.equal(headers['X-Content-Type-Options'],'nosniff');
});
test('private R2 configuration has no legacy/public bucket fallback and keys cannot escape owner prefix',()=>{
  assert.throws(()=>privateR2Configuration({CLOUDFLARE_R2_BUCKET:'xroga-assets',CLOUDFLARE_R2_PUBLIC_URL:'https://public.invalid'}),{status:503});
  for(const key of [`users/${other}/file`,`users/${uid}/../file`,`users/${uid}/file\\secret`])assert.throws(()=>assertOwnedR2Key(key,uid),{status:404});
  assert.notEqual(buildR2Key(uid,'same'),buildR2Key(uid,'same'));
});
test('private bucket metadata rejects public/unknown state using GET-only fixed endpoints',async()=>{
  const config={accountId:'a'.repeat(32),bucket:'private-fixture',accessKey:'fixture',secretKey:'fixture',metadataReadToken:'fixture'};
  let forbiddenCalls=0;
  await assert.rejects(verifyPrivateR2Bucket({...config,accountId:'../other-account'},async()=>{forbiddenCalls++;throw new Error('must not fetch');}),{status:503});
  assert.equal(forbiddenCalls,0);
  for(const enabled of [true,undefined])await assert.rejects(verifyPrivateR2Bucket(config,async input=>new Response(JSON.stringify({success:true,result:String(input).endsWith('/domains/managed')?{enabled}:{name:config.bucket,domains:[]}}))),{status:503});
  let calls=0;await verifyPrivateR2Bucket(config,async(input,options)=>{calls++;assert.equal(options?.method,'GET');assert.equal(options?.redirect,'error');assert.match(String(input),/^https:\/\/api.cloudflare.com\//);return new Response(JSON.stringify({success:true,result:String(input).endsWith('/domains/managed')?{enabled:false}:{name:config.bucket,domains:[]}}));});assert.equal(calls,3);
});
