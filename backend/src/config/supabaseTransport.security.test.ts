import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {randomUUID} from 'node:crypto';
import {saveUserProviderKey} from '../services/integrations/userProviderKeys.js';

test('real canonical credential mirror SDK cannot forward sealed credentials or service apikey through an HTTP redirect',async t=>{
  const previous=['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].map(k=>process.env[k]);
  const owner=randomUUID(),provider='apikey_openai';let row:Record<string,unknown>|undefined,outside=0,outsideApiKey='',wireUploads=0;
  let uploadFinished!:()=>void;const finished=new Promise<void>(r=>uploadFinished=r);
  const sink=createServer((req,res)=>{outside++;outsideApiKey=String(req.headers.apikey??'');res.writeHead(200,{'content-type':'application/json'}).end('{}');});
  const api=createServer(async(req,res)=>{
    const path=new URL(req.url!,'http://fixture').pathname;const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};
    let response:unknown;
    if(path.endsWith('/prepare_provider_key_write'))response=randomUUID();
    else if(path.endsWith('/save_provider_key_if_current')){assert.equal(body.p_owner_id,owner);assert.equal(body.p_provider,provider);row={user_id:owner,provider,access_token:body.p_access_token,metadata:body.p_metadata,credential_revision:randomUUID()};response=true;}
    else if(path==='/rest/v1/user_integrations')response=row;
    else if(path==='/storage/v1/bucket')response=[{id:'xroga-github-tokens',public:false}];
    else if(path.startsWith('/storage/v1/object/')){wireUploads++;assert.match(body.access_token,/^vault:v3:/);assert.ok(!JSON.stringify(body).includes('SYNTHETIC_PRIVATE_KEY'));res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end();return;}
    else throw Error('Unexpected fixture request '+path);
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(response));
  });await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>api.listen(0,'127.0.0.1',r));
  Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:`http://127.0.0.1:${(api.address() as AddressInfo).port}`,SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role-only'});
  const nativeFetch=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    try{return await nativeFetch(input,init);}finally{if(String(input).includes('/storage/v1/object/'))uploadFinished();}
  });
  try{
    assert.equal((await saveUserProviderKey(owner,'openai','SYNTHETIC_PRIVATE_KEY')).connected,true,'Canonical save succeeds independently of its optional encrypted mirror');
    await Promise.race([finished,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('Mirror did not complete')),5000);timer.unref();})]);
    assert.equal(wireUploads,1);assert.equal(outside,0,'No encrypted mirror or service credential follows a redirect');assert.equal(outsideApiKey,'');
  }finally{api.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>api.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
