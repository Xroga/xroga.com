import assert from 'node:assert/strict';
import test from 'node:test';
import {runWebIntelligence} from './webIntelligence.js';
import {createTenantContext} from '../../security/tenantContext.js';
import {isTerminalModelFailure} from '../providerRuntime.js';

test('X research cannot publish unreserved, unaccounted provider output or dispatch on a raw user ID', async()=>{
  const previous=globalThis.fetch, key=process.env.XAI_API_KEY;
  process.env.XAI_API_KEY='synthetic-xai-security-only';
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({id:'unaccounted',output:[{content:[{type:'output_text',text:'unaccounted evidence',annotations:[{url:'https://x.com/example/status/1'}]}]}]});};
  try{
    const userId='11111111-1111-4111-8111-111111111111';
    const context=createTenantContext({userId,via:'remote_getuser'});
    for(const dispatchScope of [undefined,{userId,context},{userId,context:{...context}}]){
      await assert.rejects(runWebIntelligence({userId,dispatchScope,prompt:'Read https://x.com/example/status/1'}),error=>{
        assert.equal(isTerminalModelFailure(error),true);
        return true;
      });
    }
    assert.equal(calls,0,'No credential-bearing wire request, accounting fallback, or second provider');
  }finally{globalThis.fetch=previous;if(key===undefined)delete process.env.XAI_API_KEY;else process.env.XAI_API_KEY=key;}
});
