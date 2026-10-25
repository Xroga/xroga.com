import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

test('identity admission binds original project and evidence across ownership and persistence waits', async () => {
  let entered!: () => void, resume!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { resume = resolve; });
  const input = { projectId: 'project', anonymousId: 'anonymous', evidenceReference: 'proof' };
  const expected = { tenant_id: 'actor', project_id: 'project', anonymous_id: 'anonymous', user_id: 'actor' };
  const db = { from(table: string) {
    const q = {
      select() { return q; }, eq() { return q; },
      async maybeSingle() {
        if (table === 'projects') { entered(); await gate; return { data: { id: 'project', user_id: 'actor' }, error: null }; }
        return { data: { role: 'member' }, error: null };
      },
    }; return q;
  },async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'link_growth_identity');assert.equal(args.p_actor,'actor');assert.equal(args.p_tenant,'actor');
    assert.equal(args.p_project,'project');assert.equal(args.p_anonymous,'anonymous');assert.equal(args.p_evidence,'proof');
    input.evidenceReference='changed-again';
    return{data:{id:'identity',...expected,evidence_reference:'proof'},error:null};
  } };
  const pending = new GrowthService(db as unknown as SupabaseClient).linkIdentity('actor', input);
  await started;
  input.projectId = 'foreign'; input.anonymousId = 'foreign'; input.evidenceReference = 'changed';
  resume();
  assert.equal((await pending).evidence_reference, 'proof');
});

test('identity linking preserves first owner and verifies exact mutation receipt', async () => {
  let outcome = 'valid';
  const db = { from(table: string) {
    const q = {
      select() { return q; }, eq() { return q; },
      async maybeSingle() { return { error: null, data: table === 'projects' ? { id: 'project', user_id: 'actor' } : { role: 'member' } }; },
    }; return q;
  },async rpc(name:string,args:Record<string,unknown>){
    assert.equal(name,'link_growth_identity');assert.equal(args.p_actor,'actor');assert.equal(args.p_tenant,'actor');
    assert.equal(args.p_project,'project');assert.equal(args.p_anonymous,'anonymous');assert.equal(args.p_evidence,'proof');
    const row={id:'identity',tenant_id:'actor',project_id:'project',anonymous_id:'anonymous',user_id:'actor',evidence_reference:'proof',
      ...(outcome.startsWith('wrong:')?{[outcome.slice(6)]:'foreign'}:{})};
    return{error:outcome==='conflict'?{code:'23505'}:['insertError','updateError'].includes(outcome)?{message:'private'}:null,
      data:outcome==='multiple'?[row,row]:row};
  } };
  const service = new GrowthService(db as unknown as SupabaseClient);
  const input = { projectId: 'project', anonymousId: 'anonymous', evidenceReference: 'proof' };
  assert.equal((await service.linkIdentity('actor', input)).id, 'identity');
  outcome = 'conflict'; await assert.rejects(service.linkIdentity('actor', input), { code: 'identity_conflict', statusCode: 409 });
  for (const invalid of ['insertError', 'updateError', 'multiple', 'wrong:tenant_id', 'wrong:project_id', 'wrong:user_id', 'wrong:anonymous_id', 'wrong:evidence_reference']) {
    outcome = invalid; await assert.rejects(service.linkIdentity('actor', input), { code: 'storage_unavailable', statusCode: 503 });
  }
});
