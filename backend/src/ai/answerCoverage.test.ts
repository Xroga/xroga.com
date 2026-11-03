import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAnswerCoverage, requestedAnswerObligations } from './answerCoverage.js';
import { createPresentationProjection, presentationRequestInstructions, type PresentationPlan } from './responsePresentation.js';

test('explicit missing diagram, comparison and schema demands cannot disappear behind a valid role table',()=>{
  const prompt='Explain a shared application. Include an architecture diagram. Compare access for two organizations using comparison cards. Show a proposed database schema table.';
  const original:PresentationPlan=[{kind:'table',heading:'Components',instruction:'Describe the roles.',covers:['roles']}];
  const result=prepareAnswerCoverage(prompt,original,[{id:'roles',description:'Roles of the components',origin:'requested',formats:['table']}]);
  assert.equal(result.coverage.complete,true);
  assert.deepEqual(result.plan.map(s=>s.kind),['table','graph','table','cards']);
  assert.equal(original.length,1);
  const received=JSON.stringify({s0:{markdown:'Roles.',data:{columns:['Role'],rows:[['Application']]}}});
  const partial=createPresentationProjection(result.plan).finish(received);
  assert.equal(partial.ok,false);assert.equal(partial.original,received);
});

test('arbitrary subjects share the same contract and simple answers acquire no widgets',()=>{
  assert.deepEqual(requestedAnswerObligations('Hello'),[]);
  assert.deepEqual(requestedAnswerObligations('What is a chart?'),[]);
  assert.deepEqual(requestedAnswerObligations('Explain briefly without charts or tables.'),[]);
  for(const subject of ['greenhouse humidity','classroom attendance','conference registrations']){
    const c=prepareAnswerCoverage(`Explain ${subject}. Include a calculator with editable inputs and a workflow.`);
    assert.deepEqual(c.plan.map(x=>x.kind),['calculator','steps']);assert.equal(c.coverage.complete,true);
    assert.ok(c.requirements.every(r=>r.description.includes('calculator')||r.description.includes('workflow')));
  }
});

test('invalid original bindings and oversized plans remain incomplete, with all original material retained',()=>{
  const p:PresentationPlan=Array.from({length:8},(_,i)=>({kind:'prose',heading:`Section ${i}`,instruction:'Original content'}));
  const result=prepareAnswerCoverage('Include a calculator.',p,[{id:'original',description:'Original concept',origin:'requested',formats:['prose']}]);
  assert.equal(result.coverage.complete,false);assert.equal(result.plan.length,8);assert.equal(result.requirements.length,2);
  assert.deepEqual(result.plan,p);
});

test('JSON-object fallback carries the exact schema in the existing answer request, with no repair call',()=>{
  const c=prepareAnswerCoverage('Give a calculator for 25 participants at $40 each.');
  const instruction=presentationRequestInstructions(c.plan,{includeSchema:true});
  assert.match(instruction,/additionalProperties/);assert.match(instruction,/25 participants at \$40/);
  assert.doesNotMatch(presentationRequestInstructions(c.plan,{includeSchema:false}),/additionalProperties/);
});
