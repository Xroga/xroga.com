import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyHistoricalProofBinding} from './phase-two-proof-bindings.mjs';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {discoverPersistenceCalls} from '../security/audit-tenant-policies.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const invocation='it("owner isolation",()=>{assert.equal(fork.projectId,"owned");})';
const before=invocation+'; it("network",()=>oldBridge());';
const after=invocation+'; it("network",()=>assert.throws(registryOnly));';
const binding={scope:'UNCHANGED_TEST_HISTORICAL_CANDIDATE_NOT_ACCEPTANCE',marker:'owner isolation',
  historicalSourceSha256:hash(before),currentSourceSha256:hash(after),testCallSha256:hash(invocation)};

test('historical candidate hash is preserved only for an exact current binding and unchanged complete test call',()=>{
  assert.equal(verifyHistoricalProofBinding(binding,before,after),hash(before));
});
test('changed assertion, missing or ambiguous test, forged hashes and acceptance scope fail closed',()=>{
  for(const text of [after.replace('"owned"','"foreign"'),after.replace('owner isolation','missing'),after+';'+invocation]){
    assert.throws(()=>verifyHistoricalProofBinding({...binding,currentSourceSha256:hash(text)},before,text));
  }
  for(const field of ['historicalSourceSha256','currentSourceSha256','testCallSha256','scope']){
    assert.throws(()=>verifyHistoricalProofBinding({...binding,[field]:'forged'},before,after));
  }
  assert.throws(()=>verifyHistoricalProofBinding(binding,before,after+'//unreviewed'));
});

test('model-dispatch current bindings preserve exact historical conversions, constructor and nested proof records',()=>{
  const proof=JSON.parse(readFileSync('docs/xroga/evidence/command-010/MODEL-DISPATCH-PROOF.json','utf8'));
  const read=p=>readFileSync(p,'utf8').replace(/\r\n/g,'\n');
  const old=p=>execFileSync('git',['show',`${proof.reference}:${p}`],{encoding:'utf8',maxBuffer:12*1024*1024}).replace(/\r\n/g,'\n');
  const current=JSON.parse(read('docs/xroga/security/caller-reviews.json'));
  const previous=JSON.parse(old('docs/xroga/security/caller-reviews.json'));
  for(const binding of proof.bindings){
    const before=old(binding.path),after=read(binding.path);
    assert.equal(hash(before),binding.historicalSha256);assert.equal(hash(after),binding.currentSha256);
    const exactNodes=(text,ids)=>{
      const candidates=discoverPersistenceCalls(binding.path,text).filter(c=>ids.includes(c.id));
      assert.equal(candidates.length,ids.length);
      const ast=ts.createSourceFile(binding.path,text,ts.ScriptTarget.Latest,true),found=[];
      function visit(n){
        if(ts.isCallExpression(n)&&candidates.some(c=>c.line===ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1)
          &&(n.expression.getText(ast)==='Array.from'||n.expression.getText(ast)==='getSupabaseAdmin'||n.expression.getText(ast)==='Buffer\n      .from')){
          let enclosing=n;
          if(binding.unchangedConstructorCallSha256){while(enclosing.parent&&!ts.isCallExpression(enclosing.parent))enclosing=enclosing.parent;enclosing=enclosing.parent;}
          else while(enclosing.parent&&!ts.isBlock(enclosing))enclosing=enclosing.parent;
          found.push(enclosing.getText(ast));
        }
        ts.forEachChild(n,visit);
      }visit(ast);assert.equal(found.length,ids.length);return found;
    };
    const a=exactNodes(before,binding.beforeIds),b=exactNodes(after,binding.afterIds);
    assert.deepEqual(b,a,'A shifted source position cannot hide changed persistence semantics');
    assert.deepEqual(b.map(hash),binding.unchangedNearestBlockSha256??[binding.unchangedConstructorCallSha256]);
    for(let i=0;i<binding.beforeIds.length;i++){
      const original=previous.reviews.find(r=>r.callIds.includes(binding.beforeIds[i]));
      const next=current.reviews.find(r=>r.callIds.includes(binding.afterIds[i]));
      assert.ok(original&&next);assert.equal(next.disposition,original.disposition);
      for(const key of ['historicalBeforeFinalSourceTenantProof','command007Proof','historicalBeforeRoutingContextArgument','acceptedPhaseTwoReview'])
        assert.deepEqual(next[key],original[key],'Historical source-bound proof cannot be rewritten');
    }
  }
  assert.equal(hash(old('docs/xroga/batch-1/phases/PHASE-2-CLOSURE-LEDGER.json')),proof.historicalCurrentLedgerSha256);
  for(const p of ['docs/xroga/batch-1/phases/PHASE-2-FROZEN-WORKLIST.json','docs/xroga/batch-1/phases/phase-4/PHASE-4-FROZEN-WORKLIST.json'])assert.equal(read(p),old(p));
  assert.equal(proof.threeSdkDispositions,'PENDING_SOURCE_TRACE');
});
