import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8').replace(/\r\n/g,'\n'),hash=s=>createHash('sha256').update(s).digest('hex');
const original=JSON.parse(read('docs/xroga/batch-1/phases/BATCH-1-CRITERION-SCOREBOARD.json')),expected=original.criteria.filter(c=>['008','009'].includes(c.command));
const classes=['READ','CREATE','UPDATE','DELETE','SEND_COMMUNICATION','PUBLISH','PURCHASE_OR_SPEND','TRANSFER_OR_FINANCIAL','CREDENTIAL_OR_PERMISSION_CHANGE','SENSITIVE_DATA_EXPORT','EXTERNAL_UPLOAD','ADMINISTRATIVE_HIGH_RISK'];
function validate(value){
  assert.equal(value.scope,'ORIGINAL_COMMAND008_009_PLANNING_ONLY_NOT_PHASE3_IMPLEMENTATION_OR_ADMISSION');
  // Phase1 deliberately pins the original report's raw bytes, including its
  // historical line endings. Other source bindings normalize CRLF to LF.
  assert.equal(value.originalContractSha256,original.contractSha256);assert.equal(hash(readFileSync(new URL(value.originalContractPath,root))),value.originalContractSha256);
  assert.equal(value.phase2FinalSourceAcceptance,'VERIFIED_ORIGINAL007_EXTERNAL_RECEIPT_SEPARATE_PHASE3_ADMISSION_REQUIRED');
  assert.match(value.acceptedPhaseTwoSource,/^[a-f0-9]{40}$/);execFileSync('git',['merge-base','--is-ancestor',value.frozenAgainstCodeSource,value.acceptedPhaseTwoSource],{cwd:root});
  execFileSync('git',['merge-base','--is-ancestor',value.acceptedPhaseTwoSource,'HEAD'],{cwd:root});assert.match(value.phase2AcceptanceManifest.sha256,/^[a-f0-9]{64}$/);
  assert.match(value.frozenAgainstCodeSource,/^[a-f0-9]{40}$/);execFileSync('git',['merge-base','--is-ancestor',value.frozenAgainstCodeSource,'HEAD'],{cwd:root});
  assert.equal(value.criteria.length,22);assert.equal(new Set(value.criteria.map(c=>c.id)).size,22);assert.deepEqual(value.actionClasses,classes);
  assert.deepEqual(value.restrictions,{additionalSpend:0,phase3Started:false,productionMerge:false,deploy:false,dnsChange:false,liveCredentialMigration:false,paidProviderCall:false});
  const interfaces=new Map(value.interfaces.map(i=>[i.id,i]));assert.equal(interfaces.size,value.interfaces.length);assert.ok(interfaces.size>=18);
  for(const i of interfaces.values()){
    assert.equal(i.verificationScope,'REUSABLE_EXISTING_INTERFACE_NOT_COMMAND008_OR009_ACCEPTANCE');assert.ok(i.contract.length>40);
    // This is an immutable verified baseline, not a prohibition on separately
    // approved Phase3 implementations extending these same source modules.
    const snapshot=execFileSync('git',['show',`${value.frozenAgainstCodeSource}:${i.path}`],{cwd:root,encoding:'utf8',maxBuffer:12*1024*1024}).replace(/\r\n/g,'\n');assert.equal(hash(snapshot),i.sha256);
  }
  for(const criterion of expected){
    const record=value.criteria.find(c=>c.id===criterion.id);assert.ok(record);assert.equal(record.originalText,criterion.originalText);assert.equal(record.command,criterion.command);assert.equal(record.phase,3);assert.equal(record.status,'PLANNED_NOT_IMPLEMENTED');
    assert.ok(record.dependencies.includes('B1_P2_VERIFIED'));assert.ok(record.dependencies.includes('EXPLICIT_FOUNDER_PHASE3_ADMISSION'));
    if(record.command==='009')assert.ok(record.dependencies.includes('COMMAND008_CANONICAL_AUTHORITY_INTERFACE'));
    assert.ok(record.existingMechanisms.length>0&&record.existingMechanisms.every(id=>interfaces.has(id)));assert.ok(record.testRequirements.length>=2);assert.ok(record.implementationObligation.length>40);
  }
}
const worklist=()=>JSON.parse(read('docs/xroga/batch-1/phases/PHASE-3-FROZEN-WORKLIST.json'));
test('Phase2 handoff freezes all original22 future criteria and verified interfaces without admitting Phase3',()=>validate(worklist()));
test('Phase2 handoff rejects missing or rewritten requirements and invented implementation or spending authority',()=>{
  for(const mutate of [w=>w.criteria.pop(),w=>w.criteria[0].originalText='weakened',w=>w.criteria[0].status='IMPLEMENTED',w=>w.restrictions.phase3Started=true,w=>w.restrictions.additionalSpend=1,w=>w.actionClasses.pop()]){
    const value=worklist();mutate(value);assert.throws(()=>validate(value));
  }
});
test('Phase2 handoff rejects a tampered verified-baseline interface digest',()=>{
  const value=worklist();value.interfaces[0].sha256='0'.repeat(64);assert.throws(()=>validate(value));
});
