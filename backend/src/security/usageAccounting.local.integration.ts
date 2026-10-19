import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordCompletedProviderUsage } from '../ai/postCompletionAccounting.js';
import {persistUsageAccounting} from '../ai/usageAccounting.js';
import {createTenantContext,type TenantContext} from './tenantContext.js';

export function registerUsageAccountingTests(admin: SupabaseClient): void {
  test('real issued accounting wrapper isolates two owners with the same receipt and rejects forged context without writes',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const actors:string[]=[];
    t.after(async()=>{for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor)).error,null);});
    const period=`${new Date().toISOString().slice(0,7)}-01`;
    for(let index=0;index<2;index++){
      const created=await admin.auth.admin.createUser({email:`accounting-actor-${randomUUID()}@example.invalid`,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);actors.push(created.data.user.id);
      assert.equal((await admin.from('user_token_usage').upsert({user_id:created.data.user.id,input_tokens:0,output_tokens:0,model_usage:{},spent_usd:0,rollover_usd:0,plan_tier:'free',plan_budget_usd:0,quota_period_start:period})).error,null);
    }
    const contexts=actors.map(userId=>createTenantContext({userId,via:'persisted_owner'}));
    const input={receiptId:randomUUID(),modelId:'kimi_k3',poolRole:'kimi_k3',inputTokens:3,outputTokens:2,costUsd:0.1};
    const receipts=await Promise.all(contexts.map((context,index)=>persistUsageAccounting(context,{...input,...{userId:actors[1-index]}})));
    assert.notEqual(receipts[0].ledgerId,receipts[1].ledgerId);
    for(const [index,receipt]of receipts.entries()){assert.equal(receipt.userId,actors[index]);assert.equal(receipt.receiptId,input.receiptId);assert.equal(receipt.usage.user_id,actors[index]);assert.equal(receipt.inputTokens,input.inputTokens);assert.equal(receipt.outputTokens,input.outputTokens);assert.equal(receipt.costUsd,input.costUsd);assert.equal(receipt.replayed,false);}
    const read=async()=>{const usage=await admin.from('user_token_usage').select('*').in('user_id',actors).order('user_id');const ledger=await admin.from('ai_usage_ledger').select('*').in('user_id',actors).order('user_id');assert.equal(usage.error,null);assert.equal(ledger.error,null);return{usage:usage.data,ledger:ledger.data};};
    const before=await read();assert.equal(before.ledger?.length,2);
    await assert.rejects(persistUsageAccounting({...contexts[0],userId:actors[1]} as TenantContext,{...input,receiptId:randomUUID()}),{code:'TENANT_AUTH_REQUIRED'});
    assert.deepEqual(await read(),before);
    const replay=await persistUsageAccounting(contexts[0],input);assert.equal(replay.replayed,true);assert.equal(replay.ledgerId,receipts[0].ledgerId);assert.equal(replay.userId,actors[0]);
    assert.deepEqual(await read(),before);
    await assert.rejects(persistUsageAccounting(contexts[0],{...input,inputTokens:4}),{code:'USAGE_ACCOUNTING_UNCERTAIN'});
    assert.deepEqual(await read(),before);
  });
  test('completed provider consumer writes one atomic ledger receipt and fails truthfully when accounting owner disappears', async t => {
    assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1'); assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const created = await admin.auth.admin.createUser({ email: `completed-accounting-${randomUUID()}@example.invalid`, email_confirm: true });
    assert.equal(created.error, null); assert.ok(created.data.user); const owner = created.data.user.id;
    t.after(async () => { assert.equal((await admin.auth.admin.deleteUser(owner)).error, null); });
    const period = `${new Date().toISOString().slice(0, 7)}-01`;
    assert.equal((await admin.from('user_token_usage').upsert({ user_id: owner, input_tokens: 0, output_tokens: 0,
      model_usage: {}, spent_usd: 0, rollover_usd: 0, plan_tier: 'free', plan_budget_usd: 1.65, quota_period_start: period })).error, null);
    const first = await recordCompletedProviderUsage(owner, 'kimi_k3', 3, 2);
    assert.equal(first.inputTokensUsed, 3); assert.equal(first.outputTokensUsed, 2);
    const second = await recordCompletedProviderUsage(owner, 'kimi_k3', 3, 2);
    assert.equal(second.inputTokensUsed, 6); assert.equal(second.outputTokensUsed, 4);
    const before = await admin.from('ai_usage_ledger').select('*').eq('user_id', owner).order('id');
    assert.equal(before.error, null); assert.equal(before.data!.length, 2);
    assert.equal(new Set(before.data!.map(row => row.accounting_receipt_id)).size, 2);
    assert.equal((await admin.from('user_token_usage').delete().eq('user_id', owner)).error, null);
    await assert.rejects(recordCompletedProviderUsage(owner, 'kimi_k3', 3, 2), {
      code: 'POST_COMPLETION_ACCOUNTING_UNCERTAIN', providerCompleted: true, accountingUncertain: true, retryable: false,
    });
    const after = await admin.from('ai_usage_ledger').select('*').eq('user_id', owner).order('id');
    assert.equal(after.error, null); assert.deepEqual(after.data, before.data);
  });
  test('prepared atomic accounting serializes receipts and rolls back all component writes', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const created = await admin.auth.admin.createUser({ email: `accounting-${randomUUID()}@example.invalid`, email_confirm: true });
    assert.equal(created.error, null); assert.ok(created.data.user); const owner = created.data.user.id;
    t.after(async () => { assert.equal((await admin.auth.admin.deleteUser(owner)).error, null); });
    const period = `${new Date().toISOString().slice(0, 7)}-01`;
    assert.equal((await admin.from('user_token_usage').upsert({ user_id: owner, input_tokens: 0, output_tokens: 0,
      model_usage: {}, spent_usd: 0, rollover_usd: 0, plan_tier: 'free', plan_budget_usd: 0, quota_period_start: period })).error, null);
    const args = { p_user_id: owner, p_receipt_id: randomUUID(), p_model_id: 'kimi_k3', p_pool_role: 'kimi_k3', p_input: 3, p_output: 2, p_cost_usd: 0.1 };
    const rpc = (patch: Record<string, unknown> = {}) => admin.rpc('record_ai_usage_atomic', { ...args, ...patch });
    const same = await Promise.all([rpc(), rpc()]);
    for (const result of same) { assert.equal(result.error, null); assert.equal(result.data.userId, owner); }
    assert.equal(same[0].data.ledgerId, same[1].data.ledgerId);
    assert.deepEqual(same.map(row => row.data.replayed).sort(), [false, true]);
    const conflict = await rpc({ p_input: 4 }); assert.equal(conflict.error?.code, '23514');
    const absent = await rpc({ p_user_id: randomUUID() }); assert.equal(absent.error?.code, '23514');
    const distinct = await Promise.all(Array.from({ length: 4 }, () => rpc({ p_receipt_id: randomUUID() })));
    for (const result of distinct) assert.equal(result.error, null);
    const read = () => admin.from('user_token_usage').select('*').eq('user_id', owner).single();
    const current = await read(); assert.equal(current.error, null);
    assert.equal(current.data.input_tokens, 15); assert.equal(current.data.output_tokens, 10);
    assert.equal(Number(current.data.spent_usd), 0.5); assert.equal(Number(current.data.plan_budget_usd), 0);
    assert.equal(current.data.plan_tier, 'free'); assert.equal(current.data.model_usage.kimi_k3.input, 15);
    const ledger = await admin.from('ai_usage_ledger').select('id').eq('user_id', owner); assert.equal(ledger.error, null); assert.equal(ledger.data?.length, 5);
    const database = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.port, '54322'); assert.equal(database.pathname, '/postgres');
    const db = new pg.Client({ connectionString: database.href, ssl: false }); await db.connect();
    try {
      for (const role of ['anon', 'authenticated']) {
        await db.query('begin'); await db.query(`set local role ${role}`);
        await assert.rejects(db.query('select public.record_ai_usage_atomic($1,$2,$3,$4,$5,$6,$7)',
          [owner, randomUUID(), 'kimi_k3', 'kimi_k3', 3, 2, 0.1]), { code: '42501' });
        await db.query('rollback');
      }
      await db.query('begin');
      await db.query("update public.user_token_usage set quota_period_start='2000-01-01',plan_budget_usd=1.65,spent_usd=0.65,rollover_usd=0,input_tokens=90,output_tokens=80 where user_id=$1", [owner]);
      const transitioned = (await db.query('select public.record_ai_usage_atomic($1,$2,$3,$4,$5,$6,$7) as receipt',
        [owner, randomUUID(), 'kimi_k3', 'kimi_k3', 3, 2, 0.1])).rows[0].receipt;
      assert.equal(transitioned.period, period); assert.equal(transitioned.usage.input_tokens, 3);
      assert.equal(transitioned.usage.output_tokens, 2); assert.equal(Number(transitioned.usage.spent_usd), 0.1);
      assert.equal(Number(transitioned.usage.rollover_usd), 1);
      await db.query('rollback');
      // Each injected failure is isolated in a transaction that also removes its
      // temporary trigger. No caller fixtures or permanent failure controls.
      for (const stage of ['increment', 'merge', 'ledger', 'receipt']) {
        await db.query('begin');
        if (stage === 'merge') await db.query('update public.user_token_usage set model_usage=$2::jsonb where user_id=$1', [owner, JSON.stringify({ kimi_k3: { input: 'invalid' } })]);
        else {
          const table = stage === 'increment' ? 'user_token_usage' : 'ai_usage_ledger';
          const operation = stage === 'ledger' ? 'INSERT' : 'UPDATE';
          await db.query(`create function public.xb01_accounting_failure() returns trigger language plpgsql as $$ begin if NEW.user_id='${owner}'::uuid then raise exception 'Synthetic accounting failure'; end if; return NEW; end $$`);
          await db.query(`create trigger xb01_accounting_failure before ${operation} on public.${table} for each row execute function public.xb01_accounting_failure()`);
        }
        const before = (await db.query('select to_jsonb(u) as row from public.user_token_usage u where user_id=$1', [owner])).rows[0].row;
        await db.query('savepoint accounting_attempt');
        await assert.rejects(db.query('select public.record_ai_usage_atomic($1,$2,$3,$4,$5,$6,$7)', [owner, randomUUID(), 'kimi_k3', 'kimi_k3', 3, 2, 0.1]));
        await db.query('rollback to savepoint accounting_attempt');
        const after = (await db.query('select to_jsonb(u) as row from public.user_token_usage u where user_id=$1', [owner])).rows[0].row;
        assert.deepEqual(after, before, stage);
        assert.equal(Number((await db.query('select count(*) as count from public.ai_usage_ledger where user_id=$1', [owner])).rows[0].count), 5, stage);
        await db.query('rollback');
      }
    } finally { await db.query('rollback'); await db.end(); }
    assert.deepEqual((await read()).data, current.data);
  });
}
