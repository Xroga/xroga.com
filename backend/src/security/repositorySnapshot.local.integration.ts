import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import pg from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabaseUniversalStore} from '../synthesis/universalPersistence.js';
import {buildIndex} from '../synthesis/repositoryIndex.js';
import {createTenantContext} from './tenantContext.js';

export function registerRepositorySnapshotTests(admin:SupabaseClient):void{
  test('real repository snapshots replace all files atomically and preserve owner isolation under rollback and concurrency',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const users:string[]=[];
    t.after(async()=>{for(const id of users)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);});
    for(let n=0;n<2;n++){
      const created=await admin.auth.admin.createUser({email:`repo-snapshot-${randomUUID()}@example.invalid`,email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);users.push(created.data.user.id);
    }
    const [owner,other]=users,identity={projectId:randomUUID(),repositoryId:'fixture/repo',repositoryOwner:'fixture',repositoryName:'repo',branch:'main'};
    const indexId=`${identity.projectId}:${identity.repositoryId}:${identity.branch}`;
    const store=new SupabaseUniversalStore(admin,createTenantContext({userId:owner,via:'persisted_owner'}));
    const foreign=new SupabaseUniversalStore(admin,createTenantContext({userId:other,via:'persisted_owner'}));
    const make=(commit:string,count:number)=>buildIndex({identity,commitSha:commit,files:Array.from({length:count},(_,i)=>({path:`${commit}-${i}.txt`,content:commit}))});
    const initial=make('initial',2),replacement=make('replacement',3);
    await store.save(initial);assert.deepEqual((await store.load(identity))?.files.map(f=>f.filePath),initial.files.map(f=>f.filePath));
    assert.equal(await foreign.load(identity),null);await assert.rejects(foreign.save(replacement),{status:404});
    const malformed={...replacement,files:[replacement.files[0],replacement.files[0]]};
    await assert.rejects(store.save(malformed),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    assert.equal((await store.load(identity))?.indexedCommitSha,'initial');
    assert.equal((await store.load(identity))?.files.length,2);
    const dbUrl=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(dbUrl.hostname,'127.0.0.1');assert.equal(dbUrl.port,'54322');assert.equal(dbUrl.pathname,'/postgres');
    const writer=new pg.Client({connectionString:dbUrl.href,ssl:false});await writer.connect();
    try{
      await writer.query('begin');
      await writer.query('select public.save_repository_index_snapshot($1,$2,$3::jsonb)',[owner,indexId,JSON.stringify(replacement)]);
      const during=await store.load(identity);assert.equal(during?.indexedCommitSha,'initial');assert.equal(during?.files.length,2);
      await writer.query('commit');
      const after=await store.load(identity);assert.equal(after?.indexedCommitSha,'replacement');assert.equal(after?.files.length,3);
      for(const role of ['anon','authenticated']){
        for(const query of ['select public.load_repository_index_snapshot($1,$2)','select public.save_repository_index_snapshot($1,$2,$3::jsonb)']){
          await writer.query('begin');await writer.query(`set local role ${role}`);
          await assert.rejects(writer.query(query,query.includes('$3')?[owner,indexId,JSON.stringify(initial)]:[owner,indexId]),{code:'42501'});
          await writer.query('rollback');
        }
      }
    }finally{await writer.query('rollback');await writer.end();}
    // Separate HTTP requests race on the same locked header. No mixed child set.
    await Promise.all([store.save(make('left',4)),store.save(make('right',5))]);
    const final=await store.load(identity);assert.ok(final);
    assert.ok(['left','right'].includes(final.indexedCommitSha));
    assert.equal(final.files.length,final.indexedCommitSha==='left'?4:5);
    assert.ok(final.files.every(file=>file.filePath.startsWith(`${final.indexedCommitSha}-`)));
    // Corrupt legacy child ownership never becomes readable or silently deleted.
    assert.equal((await admin.from('repository_index_files').update({user_id:other}).eq('index_id',indexId).eq('file_path',final.files[0].filePath)).error,null);
    assert.equal(await store.load(identity),null);
    await assert.rejects(store.save(initial),{status:404});
    const retained=await admin.from('repository_index_files').select('user_id').eq('index_id',indexId).eq('file_path',final.files[0].filePath).single();
    assert.equal(retained.error,null);assert.equal(retained.data.user_id,other);
  });
}
