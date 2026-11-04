import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareAnswerCoverage, requestedAnswerObligations, requiredAccessBoundarySupport } from './answerCoverage.js';
import { createPresentationProjection, presentationRequestInstructions, type PresentationPlan } from './responsePresentation.js';
import {readFileSync} from 'node:fs';

test('persistent access-boundary systems need ownership records and a scope contrast independently of component roles',()=>{
  for(const prompt of [
    'Explain a small multi-tenant SaaS architecture using Next.js, Supabase and Stripe. Include a useful architecture diagram and describe tenant isolation and the role of each component. This is an explanation only, do not build or execute anything.',
    'Describe the architecture of a document database for isolated organizations, with organization-scoped records.',
  ]){
    const plan:PresentationPlan=[{kind:'table',heading:'Component roles',instruction:'Describe component responsibilities.',covers:['roles']}];
    const result=prepareAnswerCoverage(prompt,plan,[{id:'roles',description:'Explain component responsibilities.',origin:'requested',formats:['table']}]);
    assert.equal(result.coverage.complete,true);
    assert.ok(result.plan.some(s=>s.kind==='table'&&s.covers?.includes('support-ownership-records')));
    assert.ok(result.plan.some(s=>s.kind==='cards'&&s.covers?.includes('support-access-contrast')));
    assert.ok(!result.plan[0].covers?.includes('support-ownership-records'),'A role table cannot satisfy the ownership data structure');
    const support=result.requirements.filter(r=>r.id.startsWith('support-'));
    assert.ok(support.every(r=>r.origin==='necessary-support'&&!r.sourceQuote),'Derived support never invents a user quotation');
  }
});

test('access support respects narrow, stateless and explicitly excluded presentations',()=>{
  for(const prompt of ['What does tenant isolation mean?','Explain a stateless multi-tenant architecture without storage.',
    'Explain a multi-tenant SaaS architecture without a database schema and without comparison cards.'])
    assert.deepEqual(requiredAccessBoundarySupport(prompt),[]);
  const prompt='Explain a multi-tenant SaaS architecture.';
  const first=prepareAnswerCoverage(prompt);const second=prepareAnswerCoverage(prompt,first.plan,first.requirements);
  assert.deepEqual(second,first,'The same requirements cannot spawn duplicate support sections');
});

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

test('two materially different same-format requests cannot be satisfied by one unrelated table',()=>{
 const prompt='Show a table of component roles. Show a table of subscription event states.';
 const quoted=prepareAnswerCoverage(prompt,[{kind:'table',heading:'Roles',instruction:'Component roles only',covers:['roles']}],
  [{id:'roles',description:'Describe component responsibilities',sourceQuote:'Show a table of component roles.',origin:'requested',formats:['table']}]);
 assert.equal(quoted.plan.length,2);assert.equal(quoted.coverage.complete,true);
 assert.equal(quoted.plan[0].covers?.includes('requested-table'),true);
 assert.deepEqual(quoted.plan[1].covers,['requested-table-2']);
 const received=JSON.stringify({s0:{markdown:'The component role explanation.',data:{columns:['Component','Role'],rows:[['Application','UI']]}}});
 const partial=createPresentationProjection(quoted.plan).finish(received);
 assert.equal(partial.ok,false);assert.equal(partial.original,received);
 assert.match(partial.response,/component role explanation/);
});

test('fabricated request quotes remain a visible coverage failure, while old documents stay readable',()=>{
 const result=prepareAnswerCoverage('Hello',[],[{id:'invented',description:'A supplied request',sourceQuote:'Show the live price chart.',origin:'requested',formats:['prose']}]);
 assert.equal(result.coverage.complete,false);assert.deepEqual(result.coverage.issues,['unbound-request-quote:invented']);
 assert.deepEqual(requestedAnswerObligations('Hello'),[]);
});
test('a planner-generated ID collision cannot erase an explicit requirement or certify the captured failed SaaS excerpt',()=>{
 const captured=JSON.parse(readFileSync(new URL('./testdata/captured-4c6319-role-table.json',import.meta.url),'utf8'));
 assert.equal(captured.provenance.kind,'captured-generated-failed-production-acceptance');
 const prompt='Show a table of component roles. Show a proposed database schema table. Compare access for two organizations using comparison cards.';
 const contract=prepareAnswerCoverage(prompt,[{kind:'table',heading:'Component roles',instruction:'Describe component responsibilities.',covers:['requested-schema']}],
  [{id:'requested-schema',description:'Describe component responsibilities.',origin:'requested',formats:['table']}]);
 assert.ok(contract.requirements.some(r=>r.id==='requested-schema-explicit-1'&&r.sourceQuote==='Show a proposed database schema table.'));
 assert.ok(contract.plan.find(s=>s.covers?.includes('requested-schema-explicit-1'))?.instruction.includes('database schema'));
 const columns=captured.table.columns.map((c:{label:string})=>c.label);
 const rows=captured.table.rows.map((r:Record<string,string>)=>captured.table.columns.map((c:{key:string})=>r[c.key]));
 const received=JSON.stringify({s0:{markdown:'Captured component-role excerpt, not a complete answer.',data:{columns,rows}}});
 const partial=createPresentationProjection(contract.plan).finish(received);
 assert.equal(partial.ok,false);assert.equal(partial.original,received);
 assert.match(partial.response,/Next.js/);assert.match(partial.response,/Stripe Webhooks/);
});
