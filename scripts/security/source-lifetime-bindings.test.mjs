import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { discoverPersistenceCalls } from './audit-tenant-policies.mjs';

test('current transport proof binds every claimed source and keeps unresolved caller obligations visible', () => {
  const read=p=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
  const proof=JSON.parse(read('docs/xroga/evidence/command-010/TRANSPORT-LIFETIME-PROOF.json'));
  const inventory=JSON.parse(read('docs/xroga/security/egress-callers.json'));
  for(const binding of proof.currentSourceBindings)assert.equal(createHash('sha256').update(read(binding.path)).digest('hex'),binding.sha256,binding.path);
  for(const key of ['total','reviewed','pending'])assert.equal(proof.counts[key],inventory.counts[key]);
  assert.equal(proof.counts.unresolvedHighRiskReviewCandidates,inventory.counts.unresolvedHighRiskBypasses);
  assert.equal(proof.threeSdkFinalDispositions,'THREE_SCOPED_SDK_GUARDS_UPSTREAM_CALLERS_REMAIN_OPEN');
  assert.deepEqual(Object.fromEntries(inventory.callers.filter(row=>row.transport==='provider-sdk').map(row=>[row.id,row.disposition])),{
    '31380a8d5b9454a98a98':'VERIFIED_GUARD',
    '9c345e07b723c086440e':'VERIFIED_GUARD',
    '4c899876b9e3850af11b':'VERIFIED_GUARD',
    '9ea21a6fc8b8700460c0':'VERIFIED_GUARD',
  });
  assert.equal(proof.phase4,'PREPARATORY_NOT_ACCEPTED');
  assert.equal(proof.phase3,'B1_P3_VERIFIED');
  assert.equal(proof.historicalPreparation.phase3,'B1_P3_BLOCKED');
  assert.equal(proof.currentSourceAcceptance,'NOT_VERIFIED');
  assert.equal(proof.productionEffects,false);assert.equal(proof.spend,0);
});

test('current metadata continuation preserves the exact historical proof files without promoting acceptance',()=>{
  const read=p=>readFileSync(p,'utf8').replace(/\r\n/g,'\n'),hash=s=>createHash('sha256').update(s).digest('hex');
  const proof=JSON.parse(read('docs/xroga/evidence/command-010/CURRENT-PROOF-METADATA-CONTINUATION-20261028.json'));
  assert.equal(proof.phase4Accepted,false);assert.equal(proof.strictEgressAuditorChanged,false);assert.equal(proof.frozenCriteriaChanged,false);
  for(const binding of proof.originalProofs){
    assert.equal(hash(read(binding.archive)),binding.historicalSha256);
    assert.equal(read(binding.archive),execFileSync('git',['show',`${proof.archiveRef}:${binding.path}`],{encoding:'utf8',maxBuffer:20*1024*1024}).replace(/\r\n/g,'\n'));
    assert.equal(hash(read(binding.path)),binding.currentSha256);
  }
});

test('source-lifetime position reconciliation preserves exact expressions and nested historical receipts without certifying new boundaries', () => {
  const read=p=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
  const proof=JSON.parse(read('docs/xroga/evidence/command-010/SOURCE-LIFETIME-PROOF.json'));
  const old=p=>execFileSync('git',['show',`${proof.reference}:${p}`],{encoding:'utf8',maxBuffer:16*1024*1024}).replace(/\r\n/g,'\n');
  const hash=s=>createHash('sha256').update(s).digest('hex');
  assert.equal(proof.scope,'CURRENT_SOURCE_POSITION_RECONCILIATION_NOT_SECURITY_CERTIFICATION');
  assert.equal(proof.reference,'944bd5e3078be7d3c4d536baefd50c42eb83b32e');
  const previous=JSON.parse(old('docs/xroga/security/caller-reviews.json')).reviews;
  const current=JSON.parse(read('docs/xroga/security/caller-reviews.json')).reviews;
  const inspect=(path,text)=>{
    const ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true),calls=discoverPersistenceCalls(path,text),result=new Map();
    function visit(n){if(ts.isCallExpression(n))for(const kind of ['PRIVILEGED_FACTORY','RPC_CANDIDATE','TABLE_OR_BUCKET_CANDIDATE']){
      const id=hash(`${path}:${n.getStart(ast)}:${n.end}:${kind}`).slice(0,20),c=calls.find(c=>c.id===id);
      if(c){let fn=n.parent;while(fn&&!ts.isFunctionDeclaration(fn)&&!ts.isMethodDeclaration(fn))fn=fn.parent;result.set(id,{...c,text:n.getText(ast),fn:fn?.getText(ast)??''});}
    }ts.forEachChild(n,visit);}visit(ast);return result;
  };
  for(const binding of proof.bindings){
    assert.equal(hash(old(binding.path)),binding.beforeSha256);assert.equal(hash(read(binding.path)),binding.currentSha256);
    const a=inspect(binding.path,old(binding.path)),b=inspect(binding.path,read(binding.path));
    for(const m of binding.matches){
      const before=a.get(m.beforeId),after=b.get(m.afterId);assert.ok(before&&after);
      assert.equal(before.text,after.text);assert.equal(hash(after.text),m.callSha256);
      for(const key of ['kind','target','enclosing'])assert.equal(before[key],after[key]);
      if(m.unchangedFunctionSha256){assert.equal(before.fn,after.fn);assert.equal(hash(after.fn),m.unchangedFunctionSha256);}
      const original=previous.find(r=>r.path===binding.path&&r.callIds.includes(m.beforeId));
      if(!original)continue;
      const next=current.find(r=>r.path===binding.path&&r.callIds.includes(m.afterId));assert.ok(next);assert.equal(next.disposition,original.disposition);
      for(const key of Object.keys(original).filter(k=>/historical|acceptedPhase|command007|phase3Requirements/i.test(k)))assert.deepEqual(next[key],original[key]);
    }
  }
  for(const path of ['docs/xroga/batch-1/phases/PHASE-2-FROZEN-WORKLIST.json','docs/xroga/batch-1/phases/phase-4/PHASE-4-FROZEN-WORKLIST.json'])assert.equal(read(path),old(path));
});
