import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { deleteUserProviderKey, saveUserProviderKey } from './userProviderKeys.js';

test('BYOK save carries its admitted revision, rejects a concurrent revoke and permits a fresh reconnect',async()=>{
  let revision=randomUUID(),revoked=true,mode='race';
  let deferredSave:(()=>void)|undefined;
  let admittedResolve:()=>void=()=>{};
  const admitted=new Promise<void>(resolve=>{admittedResolve=resolve;});
  const calls:Array<{path:string;body:Record<string,unknown>}>=[];
  const server=createServer((req,res)=>{
    let text='';req.on('data',chunk=>{text+=chunk;});req.on('end',()=>{
      const body=text?JSON.parse(text):{},path=req.url??'';calls.push({path,body});
      res.setHeader('Content-Type','application/json');
      if(path.endsWith('/prepare_provider_key_write')) {
        if(mode==='unavailable'){res.statusCode=404;res.end(JSON.stringify({code:'PGRST202',message:'fixture missing migration'}));}
        else res.end(JSON.stringify(revision));
      } else if(path.endsWith('/save_provider_key_if_current')) {
        const save=()=>{
          const accepted=body.p_revision===revision;
          if(accepted){revision=randomUUID();revoked=false;}
          res.end(JSON.stringify(accepted));
        };
        if(mode==='race'){deferredSave=save;admittedResolve();}else save();
      } else if(path.endsWith('/revoke_provider_key')) {
        revision=randomUUID();revoked=true;res.end('true');
      } else if(path==='/storage/v1/bucket') {
        res.end(JSON.stringify([{id:'xroga-github-tokens',name:'xroga-github-tokens',public:false}]));
      } else if(path.startsWith('/storage/')) res.end('{}');
      else {res.statusCode=500;res.end(JSON.stringify({message:'unexpected fixture request'}));}
    });
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const names=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','USER_SECRETS_ENCRYPTION_KEY','DATABASE_URL','SUPABASE_DB_URL','SUPABASE_DB_PASSWORD'];
  const before=new Map(names.map(name=>[name,process.env[name]]));
  try {
    for(const name of names)delete process.env[name];
    process.env.SUPABASE_URL=`http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-loopback-key';
    process.env.USER_SECRETS_ENCRYPTION_KEY='synthetic-encryption-fixture-not-a-secret';
    const user='11111111-1111-4111-8111-111111111111';
    const stale=saveUserProviderKey(user,'openai','SYNTHETIC_NEW_KEY');
    const denied=assert.rejects(stale,{code:'CREDENTIAL_WRITE_CONFLICT'});
    await admitted;
    await deleteUserProviderKey(user,'openai');
    assert.equal(revoked,true);assert.ok(deferredSave);deferredSave();await denied;
    assert.equal(revoked,true);
    assert.equal(calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).length,1,'Conflicts must not be retried against a fresh revision');
    assert.ok(!calls.some(call=>call.path.includes('/rest/v1/user_integrations')),'No fallback upsert');
    const saveCall=calls.find(call=>call.path.endsWith('/save_provider_key_if_current'))!;
    assert.equal(saveCall.body.p_owner_id,user);assert.equal(saveCall.body.p_provider,'apikey_openai');
    assert.match(String(saveCall.body.p_access_token),/^v1:/);assert.ok(!String(saveCall.body.p_access_token).includes('SYNTHETIC_NEW_KEY'));
    mode='reconnect';
    const freshRevision=revision;
    assert.equal((await saveUserProviderKey(user,'openai','SYNTHETIC_FRESH_KEY')).connected,true);
    assert.equal(revoked,false);assert.notEqual(revision,freshRevision);
    const latest=calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).at(-1)!;
    assert.equal(latest.body.p_revision,freshRevision);
    mode='unavailable';
    const count=calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).length;
    await assert.rejects(saveUserProviderKey(user,'openai','SYNTHETIC_UNSAVED_KEY'),{message:'Credential could not be saved. Retry shortly.'});
    assert.equal(calls.filter(call=>call.path.endsWith('/save_provider_key_if_current')).length,count);
    // Wait for the successful save's optional mirror request before restoring env.
    await new Promise<void>(resolve=>setTimeout(resolve,50));
  } finally {
    for(const [name,value]of before){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
