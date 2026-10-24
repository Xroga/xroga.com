import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createTenantContext} from './tenantContext.js';
import {persistOwnedTerminal} from './ownedTerminalPersistence.js';

export function registerTerminalIdentityTests(admin:SupabaseClient,getUsers:()=>readonly {id:string}[]):void{
  test('real simultaneous terminal autosaves preserve winning repository identity and foreign owner isolation',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),id=`terminal-${randomUUID()}`,suffix=randomUUID();
    t.after(async()=>{assert.equal((await admin.from('terminal_sessions').delete().eq('id',id).eq('user_id',owner.id)).error,null);});
    const context=createTenantContext({userId:owner.id,via:'local_jwt'});
    const first={id,user_id:owner.id,github_repo_name:`fixture/a-${suffix}`,terminal_number:1,created_at:'2026-01-01T00:00:00Z',messages:[{content:'first synthetic transcript'}]};
    const second={...first,github_repo_name:`fixture/b-${suffix}`,terminal_number:2,created_at:'2026-02-02T00:00:00Z',messages:[{content:'second synthetic transcript'}]};
    const columns='id,github_repo_name,terminal_number,created_at';
    const results=await Promise.all([first,second].map(row=>persistOwnedTerminal(admin,context,row,columns)));
    assert.ok(results.every(result=>result.error===null));assert.deepEqual(results[0].data,results[1].data);
    const persisted=await admin.from('terminal_sessions').select('*').eq('id',id).single();assert.equal(persisted.error,null);assert.ok(persisted.data);
    const winner=persisted.data.github_repo_name===first.github_repo_name?first:second;
    assert.equal(persisted.data.github_repo_name,winner.github_repo_name);assert.equal(persisted.data.terminal_number,winner.terminal_number);
    assert.equal(Date.parse(persisted.data.created_at),Date.parse(winner.created_at));assert.equal(persisted.data.user_id,owner.id);
    assert.ok(!JSON.stringify(results).includes('transcript'));
    await assert.rejects(persistOwnedTerminal(admin,createTenantContext({userId:other.id,via:'local_jwt'}),{...second,user_id:other.id},columns),{status:404});
    const after=await admin.from('terminal_sessions').select('*').eq('id',id).single();assert.equal(after.error,null);assert.deepEqual(after.data,persisted.data);
  });
}
