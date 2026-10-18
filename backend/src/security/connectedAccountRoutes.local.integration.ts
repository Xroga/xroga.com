import assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import express from 'express';
import {authMiddleware} from '../middleware/auth.js';
import integrationsRouter from '../routes/integrations.js';

/** Real disposable Auth and actual router. Every provider response is synthetic
 * and no provider request, connection or external action is forwarded. */
export function registerConnectedAccountRouteTests(getUsers:()=>readonly {id:string;token:string}[]):void{
  test('real authenticated connection routes bind provider sessions to the server actor and deny foreign changed or missing account authority',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),original=globalThis.fetch,oldKey=process.env.COMPOSIO_API_KEY;
    process.env.COMPOSIO_API_KEY='synthetic-provider-stub-only';
    t.after(()=>{globalThis.fetch=original;oldKey===undefined?delete process.env.COMPOSIO_API_KEY:process.env.COMPOSIO_API_KEY=oldKey;});
    const session='trs_phase_two_owner',otherSession='trs_phase_two_other',tool='GMAIL_FETCH_EMAILS';
    const createdFor:string[]=[],executions:{session:string;body:unknown}[]=[];
    let mode='normal',sessionReads=0;
    globalThis.fetch=async(input,init)=>{
      const url=new URL(String(input instanceof Request?input.url:input));
      if(url.origin!=='https://backend.composio.dev'){
        assert.equal(url.hostname,'127.0.0.1','Only disposable Auth/DB and this loopback API may receive non-stub traffic');
        return original(input,init);
      }
      const path=url.pathname,body=init?.body?JSON.parse(String(init.body)):{};
      const config=(user:string)=>({user_id:`xroga:${user}`,workbench:{enable:false,enable_proxy_execution:false},execute:{enable_multi_execute:false},tags:['readOnlyHint']});
      if(path.endsWith('/session')&&init?.method==='POST'){
        createdFor.push(body.user_id);assert.ok([`xroga:${owner.id}`,`xroga:${other.id}`].includes(body.user_id));
        const id=body.user_id===`xroga:${owner.id}`?session:otherSession;
        return Response.json({session_id:id,config:config(body.user_id.slice('xroga:'.length))});
      }
      if(path.endsWith('/config_history'))return Response.json({items:[]});
      if(path.endsWith(`/${session}`)||path.endsWith(`/${otherSession}`)){
        sessionReads++;const user=path.endsWith(`/${otherSession}`)?other.id:mode==='changed'&&sessionReads>1?other.id:owner.id;
        return Response.json({session_id:path.split('/').at(-1),config:mode==='missing'?{}:config(user)});
      }
      if(path.endsWith('/search'))return Response.json({tool_schemas:{fixture:{tool_slug:tool,toolkit:'gmail',description:'Synthetic read only',input_schema:{type:'object'}}}});
      if(path.endsWith('/toolkits'))return Response.json({items:[{slug:'gmail',name:'Gmail',connected_account:{id:'fixture-owner-account',status:'ACTIVE'}}]});
      if(path.endsWith('/execute')){
        assert.ok(path.includes(`/${session}/`));executions.push({session,body});
        return Response.json({data:{fixture:true,reference:'fixture-owner-read'},error:null});
      }
      assert.fail(`Unexpected synthetic provider path ${path}`);
    };
    const app=express();app.use(express.json());app.use('/api/integrations',authMiddleware,integrationsRouter);
    const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    t.after(async()=>{server.close();server.closeAllConnections();await once(server,'close');});
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const request=(path:string,token:string|undefined,body:unknown)=>fetch(`http://127.0.0.1:${address.port}/api/integrations/xroga-connect${path}`,{
      method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),
    });
    assert.equal((await request('/session',undefined,{userId:owner.id})).status,401);assert.deepEqual(createdFor,[]);
    for(const actor of [owner,other]){
      const response=await request('/session',actor.token,{userId:actor===owner?other.id:owner.id,tenantId:other.id});assert.equal(response.status,200);
      assert.equal((await response.json() as {sessionId:string}).sessionId,actor===owner?session:otherSession);
    }
    assert.deepEqual(createdFor,[`xroga:${owner.id}`,`xroga:${other.id}`]);
    const intent={sessionId:session,useCase:'Fetch synthetic fixture messages',toolSlug:tool,arguments:{fixture:'only'},userId:other.id,tenantId:other.id};
    const own=await request('/execute',owner.token,intent);assert.equal(own.status,200);assert.ok((await own.text()).includes('fixture-owner-read'));assert.equal(executions.length,1);
    const foreign=await request('/execute',other.token,{...intent,userId:owner.id});assert.equal(foreign.status,403);assert.ok(!(await foreign.text()).includes('fixture-owner-read'));assert.equal(executions.length,1);
    for(mode of ['changed','missing']){
      sessionReads=0;const denied=await request('/execute',owner.token,intent);assert.equal(denied.status,403);assert.equal(executions.length,1,'Changed or unavailable account authority must stop before the provider effect');
    }
    assert.equal((await request('/execute',undefined,intent)).status,401);assert.equal(executions.length,1);
  });
}
