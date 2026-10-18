import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {S3Client,PutObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {storeProjectFile} from './projectFiles.js';
import {digestBytes} from './fileDeliveryPolicy.js';

test('project file requires exact durable receipt and snapshots Buffer before ownership awaits',async t=>{
  const env={SUPABASE_URL:'http://127.0.0.1:49234',SUPABASE_SERVICE_ROLE_KEY:'synthetic',CLOUDFLARE_R2_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_R2_PRIVATE_BUCKET:'private-fixture',CLOUDFLARE_R2_ACCESS_KEY:'synthetic',CLOUDFLARE_R2_SECRET_KEY:'synthetic',CLOUDFLARE_R2_METADATA_READ_TOKEN:'synthetic'};
  const prior=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
  const owner=randomUUID(),project=randomUUID(),originalFetch=globalThis.fetch;let receipt='valid',release:(()=>void)|undefined,hold=false;
  const rows:Record<string,any>[]=[];let uploaded:Buffer|undefined,deleted=0;
  const logs:unknown[][]=[];t.mock.method(console,'warn',(...args:unknown[])=>{logs.push(args);});
  t.mock.method(S3Client.prototype,'send',async(command:unknown)=>{
    if(command instanceof PutObjectCommand){uploaded=Buffer.from(command.input.Body as Buffer);return{};}
    assert.ok(command instanceof DeleteObjectCommand);deleted++;return{};
  });
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.pathname==='/rest/v1/projects'){assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);if(hold)await new Promise<void>(resolve=>{release=resolve;});return Response.json({id:project});}
    if(url.hostname==='api.cloudflare.com')return Response.json({success:true,result:url.pathname.endsWith('/domains/managed')?{enabled:false}:url.pathname.endsWith('/domains/custom')?{domains:[]}:{name:'private-fixture'}});
    assert.equal(url.pathname,'/rest/v1/project_files');const row=JSON.parse(String(init?.body));rows.push(row);
    // The server accepted the row before the response was lost.
    if(receipt==='lost-response')throw new Error('PRIVATE_TRANSPORT_CANARY');
    if(receipt==='http-error')return Response.json({message:'PRIVATE_DATABASE_CANARY'},{status:503});
    return Response.json(receipt==='valid'?{id:row.id}:receipt==='missing'?{}:{id:randomUUID()});
  };
  try{
    const saved=await storeProjectFile(owner,project,'file.txt','fixture','text/plain','code');assert.equal(saved.id,rows[0].id);assert.ok(saved.fileUrl.endsWith(saved.id));
    for(const invalid of ['missing','different']){receipt=invalid;await assert.rejects(storeProjectFile(owner,project,'file.txt','fixture','text/plain','code'),{code:'FILE_RECORD_WRITE_UNAVAILABLE'});}
    receipt='valid';hold=true;const original=Buffer.from('original'),pending=storeProjectFile(owner,project,'file.bin',original,'application/octet-stream','other');
    while(!release)await new Promise(resolve=>setImmediate(resolve));original.fill(120);release();await pending;hold=false;
    assert.equal(uploaded?.toString(),'original');assert.equal(rows.at(-1)?.storage_metadata.sha256,digestBytes('original'));
    for(const failure of ['different','missing','lost-response','http-error']){
      receipt=failure;const committedBefore=rows.length;
      await assert.rejects(storeProjectFile(owner,project,'file.bin',Buffer.from('fixture'),'application/octet-stream','other'),{code:'FILE_RECORD_WRITE_UNAVAILABLE'});
      assert.equal(rows.length,committedBefore+1);assert.equal(rows.at(-1)?.storage_metadata.provider,'private_r2');assert.equal(deleted,0);
    }
    assert.equal(logs.length,4);assert.ok(logs.every(args=>args.length===1&&args[0]==='[private-files] persistence unconfirmed; uploaded object retained for reconciliation'));
  }finally{release?.();globalThis.fetch=originalFetch;for(const[key,value]of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
