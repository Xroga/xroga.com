import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {assertDisposableSource,collectSchemaCatalog,validateCurrentMigrationAdditions} from './schema-catalog.mjs';

test('current feedback sidebar and workflow additions are exact migration-bound evidence, never a broad missing-table waiver',()=>{
  const additions=JSON.parse(readFileSync(new URL('../../docs/xroga/security/current-migration-additions.json',import.meta.url),'utf8'));
  const files=additions.tables.flatMap(t=>[t.migration,t.authorizationMigration]);
  const read=file=>readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8');
  assert.equal(validateCurrentMigrationAdditions(additions,files,read).length,25);
  assert.throws(()=>validateCurrentMigrationAdditions(additions,[],read));
  assert.throws(()=>validateCurrentMigrationAdditions(additions,files,file=>read(file)+'\n-- source drift'));
  const extra=structuredClone(additions);extra.tables.push({...extra.tables[0],table_name:'unreviewed'});
  assert.throws(()=>validateCurrentMigrationAdditions(extra,files,read));
  const renamed=structuredClone(additions);renamed.tables[0].table_name='foreign';
  assert.throws(()=>validateCurrentMigrationAdditions(renamed,files,read));
  assert.throws(()=>validateCurrentMigrationAdditions({...additions,historicalCatalogUnchanged:false},files,read));
  for(let index=0;index<additions.tables.length;index++){
    const missing=structuredClone(additions);missing.tables.splice(index,1);
    assert.throws(()=>validateCurrentMigrationAdditions(missing,files,read));
    const wrong=structuredClone(additions);wrong.tables[index].authorizationMigration=files.find(file=>file!==wrong.tables[index].authorizationMigration);
    assert.throws(()=>validateCurrentMigrationAdditions(wrong,files,read));
    const live=structuredClone(additions);live.tables[index].productionChanges=true;
    assert.throws(()=>validateCurrentMigrationAdditions(live,files,read));
  }
});

test('disposable source attestation rejects missing or substituted merge/head identities',()=>{
  const sha='a'.repeat(40);assert.equal(assertDisposableSource(sha,sha),sha);
  for(const pair of [[sha,'b'.repeat(40)],[sha,undefined],['unknown',sha]])assert.throws(()=>assertDisposableSource(...pair));
  const workflow=readFileSync(new URL('../../.github/workflows/command3-auth-browser.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('ref: ${{ github.event.pull_request.head.sha || github.sha }}'));
  assert.ok(workflow.includes('XB01_TEST_SOURCE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}'));
});
test('catalog collector retains policy/grant/column/FK provenance without querying customer rows or certifying isolation',async()=>{
  const rows=[{schema:'public',table_name:'fixture',columns:[{name:'user_id',nullable:true}],constraints:[],policies:[],grants:[]}];
  const r=await collectSchemaCatalog({query:async sql=>{
    assert.ok(sql.includes('pg_policy'));assert.ok(sql.includes('information_schema.table_privileges'));
    assert.ok(!sql.includes('from public.'));return {rows};
  }},{sourceSha:'a'.repeat(40),observedAt:'2026-10-18T00:00:00.000Z'});
  assert.equal(r.customerRowsRead,false);assert.equal(r.securityCertification,'NOT_CERTIFIED_BY_INVENTORY');
  assert.deepEqual(r.tables,rows);
  await assert.rejects(collectSchemaCatalog({query:async()=>({rows:[]})},{sourceSha:'a'.repeat(40),observedAt:r.observedAt}));
});
