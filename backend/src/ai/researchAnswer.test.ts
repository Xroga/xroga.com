import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {researchAnswerRequestSchema,RESEARCH_ANSWER_MAXIMUM_MICRO_USD,researchCitationIssues,bindCitationLinks,publicWorkspaceResearchAnswer,presentPublicResearchAnswer} from './researchAnswer.js';
import {nativeMarkdownTables} from './nativeMarkdown.js';

test('public research withholds positions based on incompatible financing figures', () => {
  const sources = [{ url: 'https://finance.example/rounds' }];
  const prose = [
    '# Top 3 materials labs', '', '## The ranking', '',
    '| # | Lab | Latest post-money valuation | Round status |', '| --- | --- | --- | --- |',
    '| 1 | Ames | $400M | Closed [1] |',
    '| 2 | Brant | $200M (pre-money) | Reported [1] |',
    '| 3 | Crest | $170M | In talks [1] |', '',
    'Rank 2 is the clear runner-up.', '', 'The reporting dates differ [1].', '',
    '# Separate example', '', 'Position 1 refers to the initial simulation slot.', '',
    '```text', 'Rank 2 is source text in this code example.', '```',
  ].join('\n');
  const answer = presentPublicResearchAnswer(prose, { status: 'complete' }, sources, 'Rank the three labs.');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' });
  assert.equal(answer.requiresReadableFallback, true);
  assert.match(answer.response, /couldn’t verify a comparable ranking/);
  assert.deepEqual(nativeMarkdownTables(answer.response).map(({head, rows}) => ({head, rows})), [{
    head: ['Lab', 'Reported valuation', 'Round status'],
    rows: [['Ames', '$400M', 'Closed [1]'], ['Brant', '$200M (pre-money)', 'Reported [1]'], ['Crest', '$170M', 'In talks [1]']],
  }]);
  assert.doesNotMatch(answer.response, /clear runner-up/);
  assert.match(answer.response, /The reporting dates differ \[1\]/);
  assert.match(answer.response, /Position 1 refers to the initial simulation slot/);
  assert.match(answer.response, /Rank 2 is source text in this code example/);
});

test('public research keeps a disclosed forecast comparison and rejects an estimate ranked as an actual measure', () => {
  const sources = [{ url: 'https://energy.example/output' }];
  const makeAnswer = (measure: string) => [
    '| Position | Project | ' + measure + ' |', '| --- | --- | --- |',
    '| 1 | North | 1.4 GWh [1] |', '| 2 | Bay | 1.2 GWh (projected) [1] |',
  ].join('\n');
  const forecast = makeAnswer('Forecast annual output');
  assert.equal(presentPublicResearchAnswer(forecast, {status: 'complete'}, sources, 'Compare output.').response, forecast);
  const actual = presentPublicResearchAnswer(makeAnswer('Actual annual output'), {status: 'complete'}, sources, 'Rank actual output.');
  assert.deepEqual(actual.completion, {status: 'partial', reason: 'factual_review'});
  assert.match(actual.response, /Reported annual output/);
  assert.match(actual.response, /1\.2 GWh \(projected\)/);
  assert.doesNotMatch(actual.response, /\| Position \|/);
});

test('a generic valuation column cannot hide incompatible row measurements', () => {
  const sources = [{ url: 'https://finance.example/rounds' }];
  const response = [
    '# Top 2 materials labs', '',
    'The ranking below uses the latest reported figures [1].', '',
    '| # | Lab | Latest valuation | Round / as of |', '| --- | --- | --- | --- |',
    '| 1 | Ames | $400M | Closed [1] |', '| 2 | Brant | $200M pre-money | Reported [1] |',
    '', '## Why the order holds', '', 'The #1 slot is uncertain.',
    '', 'Reporting dates differ [1].',
  ].join('\n');
  const answer = presentPublicResearchAnswer(response, { status: 'complete' }, sources, 'Rank both labs.');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' });
  assert.deepEqual(nativeMarkdownTables(answer.response)[0]?.head, ['Lab', 'Reported valuation', 'Round / as of']);
  assert.match(answer.response, /\$200M pre-money/);
  assert.match(answer.response, /Reporting dates differ \[1\]/);
  assert.doesNotMatch(answer.response, /the order holds|ranking below uses|#1 slot/iu);

  const comparable = response.replace('$400M', '$400M pre-money');
  assert.equal(presentPublicResearchAnswer(comparable, { status: 'complete' }, sources, 'Rank both labs.').response, comparable);
});
import {runChatPipeline} from './pipeline.js';
import {goalContractSchema} from './universal/goalContract.js';
import {confirmBusinessAction,getBusinessActionConfirmation} from '../services/integrations/businessActionConfirmations.js';
import {presentResearchResult,readResearchResult} from '../services/integrations/researchResult.js';
import {actorFromTenantContext,setStorageServiceForTests} from '../storage/runtime.js';
import {createTenantContext} from '../security/tenantContext.js';
import {nativeReleaseFixture} from '../services/publish/__tests__/nativeReleaseFixture.js';
import {harness} from '../storage/testing/harness.js';
import {actionPlanDigest} from '../services/integrations/businessAction.js';
import {hasNonPublicSearchTerms,requestsOfficialLinkCoverage,workspacePublicSearchQuery} from './workspacePublicSearch.js';

test('public Workspace research omits private data, provider receipts and usage from its response payload', () => {
  const result = {
    response: 'Public explanation [1].',
    completion: {status:'complete'} as const,
    intent:'research',
    publicWebRetrieved:true as const,
    responseSource:{format:'xroga-response-json-v1' as const,text:'{}',contract:{strategyId:'PRIVATE_MARKER'} as never},
    webSources:[{title:'Retrieved page',url:'https://example.org/docs',snippet:'Public excerpt.',
      source:'PRIVATE_MARKER',siteName:'Publisher',storageKey:'PRIVATE_MARKER'}],
    modelId:'PRIVATE_MARKER',usage:{totalTokensUsed:920},approval:{criticalParameters:'PRIVATE_MARKER'},
  };
  const body = JSON.parse(JSON.stringify(publicWorkspaceResearchAnswer(result)));
  assert.deepEqual(body,{
    response: result.response, completion: result.completion, intent: 'research',
    responseSource:{format:'xroga-response-json-v1',text:'{}'},
    webSources:[{title:'Retrieved page',url:'https://example.org/docs',snippet:'Public excerpt.',source:'web',siteName:'Publisher'}],
    publicWebRetrieved:true, engine:'xroga',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(publicWorkspaceResearchAnswer({
    ...result, intent:'research_unavailable', response:'Send the public topic you want me to look up.',
    completion:undefined, responseSource:undefined, publicWebRetrieved:undefined, webSources:[],
  }))), {
    response:'Send the public topic you want me to look up.',
    intent:'research_unavailable', webSources:[], engine:'xroga',
  });
});

test('research attribution binds canonical pages without treating code or chart arrays as citations',()=>{
 const sources=[{url:'https://example.com/docs'},{url:'https://example.com/other'}];
 assert.deepEqual(researchCitationIssues('Supported statement [1]. Another statement [2].',sources),[]);
 assert.deepEqual(researchCitationIssues('[1](https://example.com/docs#heading)',sources),[]);
 assert.deepEqual(researchCitationIssues('[1](https://example.com/not-retrieved)',sources),['mismatched-source:1','missing-source-attribution']);
 assert.deepEqual(researchCitationIssues('Unsupported claim [3].',sources),['unresolved-source:3','missing-source-attribution']);
 assert.deepEqual(researchCitationIssues('Supported [1].\n```ts\narray[99]\n```\n```xroga-ui\n{"type":"chart","values":[99],"summary":"Documented [2]"}\n```',sources),[]);
 assert.deepEqual(researchCitationIssues('No citations supplied.',sources),['missing-source-attribution']);
});

test('explicit official-link coverage keeps retrieved destinations and marks unverified entries partial', () => {
  const project = 'https://example.org/project';
  const manual = 'https://example.net/manual';
  const outside = 'https://unretrieved.example/guessed';
  const sources = [{ url: project }, { url: manual }];
  const prompt = 'Compare two projects; link their official sites and cite the results.';
  const valid = presentPublicResearchAnswer(
    `1. [Project](${project}) [1]\n2. [Manual](${manual}) [2]`,
    { status: 'complete' }, sources, prompt);
  assert.deepEqual(valid.completion, { status: 'complete' });
  const incomplete = presentPublicResearchAnswer(
    `1. [Project](${project}) [1]\n2. [Guessed](${outside}) [2]\n\n${outside}.\n\n~~~text\n${outside}\n~~~`,
    { status: 'complete' }, sources, prompt);
  assert.deepEqual(incomplete.completion, { status: 'partial', reason: 'source_coverage' });
  assert.equal(incomplete.response.split(outside).length, 2, 'Literal code keeps its exact text');
  assert.match(incomplete.response, /Guessed \(link not verified\)/);
  assert.match(incomplete.response, /couldn’t verify every requested official link/);
  assert.deepEqual(presentPublicResearchAnswer('The comparison [1] [2]', { status: 'complete' }, sources, prompt).completion,
    { status: 'partial', reason: 'source_coverage' });
});

test('website rows use same-entity publisher evidence and remove a stale link-only recap', () => {
  const sources = [
    { url: 'https://example.org/research', snippet: [
      'Rank | Company | Focus | Website',
      '...',
      '1 | Alder Labs | Research | alder.example.com',
      '2 | Birch Works | Infrastructure | birch.example.com',
      '3 | Cedar Systems | Infrastructure | 127.0.0.1',
      '4 | Platform services | misleading.example.com',
    ].join('\n') },
    { url: 'https://example.net/other', snippet: [
      'Company | Website',
      'Birch Works | birch-alternative.example.com',
    ].join('\n') },
  ];
  const original = [
    'Three companies [1].', '',
    '| Company | Official site | Reason |',
    '| --- | --- | --- |',
    '| **Alder Labs** | Official link not verified | Research [1] |',
    '| Birch Works | Official link not verified | Infrastructure [2] |',
    '| Cedar Systems | Official link not verified | Infrastructure [1] |',
    '', '## What the links verify', '',
    'All three official sites were verified.',
    '', '## Method', '',
    'Keep the criteria and dated evidence [1].',
    '', '~~~text', '## Official link verification', 'Keep the literal heading inside the example.', '~~~',
  ].join('\n');
  const prompt = 'Compare three companies and link each official website.';
  const answer = presentPublicResearchAnswer(original, { status: 'complete' }, sources, prompt);
  assert.match(answer.response, /\| \*\*Alder Labs\*\* \| \[alder\.example\.com\]\(<https:\/\/alder\.example\.com\/>\) \[1\] \| Research \[1\] \|/);
  assert.match(answer.response, /\| Birch Works \| Official link not verified \|/);
  assert.match(answer.response, /\| Cedar Systems \| Official link not verified \|/);
  assert.doesNotMatch(answer.response, /What the links verify|All three official sites|127\.0\.0\.1|misleading\.example\.com/);
  assert.match(answer.response, /## Method\n\nKeep the criteria and dated evidence \[1\]/);
  assert.match(answer.response, /~~~text\n## Official link verification\nKeep the literal heading/);
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'source_coverage' });
  assert.equal(answer.requiresReadableFallback, true);
  assert.equal(presentPublicResearchAnswer(answer.response, answer.completion, sources, prompt).response, answer.response,
    'reopening the saved corrected answer does not add a second coverage note');
});

test('bare domains are clickable only when grounded and truncated rows cannot verify ownership', () => {
  const sources = [
    { url: 'https://example.org/research', snippet: 'Company | Sector | Website\nResearch | www.unclear.example.com' },
    { url: 'https://known.example.org/' },
  ];
  const response = [
    '| Company | Official site | Source |', '| --- | --- | --- |',
    '| Known | known.example.org [2] | Official page [2] |',
    '| Unclear | www.unclear.example.com [1] | Directory field `a | b` [1] |',
    '', '- **Link verification.** Both sites were verified.',
  ].join('\n');
  const answer = presentPublicResearchAnswer(response, { status: 'complete' }, sources, 'Compare two companies and link each official website.');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'source_coverage' });
  assert.match(answer.response, /\[known\.example\.org\]\(<https:\/\/known\.example\.org\/>\) \[2\]/);
  assert.match(answer.response, /\| Unclear \| Official link not verified \| Directory field `a \| b` \[1\] \|/);
  assert.doesNotMatch(answer.response, /unclear\.example\.com|Both sites were verified/);
});

test('one exact research approval completes its original rich answer, saves evidence and cannot replay either provider',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
 const context=createTenantContext({userId:owner,via:'remote_getuser'});
 const env={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55437',SUPABASE_SERVICE_ROLE_KEY:'synthetic-loopback',DEEPSEEK_WEBSEARCH_FETCH_API:'synthetic-retrieval',ZURELAY_API_KEY:'synthetic-model',ZURELAY_STREAM_USAGE_VERIFIED:'1',
  XROGA_NATIVE_OPENUI_WORKSPACE:'0',XROGA_DEPLOYMENT_ENVIRONMENT:'staging'};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const storage=harness(),confirmation=nativeReleaseFixture(owner),reservations=new Map<string,any>();setStorageServiceForTests(storage.svc);
 t.after(()=>{setStorageServiceForTests(undefined);for(const k of Object.keys(env)){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}});
 let searches=0,models=0,unknown=0,mode='ok';
 let automaticAuditCount=0;
 let expectedPublicQuery: RegExp | undefined;
 const rankingPrompt='Top 10 best AI companies of 2026. Explain the ranking method, show their official websites, and cite sources.';
 const ownerActor=actorFromTenantContext(context);
 const searchFilename='research-'+context.correlationId+'.json';
 const put=storage.store.put.bind(storage.store);
 t.mock.method(storage.store,'put',(...args:Parameters<typeof put>)=>{
  if(mode==='automatic-storage-failure')throw Error('Synthetic private evidence write failure');
  return put(...args);
 });
 const unrelatedHistory='Earlier NASA mission discussion UNRELATED_PRIOR_NASA_TURN';
 const raw=JSON.stringify({s0:{markdown:'The retrieved page documents the supplied option [1].',data:{columns:['Option','Evidence'],rows:[['Documented option','Public source excerpt [1]']]}}});
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):{};
  if(url.origin==='https://api.deepseek.com'&&url.pathname==='/v1/tools/search'){
   searches++;assert.equal(init?.redirect,'manual');assert.ok(!JSON.stringify(body).includes('answerRequest'));
   if(mode.startsWith('automatic')){
    if(mode==='automatic-official'){
      assert.deepEqual(Object.keys(body).sort(),['count','query']);
      assert.equal(body.count,10);
      assert.match(body.query,/difference between solar and lunar eclipses/);
      assert.match(body.query,/ site:nasa\.gov$/);
      assert.ok([...body.query].length<=128);
    }else if(mode.startsWith('automatic-ranking')){
      assert.deepEqual(body,{query:'Top 10 best AI companies of 2026. Explain the ranking method, show their official websites',count:25});
    }else if(mode==='automatic-parity'){
      assert.deepEqual(Object.keys(body).sort(),['count','query']);
      assert.equal(body.count,10);
      assert.match(body.query,expectedPublicQuery!);
      assert.ok([...body.query].length<=128);
    }else assert.deepEqual(body,{query:'price of btc currently',count:10});
    assert.doesNotMatch(JSON.stringify(body),/UNRELATED_PRIOR|MUST_NOT_LEAVE|substituted planner context|AMBIENT_PRIVATE_REPOSITORY|evil.example|WORKSPACE_INTERNAL_CONTEXT/);
   }
   const results=mode==='automatic-no-sources'?[]:[
    ...(mode==='automatic-official'?[{title:'NASA Eclipses',url:'https://science.nasa.gov/eclipses/',summary:'Public source excerpt',
      site_name:'NASA Science',site_icon:'https://cdn.deepseek.com/site-icons/science.nasa.gov'}]:[]),
    {title:'Public documentation',url:'https://example.com/docs',summary:'Public source excerpt',
     site_name:'Example Exchange',site_icon:'https://cdn.deepseek.com/site-icons/example.com'},
    {title:'Same page',url:'https://example.com/docs#section',summary:'Public source excerpt'},
    ...(mode==='automatic'?[{title:'Archived quote',url:'https://example.org/archive',summary:'Old valuation snapshot',date:'2023-01-01T12:00:00Z'}]:[]),
    ...(mode==='automatic-ranking-expanded-evidence'?Array.from({length:9},(_,index)=>({
     title:`Independent public report ${index+1}`,url:`https://example.org/report/${index+1}`,
     summary:`Public source excerpt for report ${index+1}. `+'Présentation comparative des capacités et résultats vérifiés. '.repeat(28),
    })):[]),
   ];
   return Response.json({results},{headers:{'x-ds-trace-id':'synthetic-search-'+searches}});
  }
  if(url.origin==='https://api.zurelay.com'){
   models++;assert.equal(body.model,'deepseek-v4.1-flash-1017');assert.equal(new Headers(init?.headers).get('x-zurelay-fallback'),'off');
   assert.match(JSON.stringify(body.messages),/Public source excerpt/);assert.match(JSON.stringify(body.messages),/untrusted|external data/i);
   if(mode==='automatic'||mode==='automatic-official'||mode.startsWith('automatic-ranking')||mode==='automatic-parity'){
    const trace='synthetic-search-'+searches;
    assert.equal([...reservations.values()].find(row=>row.provider_request_id===trace)?.status,'settled');
    const objects=await storage.svc.listObjects(ownerActor,{safeFilename:searchFilename});
    const evidence=await Promise.all(objects.map(async object=>({
     object, body:JSON.parse((await storage.svc.readObjectBytes(ownerActor,object.id)).bytes.toString('utf8')),
    })));
    const current=evidence.find(item=>item.body.result.search_id===trace);
    assert.ok(current,'Private evidence must already be verified before synthesis');
    assert.equal(current.body.result.provider,'deepseek');
    assert.equal(current.body.trust,'UNTRUSTED_DATA');
    await assert.rejects(storage.svc.readObjectBytes(storage.bob,current.object.id),{code:'NOT_FOUND'});
    assert.doesNotMatch(JSON.stringify(body.messages),/MUST_NOT_LEAVE|substituted planner context/);
    assert.match(JSON.stringify(body.messages),/UNRELATED_PRIOR_NASA_TURN/);
    assert.equal(body.messages.length,3);
    assert.equal(body.reasoning_effort,undefined);
    if(mode==='automatic'){
     assert.equal(body.max_tokens,16_384);
     assert.match(body.messages[0].content,/Return only the answer, without an OpenUI program/);
     assert.doesNotMatch(body.messages[0].content,/<<<XROGA_OPENUI_V1>>>/);
     assert.match(body.messages[2].content,/Page publication \(source metadata\): 2023-01-01T12:00:00\.000Z/);
     assert.match(body.messages[2].content,/Never average or combine stale/);
    }else if(mode==='automatic-ranking-expanded-evidence'){
     assert.ok(body.max_tokens>20_480,'Keep the planned output budget for a detailed sourced answer');
     assert.match(JSON.stringify(body.messages),/Independent public report 9/);
     assert.match(body.messages[0].content,/<<<XROGA_OPENUI_V1>>>/);
    }else if(mode!=='automatic-parity'){
     assert.equal(body.max_tokens,20_480);
     assert.match(body.messages[0].content,/<<<XROGA_OPENUI_V1>>>/);
     assert.doesNotMatch(body.messages[2].content,/one or two short paragraphs/);
    }
   }else{
    assert.equal(body.max_tokens,4096);
    assert.ok(['json_object','json_schema'].includes(body.response_format.type));
   }
   if(mode==='drop')throw Object.assign(Error('Synthetic dispatch uncertainty'),{name:'AbortError'});
   if(mode.startsWith('automatic-ranking'))assert.ok(body.messages[2].content.includes(rankingPrompt));
   const content=mode==='automatic-ranking-status'?'Web search finished.'
     :mode.startsWith('automatic')?'The public page documents the answer [1](https://wrong.example/page).':raw;
   const sse='data: '+JSON.stringify({id:'synthetic-answer-'+models,model:body.model,
    choices:[{index:0,delta:{content},finish_reason:'stop'}],
    usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}})+'\n\ndata: [DONE]\n\n';
   return new Response(sse,{headers:{'content-type':'text/event-stream','x-request-id':'synthetic-answer-'+models,'x-zurelay-model':body.model}});
  }
  assert.equal(url.origin,env.SUPABASE_URL,'All network is synthetic and bounded');
  if(url.pathname.endsWith('/user_token_usage'))return Response.json({user_id:owner,plan_tier:'spark',plan_budget_usd:20,quota_period_start:new Date().toISOString().slice(0,7)+'-01',input_tokens:0,output_tokens:0,spent_usd:0,rollover_usd:0,model_usage:{}});
  if(url.pathname.endsWith('/model_provider_health'))return Response.json(null);
  if(url.pathname.endsWith('/reserve_xroga_provider_budget')){
   if(body.p_internal_route.startsWith('web.'))assert.equal(body.p_reservation_micro_usd,750);
   else if(mode==='automatic-ranking-expanded-evidence'){
    assert.ok(body.p_reservation_micro_usd>RESEARCH_ANSWER_MAXIMUM_MICRO_USD,'Canonical reservation covers the real evidence and output');
    assert.ok(body.p_reservation_micro_usd<10_000,'Representative request stays within the isolated acceptance allowance');
   }else assert.ok(body.p_reservation_micro_usd<=RESEARCH_ANSWER_MAXIMUM_MICRO_USD);
   const row={id:randomUUID(),user_id:owner,idempotency_key:body.p_idempotency_key,status:'reserved',purpose:body.p_purpose,internal_route:body.p_internal_route,price_version:body.p_price_version,
    estimated_input_tokens:body.p_estimated_input_tokens,maximum_output_tokens:body.p_maximum_output_tokens,reserved_micro_usd:body.p_reservation_micro_usd};reservations.set(row.id,row);
   if(mode==='cancel-at-model-reservation'&&!body.p_internal_route.startsWith('web.'))confirmation.row!.status='cancelled';
   return Response.json(row);
  }
  if(url.pathname.endsWith('/settle_xroga_provider_budget')){
   const row=reservations.get(body.p_reservation_id);Object.assign(row,{status:'settled',settled_micro_usd:body.p_actual_micro_usd,provider_request_id:body.p_provider_request_id,
    actual_input_tokens:body.p_actual_input_tokens,cached_input_tokens:body.p_cached_input_tokens,output_tokens:body.p_output_tokens,reasoning_tokens:body.p_reasoning_tokens,tool_calls:body.p_tool_calls,search_calls:body.p_search_calls});return Response.json(row);
  }
  if(url.pathname.endsWith('/release_xroga_provider_budget')){
   if(mode==='cancel-at-model-reservation')assert.equal(body.p_pending_reconciliation,false);else{assert.equal(body.p_pending_reconciliation,true);unknown++;}
   return Response.json(null);
  }
  if(url.pathname.endsWith('/record_ai_usage_atomic'))return Response.json({userId:owner,receiptId:body.p_receipt_id,modelId:body.p_model_id,poolRole:body.p_pool_role,inputTokens:body.p_input,outputTokens:body.p_output,costUsd:body.p_cost_usd,ledgerId:'1',period:new Date().toISOString().slice(0,7)+'-01',replayed:false,usage:{user_id:owner}});
  if(url.pathname.endsWith('/production_audit_log')&&mode.startsWith('automatic')){
   assert.equal(body.metadata.classification,'PUBLIC');
   assert.equal(body.outcome,'ALLOW');
   assert.equal(body.user_id,owner);
   assert.doesNotMatch(JSON.stringify(body),/NASA|price of btc|substituted planner context/);
   automaticAuditCount++;
   if(mode==='automatic-audit-failure')return Response.json({message:'synthetic unavailable'},{status:503});
  }
  if(url.pathname.endsWith('/xroga_web_usage'))return new Response(null,{status:201});
  const response=await confirmation.database(url,init);if(response)return response;
  throw Error('Unexpected fixture request '+url.pathname);
 });
 const prompt='Show a table of documented options with citations.';
 const goal=goalContractSchema.parse({version:'1.0',goal:prompt,desiredOutcome:prompt,semanticIntent:'INVESTIGATE',requiredCapabilities:['conversation.respond','research.public-web'],requiredAuthorities:[],
  freshnessRequirement:'CURRENT_REQUIRED',sourcePolicy:{mode:'any',scope:'public_web',officialDomains:[]},confidence:1,blockers:[]});
 assert.equal(researchAnswerRequestSchema.safeParse({prompt,goalContract:{...goal,semanticIntent:'EXTERNAL_ACTION'}}).success,false);
 assert.equal(researchAnswerRequestSchema.safeParse({prompt,goalContract:{...goal,requiredCapabilities:[...goal.requiredCapabilities,'repository.read']},projectEvidence:'Authorized read-only repository snapshot'}).success,true);
 const pending=await runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal});
 assert.equal(pending.intent,'confirmation_required');assert.equal(searches,0);assert.equal(models,0);
 const id=confirmation.row!.id;
 assert.equal(confirmation.row!.plan.authority!.maxSpendMicroUsd,'5750');assert.match(String(confirmation.row!.summary),/ONE DeepSeek answer/);
 await assert.rejects(confirmBusinessAction(createTenantContext({userId:foreign,via:'remote_getuser'}),id));assert.equal(searches,0);
 await confirmBusinessAction(context,id);assert.equal(searches,1);assert.equal(models,1);assert.equal(unknown,0);
 const saved=await readResearchResult(context,await getBusinessActionConfirmation(owner,id));
 assert.ok(saved?.answer,JSON.stringify(saved));assert.equal(saved.sources.length,1);assert.equal(saved.answer.completion.status,'complete');
 assert.match(saved.answer.response,/xroga-ui/);assert.equal(saved.answer.responseSource?.text,raw);assert.equal(saved.answer.webSources.length,1);
 await assert.rejects(confirmBusinessAction(context,id));assert.equal(searches,1);assert.equal(models,1);
 // Reopening independently reads the private stored answer, not a provider.
 assert.deepEqual(await readResearchResult(context,await getBusinessActionConfirmation(owner,id)),saved);
 assert.equal(searches,1);assert.equal(models,1);
 mode='drop';await runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal});const uncertain=confirmation.row!.id;
 await confirmBusinessAction(context,uncertain);assert.equal(searches,2);assert.equal(models,2);assert.equal(unknown,1);
 const failed=await readResearchResult(context,await getBusinessActionConfirmation(owner,uncertain));
 assert.equal(failed?.answerFailure,'SYNTHESIS_UNAVAILABLE');assert.equal(failed?.sources.length,1);assert.equal(failed?.answer,undefined);
 await assert.rejects(confirmBusinessAction(context,uncertain));assert.equal(searches,2);assert.equal(models,2);
 mode='ok';const held=reservations.size;
 await assert.rejects(runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal,modelScope:{context,userId:owner,connectedAccountId:'platform',maximumCostMicroUsd:1},
  approvedResearch:{bundle:{query:prompt,summary:'Retrieved data',provider:'parallel',sources:saved.answer.webSources},evidence:'Untrusted retrieved data'}}));
 assert.equal(models,2);assert.equal(reservations.size,held,'A restrictive synthesis cap must fail before reservation and HTTP');
 await runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal});const changed=confirmation.row!;
 changed.plan.arguments.answerRequest={...(changed.plan.arguments.answerRequest as object),prompt:'A substituted original request'};
 changed.plan.planDigest=actionPlanDigest(changed.plan);changed.plan_digest=changed.plan.planDigest;
 await assert.rejects(confirmBusinessAction(context,changed.id));assert.equal(searches,2);assert.equal(models,2);
 await runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal});const revoked=confirmation.row!.id;mode='cancel-at-model-reservation';
 await assert.rejects(confirmBusinessAction(context,revoked));assert.equal(searches,3);assert.equal(models,2,'Revalidate original claim after budget wait, immediately before model bytes');
 const forged=presentResearchResult({ok:true,operation:'search',result:{results:[{url:'https://example.com/docs',title:'Actual source',excerpts:['Actual excerpt']}]},
  answer:{...saved.answer,webSources:[{...saved.answer.webSources[0],url:'https://unretrieved.example/page'}]}});
 assert.equal(forged.answer,undefined);assert.equal(forged.answerFailure,'INVALID_SAVED_ANSWER');assert.equal(forged.sources.length,1);
 mode='ok';const reservedBeforeSecret=reservations.size;
 await assert.rejects(runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal,
  history:[{role:'user',content:'SYNTHETIC_CREDENTIAL_CANARY_MUST_NOT_LEAVE'}]}));
 assert.equal(searches,3);assert.equal(models,2);assert.equal(reservations.size,reservedBeforeSecret,'Credential-bearing continuation context cannot acquire approval or dispatch');

 const currentPrompt='price of btc currently';
 const currentGoal=goalContractSchema.parse({...goal,goal:'substituted planner context',desiredOutcome:'substituted planner context',
  requiredCapabilities:['conversation.respond'],projectContext:{repo:'example/AMBIENT_PRIVATE_REPOSITORY',branch:'main'}});
 const automaticRequest={userId:owner,tenantContext:context,prompt:currentPrompt,goalContract:currentGoal,workspaceSearch:{prompt:currentPrompt},
  history:[{role:'user' as const,content:unrelatedHistory},{role:'assistant' as const,content:'SYNTHETIC_CREDENTIAL_MUST_NOT_LEAVE'}]};
 const withPublicPrompt=(prompt:string)=>({...automaticRequest,prompt,workspaceSearch:{prompt}});
 const confirmedRow=confirmation.row;
 process.env.XROGA_NATIVE_OPENUI_WORKSPACE='1';
 mode='automatic';
 const automatic=await runChatPipeline(automaticRequest);
 assert.equal(automatic.publicWebRetrieved,true);assert.equal(automatic.intent,'research');
 assert.equal(automatic.webSources?.[0]?.siteName,'Example Exchange');assert.equal(automatic.webSources?.[0]?.siteIconDomain,'example.com');
 assert.equal(automatic.responseSource?.format,'xroga-openui-v1');
 assert.match(automatic.response,/https:\/\/example.com\/docs/);assert.doesNotMatch(automatic.response,/wrong.example|Review action/);
 assert.equal(searches,4);assert.equal(models,3);assert.equal(automaticAuditCount,1);assert.equal(confirmation.row,confirmedRow);
 const automaticSearch=[...reservations.values()].find(row=>row.provider_request_id==='synthetic-search-4');
 assert.equal(automaticSearch?.settled_micro_usd,750);assert.equal(automaticSearch?.search_calls,1);

 mode='ok';
 for (const privatePrompt of [
   'Search my confidential client notes for latest account details',
   'Look up the current release notes at https://docs.example.org/?session=TEST_PRIVATE_ID',
 ]) {
   const unavailable=await runChatPipeline(withPublicPrompt(privatePrompt));
   assert.equal(unavailable.intent,'research_unavailable');
   assert.equal(unavailable.publicWebRetrieved,undefined);
   assert.doesNotMatch(unavailable.response,/confirm|review action|TEST_PRIVATE_ID/i);
 }
 assert.equal(confirmation.row,confirmedRow,'Workspace must never create a research confirmation');
 assert.equal(searches,4);assert.equal(models,3);

 mode='automatic-no-sources';
 await assert.rejects(runChatPipeline(automaticRequest),{code:'TOOL_UNAVAILABLE'});
 assert.equal(searches,5);assert.equal(models,3);assert.equal(automaticAuditCount,2);
 const emptySearch=[...reservations.values()].find(row=>row.provider_request_id==='synthetic-search-5');
 assert.equal(emptySearch?.settled_micro_usd,0);assert.equal(emptySearch?.search_calls,1);

 mode='automatic-audit-failure';const beforeDeniedReservation=reservations.size;
 await assert.rejects(runChatPipeline(automaticRequest));
 assert.equal(searches,5);assert.equal(models,3);assert.equal(reservations.size,beforeDeniedReservation);
 const abort=new AbortController();abort.abort();
 await assert.rejects(runChatPipeline({...automaticRequest,workspaceSearch:{prompt:currentPrompt,signal:abort.signal}}));
 assert.equal(searches,5);assert.equal(models,3);assert.equal(reservations.size,beforeDeniedReservation);

 mode='automatic-official';
 const nasaPrompt='Using only official NASA sources, look up the difference between solar and lunar eclipses, why they don’t happen every month, and cite your sources.';
 const nasaGoal=goalContractSchema.parse({...currentGoal,sourcePolicy:{mode:'official_only',scope:'public_web',officialDomains:['evil.example']}});
 const nasa=await runChatPipeline({...withPublicPrompt(nasaPrompt),goalContract:nasaGoal});
 assert.equal(nasa.publicWebRetrieved,true);assert.equal(nasa.webSources?.length,1);
 assert.equal(nasa.webSources?.[0]?.siteIconDomain,'science.nasa.gov');
 assert.match(nasa.response,/https:\/\/science.nasa.gov\/eclipses\//);
 assert.equal(searches,6);assert.equal(models,4);

 const heldBeforeStorage=reservations.size, auditsBeforeStorage=automaticAuditCount;
 setStorageServiceForTests(undefined);
 try { await assert.rejects(runChatPipeline(automaticRequest),{code:'PROVIDER_UNAVAILABLE'}); }
 finally { setStorageServiceForTests(storage.svc); }
 assert.equal(searches,6);assert.equal(models,4);
 assert.equal(automaticAuditCount,auditsBeforeStorage);assert.equal(reservations.size,heldBeforeStorage);

 mode='ok';
 const projectUnavailable=await runChatPipeline({
   ...withPublicPrompt('Find the latest release schedule for this project.'),
   projectEvidence:'MUST_NOT_LEAVE repository evidence.',
 });
 assert.equal(projectUnavailable.intent,'research_unavailable');
 assert.equal(projectUnavailable.publicWebRetrieved,undefined);
 assert.equal(confirmation.row,confirmedRow);
 assert.equal(searches,6);assert.equal(models,4);

 const lastConfirmation=confirmation.row;
 const ranking={...withPublicPrompt(rankingPrompt),
  goalContract:goalContractSchema.parse({...currentGoal,semanticIntent:'PROPOSE',sourcePolicy:{mode:'official_only',scope:'public_web',officialDomains:['evil.example']}})};
 mode='automatic-ranking';
 const ranked=await runChatPipeline(ranking);
 assert.equal(ranked.intent,'research');
 assert.equal(ranked.publicWebRetrieved,true);
 assert.match(ranked.response,/https:\/\/example.com\/docs/);
 assert.doesNotMatch(ranked.response,/Review action|Web search finished/);
 assert.equal(confirmation.row,lastConfirmation);
 assert.equal(searches,7);assert.equal(models,5);
 assert.equal([...reservations.values()].find(row=>row.provider_request_id==='synthetic-search-7')?.settled_micro_usd,750);

 mode='automatic-ranking-status';
 const partial=await runChatPipeline(ranking);
 assert.equal(partial.completion?.status,'partial');
 assert.match(partial.response,/couldn’t finish the answer/);
 assert.doesNotMatch(partial.response,/Review action|Web search finished/);
 assert.equal(partial.publicWebRetrieved,true);
 assert.ok(partial.webSources?.length);
 assert.equal(confirmation.row,lastConfirmation);
 assert.equal(searches,8);assert.equal(models,6);

 const ambiguous=await runChatPipeline(withPublicPrompt('What should I know about that?'));
 assert.equal(ambiguous.intent,'research_unavailable');
 assert.match(ambiguous.response,/public topic/i);
 assert.equal(confirmation.row,lastConfirmation,'An unclassified public query must not manufacture a write approval');
 assert.equal(searches,8);assert.equal(models,6);

 mode='automatic-parity';
 for(const [prompt,query] of [
  ['Compare the newest stable Next.js release and the previous major version. Mention official release dates and upgrade risks.',/Next\.js release/],
  ['Compare three cloud application hosting options for a small startup with a $100/month infrastructure budget. Distinguish assumptions from verified current pricing.',/\$100 per month.*current pricing/],
  ['Who is the current CEO of Microsoft, and which official source confirms it?',/CEO of Microsoft/],
 ] as const){
  expectedPublicQuery=query;
  const answer=await runChatPipeline({
   ...withPublicPrompt(prompt),
   goalContract:ranking.goalContract,
   projectEvidence:'Authorized repository context WORKSPACE_INTERNAL_CONTEXT.',
  });
  assert.equal(answer.intent,'research');
  assert.equal(answer.publicWebRetrieved,true);
  assert.match(answer.response,/https:\/\/example\.com\/docs/);
  assert.doesNotMatch(answer.response,/Review action|Web search finished/);
  assert.equal(confirmation.row,lastConfirmation);
 }
 assert.equal(searches,11);assert.equal(models,9);

 mode='automatic-storage-failure';
 const storedBeforeFailure=(await storage.svc.listObjects(ownerActor,{safeFilename:searchFilename})).length;
 await assert.rejects(runChatPipeline(automaticRequest),{code:'PROVIDER_UNAVAILABLE'});
 assert.equal(searches,12,'A failed private write must not repeat retrieval');
 assert.equal(models,9,'Unstored retrieval must not enter synthesis');
 assert.equal((await storage.svc.listObjects(ownerActor,{safeFilename:searchFilename})).length,storedBeforeFailure);
 const failedWriteSearch=[...reservations.values()].find(row=>row.provider_request_id==='synthetic-search-12');
 assert.equal(failedWriteSearch?.status,'settled');
 assert.equal(failedWriteSearch?.search_calls,1);
 assert.equal(confirmation.row,lastConfirmation);

 mode='automatic-ranking-expanded-evidence';
 const expandedGoal=goalContractSchema.parse({...ranking.goalContract,presentation:[
  {kind:'prose',heading:'Method',instruction:'Explain the research criteria'},
  {kind:'table',heading:'Ranked companies',instruction:'Compare all ranked companies and link their official websites'},
  {kind:'prose',heading:'Scope and tradeoffs',instruction:'Explain limitations and differences'},
  {kind:'table',heading:'Evidence by criterion',instruction:'Show where public evidence supports each criterion'},
 ]});
 const expanded=await runChatPipeline({...ranking,goalContract:expandedGoal});
 assert.equal(expanded.publicWebRetrieved,true);
 assert.deepEqual(expanded.completion,{status:'partial',reason:'source_coverage'},
  'Having enough retrieved pages does not deliver the official links requested for each row');
 assert.equal(expanded.webSources?.length,10);
 assert.equal(searches,13);
 assert.equal(models,10,'A full public source set reaches exactly one synthesis call');
 assert.equal(confirmation.row,lastConfirmation);

 mode='automatic-parity';
 expectedPublicQuery=/^narwhals$/u;
 const explicit = await runChatPipeline({
  ...withPublicPrompt('Could you search the public web for narwhals?'),
  goalContract:goalContractSchema.parse({...currentGoal,semanticIntent:'ANSWER',freshnessRequirement:'NONE'}),
 });
 assert.equal(explicit.intent,'research');
 assert.equal(explicit.publicWebRetrieved,true,'The typed public Search request survives a plan that selected ordinary chat');
 const consumer=publicWorkspaceResearchAnswer(explicit);
 assert.match(consumer.response,/https:\/\/example\.com\/docs/);
 assert.doesNotMatch(JSON.stringify(consumer),/Review action|Confirm action|approval|settled_micro_usd|provider_request_id/i);
 assert.equal(searches,14);assert.equal(models,11);
 assert.equal(confirmation.row,lastConfirmation,'Public Search may not create a sensitive-action approval');

 expectedPublicQuery=/^Published findings on quipu knot patterns$/u;
 const selected = await runChatPipeline(withPublicPrompt('Published findings on quipu knot patterns.'));
 const published = publicWorkspaceResearchAnswer(selected);
 assert.equal(selected.publicWebRetrieved,true);
 assert.match(published.response,/https:\/\/example\.com\/docs/);
 assert.doesNotMatch(JSON.stringify(published),/Review action|Confirm action|settled_micro_usd|provider_request_id/i);
 assert.equal(searches,15);assert.equal(models,12);
 assert.equal(confirmation.row,lastConfirmation);
});

test('automatic Search eligibility uses the literal public topic and declines ambiguous or private requests',()=>{
 assert.deepEqual(workspacePublicSearchQuery('price of btc currently'),{query:'price of btc currently',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Research the latest NASA lunar mission schedule.'),
  {query:'the latest NASA lunar mission schedule',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Find one-way fares from Lahore to Karachi.'),
  {query:'Find one-way fares from Lahore to Karachi',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Search the web for how lunar eclipses happen, and cite your sources.'),
  {query:'how lunar eclipses happen',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Weather in Karachi'),
  {query:'Weather in Karachi',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('What is the weather in Karachi?'),
  {query:'weather in Karachi',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('What are the public holidays in France this year?'),
  {query:'public holidays in France this year',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Search the web for the lifespan of a blue whale.'),
  {query:'the lifespan of a blue whale',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Who is the current president of France?'),
  {query:'Who is the current president of France',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Who is the CEO of Apple?'),
  {query:'Who is the CEO of Apple',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Please browse the public internet to explain how HTTP idempotency keys work. Include your citations.'),
  {query:'explain how HTTP idempotency keys work',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Search the web using only official NASA sources (nasa.gov). Explain how eclipses happen, and cite your sources.',true),
  {query:'Explain how eclipses happen site:nasa.gov',officialDomains:['nasa.gov']});
 assert.deepEqual(workspacePublicSearchQuery('Official support links for Microsoft, Apple and Google in one table.'),
  {query:'Official support links for Microsoft, Apple and Google in one table',officialDomains:[]});
 for(const [prompt,query] of [
  ['Could you search the public web for kintsugi repair techniques for chipped porcelain?','kintsugi repair techniques for chipped porcelain'],
  ['Search the public web for an explanation of giant kelp ecosystems.','an explanation of giant kelp ecosystems'],
  ['Run a web search for acoustic illusions using repeated tones.','acoustic illusions using repeated tones'],
  ['Research online for a guide to adapting card weaving patterns.','a guide to adapting card weaving patterns'],
  ['Search the web for CSS :has() selector examples','CSS :has() selector examples'],
 ]) assert.deepEqual(workspacePublicSearchQuery(prompt),{query,officialDomains:[]},prompt);
 for(const prompt of ['Current notes in my inbox','What is the latest private customer list',
  'Search the web for John Smith','Who is Jane Doe currently working for',
  'Search the public web for John Michael Smith','Search the public web for john smith in London',
  'Search the public web for an overview of John Smith','Search online for what we talked about before',
  'Could you search the public web for techniques using the attached customer names?',
  'Run a web search for this person',
  'Search for name associated with 123-45-6789','Search the latest details on https://example.org/query',
  'Search the web using only official sources (edge.local). Explain the public topic.',
  'Search the web using only official sources (staging.example.com). Explain a public topic.',
  'Search latest NASA data from wikipedia.org',
  'Search realistic explanations of lunar phases and eclipses using orbital geometry and the distance to the moon throughout the year. Here is the customer account number 123-45-6789.',
  'Search earlier chat for confidential data','Do not search the web for the current exchange rate',
  'Search the web for how my client account works, and cite your sources.',
  'Find the latest release schedule for this project, and cite your sources.',
  'Search the web for the current repository documentation.',
  'Search the web for how to find Jane Doe’s phone number, and cite your sources.',
  'Search the web for how the attached spreadsheet works. Include your citations.',
  'Search the web to explain how 123-45-6789 is used and cite your sources.',
  'Weather in our unpublished client event location',
  'Forecast for my daughter’s address',
  'Who is the CEO of our confidential acquisition target?',
  'Search the web for the lifespan in the attached notes','Official support links for our private vendors',
  'Search the web for'])assert.equal(workspacePublicSearchQuery(prompt),undefined,prompt);
});

test('public discovery includes implicit rankings and comparisons without exporting private context',()=>{
 for(const prompt of [
  'top 10 best ai companies of 2026',
  'top 10 best ai comapines of 2026',
  'Best payment providers 2026',
  'Compare cloud hosting services',
  'Leading cybersecurity companies',
  'Top universities worldwide',
  'Most recent AI models',
  '2026 electric car market leaders',
  'Las mejores universidades del mundo en 2026',
  'أفضل شركات الذكاء الاصطناعي في 2026',
  '2026 की सबसे अच्छी एआई कंपनियाँ कौन सी हैं?',
  '2026 年最好的人工智能公司有哪些？',
  '查找关于漆器修复的资料并引用来源',
  'पक्षियों के प्रवास पर प्रकाशित अध्ययन ढूँढें',
  'Find research on volcanic glass weathering',
  'Compare acoustic effects of vaulted and flat ceilings',
  'Search the web for narwhals',
  'Search the web for CSS :has() selector examples',
  'Find how C++23 ranges work.\nCreate a compact comparison table.',
  'Top 10 best AI companies in 2026; official sites, ranking criteria, and dated sources.',
 ]) {
  const result=workspacePublicSearchQuery(prompt);
  assert.ok(result?.query,prompt);
  assert.deepEqual(result.officialDomains,[]);
 }
 for(const prompt of [
  'Top 10 customers using my CRM and attached spreadsheet',
  'Compare cloud services with the prices in the current project',
  'Rank payment providers using data from our CRM',
  'Current industry leaders with contacts at mary@example.com',
  'Top AI companies, include the confidential vendor list',
  'Las mejores empresas según nuestro archivo privado',
  'أفضل شركات الذكاء الاصطناعي بناء على بياناتنا الداخلية',
  'Top AI companies, no web search',
  'Rank these companies using the previous answer',
  'Top 10 AI companies; use the confidential customer list.',
  'Look up this result using site:intranet.example.',
  'Search the web for client\naccount details.',
 ]) assert.equal(workspacePublicSearchQuery(prompt),undefined,prompt);
});

test('a named official publisher fixes the source scope without a model-supplied host', () => {
  const prompt = 'Using only official NIST pages, look up the NIST Cybersecurity Framework 2.0 functions. Present the function names and what each is for in one compact copyable table. Cite the actual primary source beside the claims. Do not take any actions.';
  const nist = workspacePublicSearchQuery(prompt, true);
  assert.deepEqual(nist, {
    query: '"NIST Cybersecurity Framework" 2.0 site:csrc.nist.gov OR site:nvlpubs.nist.gov',
    officialDomains: ['nist.gov'],
    originalSourceQuestion: 'Find the original publication for NIST Cybersecurity Framework 2.0 functions.',
  });
  assert.deepEqual(workspacePublicSearchQuery('Find streamflow measurements using only official U.S. Geological Survey pages.', true), {
    query: 'Find streamflow measurements site:usgs.gov', officialDomains: ['usgs.gov'],
  });
  assert.deepEqual(workspacePublicSearchQuery('Using only official NIST and NASA pages, compare their public software assurance guidelines.', true)?.officialDomains,
    ['nist.gov', 'nasa.gov']);
  assert.deepEqual(workspacePublicSearchQuery('Using only official pages (nist.gov), look up the latest NIST digital identity guidance.', true)?.officialDomains,
    ['nist.gov']);
  const secondWork = workspacePublicSearchQuery('Using only official NIST pages, look up the NIST Digital Identity Guidelines 4.0 requirements. Cite the primary standard.', true);
  assert.match(secondWork?.query ?? '', /"NIST Digital Identity Guidelines" 4\.0 site:csrc\.nist\.gov OR site:nvlpubs\.nist\.gov$/u);
  const exactHost = workspacePublicSearchQuery('Using only official pages (nvlpubs.nist.gov), look up the NIST Cybersecurity Framework 2.0 functions. Cite the primary source.', true);
  assert.match(exactHost?.query ?? '', /site:nvlpubs\.nist\.gov$/u);
  assert.doesNotMatch(exactHost?.query ?? '', /site:csrc\.nist\.gov/u);
  assert.deepEqual(workspacePublicSearchQuery('Search the public web for the NOAA definition of a marine heatwave. Use only official NOAA pages (noaa.gov). Give the duration and threshold. Do not take any external action.', true), {
    query: 'the NOAA definition of a marine heatwave. Give the duration and threshold site:noaa.gov',
    officialDomains: ['noaa.gov'],
  });
  for (const denied of [
    'Using only official Unknown Agency pages, find current published records.',
    'Using only official NIST and Unknown Agency pages, compare public standards.',
    'Using only official NIST pages, check summaries from example.com.',
    'Using only official USGS pages, compare streamflow with my attached customer records.',
    'Using only official NASA sources, compare schedules. Do not search the web.',
    'Using only official NASA pages, find upcoming mission dates. Present the results and my attached notes in a table.',
    'Use only official NIST sources.',
  ]) assert.equal(workspacePublicSearchQuery(denied, true), undefined, denied);
});

test('combined research and presentation preserve publisher scope and precise retrieval terms', () => {
  const criteria = 'Search the public web using W3C sources for WCAG 2.2 criteria 2.4.11, 2.5.8, and 3.3.8. For a fictional mobile checkout, present one compact table with the criterion, its actual requirement, and one practical QA test. Cite the relevant W3C page beside each row. Finish with a three-step QA checklist. Keep exceptions separate from the main rule.';
  assert.deepEqual(workspacePublicSearchQuery(criteria, true), {
    query: 'WCAG 2.2 criteria 2.4.11, 2.5.8, and 3.3.8 site:w3.org',
    officialDomains: ['w3.org'],
  });
  const lithium = 'Find the USGS Mineral Commodity Summaries 2026 figures for estimated 2025 lithium mine production in Australia, China, Chile, and Argentina. Make a labeled horizontal bar chart and a compact exact-value table in metric tons of lithium content. Cite the primary USGS table, then calculate the four countries’ combined share of the reported world total and label it approximate. Distinguish production from reserves and use only USGS sources.';
  const usgs = workspacePublicSearchQuery(lithium, true);
  assert.deepEqual(usgs?.officialDomains, ['usgs.gov']);
  assert.match(usgs?.query ?? '', /Mineral Commodity Summaries 2026.*lithium mine production in Australia, China, Chile, and Argentina.*site:usgs\.gov/u);
  assert.match(usgs?.originalSourceQuestion ?? '', /Source table:.*2025 lithium mine production in Australia, China, Chile, and Argentina$/u);
  assert.ok([...usgs!.originalSourceQuestion!].length <= 128);
  const artemis = 'Using current official NASA sources, compare Artemis II and Artemis III. Show mission purpose, most recent verified milestone, and the next published milestone in a compact table. Cite the NASA page beside each date. Add a short timeline that distinguishes completed events from forecasts, and flag any date that NASA has not confirmed.';
  const nasa = workspacePublicSearchQuery(artemis, true);
  assert.deepEqual(nasa?.officialDomains, ['nasa.gov']);
  assert.match(nasa?.query ?? '', /^compare Artemis II and Artemis III.*site:nasa\.gov$/u);
  assert.equal(workspacePublicSearchQuery(criteria + ' Use the attached internal audit as well.', true), undefined);
  assert.equal(workspacePublicSearchQuery('Find published streamflow data. Use only Fictional Laboratory sources.', true), undefined);
});

test('a guide about a named publication cannot substitute for the requested original', () => {
  const prompt = 'Using only official NIST pages, look up the NIST Cybersecurity Framework 2.0 functions. Cite the primary source.';
  const guide = { title: 'NIST Cybersecurity Framework 2.0 Quick-Start Guide', url: 'https://www.nist.gov/publications/guide' };
  const original = { title: 'The NIST Cybersecurity Framework (CSF) 2.0 | NIST', url: 'https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf' };
  const text = 'The framework includes six functions [1].';
  const missing = presentPublicResearchAnswer(text, { status: 'complete' }, [guide], prompt);
  assert.deepEqual(missing.completion, { status: 'partial', reason: 'source_coverage' });
  assert.match(missing.response, /couldn’t verify the requested original publication/u);
  const slides = { title: 'NIST Cybersecurity Framework 2.0', url: 'https://csrc.nist.gov/csrc/media/Presentations/2024/csf-panel.pdf' };
  assert.deepEqual(presentPublicResearchAnswer(text, { status: 'complete' }, [slides], prompt).completion,
    { status: 'partial', reason: 'source_coverage' });
  assert.deepEqual(presentPublicResearchAnswer(text, { status: 'complete' }, [original], prompt).completion, { status: 'complete' });
  const officialRecord = {
    title: 'CSWP 29, The NIST Cybersecurity Framework (CSF) 2.0 | CSRC',
    url: 'https://csrc.nist.gov/pubs/cswp/29/the-nist-cybersecurity-framework-csf-20/final',
  };
  assert.deepEqual(presentPublicResearchAnswer(text, { status: 'complete' }, [officialRecord], prompt).completion, { status: 'complete' });

  const acronymPrompt = 'Using only official W3C pages, find the WCAG 2.2 criteria and cite the final standard.';
  const standard = { title: 'Web Content Accessibility Guidelines (WCAG) 2.2', url: 'https://www.w3.org/TR/WCAG22/' };
  assert.deepEqual(presentPublicResearchAnswer('The standard has criteria [1].', { status: 'complete' }, [standard], acronymPrompt).completion,
    { status: 'complete' });
});

test('primary source lookup preserves the requested type without exporting other instructions', () => {
  assert.deepEqual(workspacePublicSearchQuery('Using only official USGS pages, look up recent streamflow measurements. Cite the original dataset.'), {
    query: 'recent streamflow measurements dataset site:usgs.gov',
    officialDomains: ['usgs.gov'],
    originalSourceQuestion: 'Find the original dataset for recent streamflow measurements.',
  });
  assert.deepEqual(workspacePublicSearchQuery('Using only official W3C pages, find the WCAG 2.2 criteria and cite the final standard.', true), {
    query: '"WCAG" 2.2 standard site:w3.org',
    officialDomains: ['w3.org'],
    originalSourceQuestion: 'Find the final standard for WCAG 2.2 criteria.',
  });
  assert.equal(workspacePublicSearchQuery('Using only official W3C pages, find the WCAG 2.2 criteria. Cite the original source and compare it with our internal audit.', true), undefined);
});

test('an official source restriction does not demand an official website for each answer item', () => {
  const sources = [{ url: 'https://www.nist.gov/publications/nist-cybersecurity-framework-csf-20' }];
  const response = 'The framework contains six functions [1].';
  for (const prompt of [
    'Using only official NIST pages, explain the functions and cite the original publication.',
    'Summarize the functions using official NIST websites.',
    'Using only official pages, explain the functions.',
  ]) {
    assert.equal(requestsOfficialLinkCoverage(prompt), false, prompt);
    assert.deepEqual(presentPublicResearchAnswer(response, { status: 'complete' }, sources, prompt), {
      response,
      completion: { status: 'complete' },
    });
  }
  for (const prompt of [
    'Using only official NIST pages, list the initiatives and include their official websites.',
    'Give me a table with official company websites.',
    'Official support links for Microsoft, Apple and Google in one table.',
  ]) assert.equal(requestsOfficialLinkCoverage(prompt), true, prompt);
});

test('query cleanup preserves factual follow-up clauses and dotted version numbers', () => {
  const lookup = 'Research the latest PostgreSQL 18.1 release notes. Include release dates and security fixes.';
  assert.match(workspacePublicSearchQuery(lookup)?.query ?? '', /18\.1.*release dates and security fixes/u);
});

test('public current roles, recent documentation changes and named sources enter automatic Search', () => {
  for (const prompt of [
    'Who currently leads WHO? Link the official organization page.',
    'Rank five official cloud documentation sites for beginners; link all five.',
    'Find a current official React deprecation notice and exact announcement.',
    'Summarize two dated public sources about browser automation.',
    'Explain a recent Chrome change separating reported behavior and inference.',
  ]) assert.ok(workspacePublicSearchQuery(prompt), prompt);
  for (const prompt of [
    'Who currently leads our private CRM? Link the official organization page.',
    'Who currently leads my company? Link the official organization page.',
    'Who is the CEO of Apple? Who is Jane Doe?',
    'Find recent changes in the attached client records.',
    'Rank five official cloud documentation sites; include this private CRM list.',
    'Summarize two dated public sources about our private employees.',
  ]) assert.equal(workspacePublicSearchQuery(prompt),undefined,prompt);
});

test('public research can request an explanation without exporting editorial instructions or private context', () => {
  for (const [prompt, query] of [
    ['Compare cloud hosting services. Give your ranking criteria and cite official sources.', 'Compare cloud hosting services'],
    ['Search the web for the newest stable Node.js release, give your reasoning.', 'the newest stable Node.js release'],
    ['Find the latest train fares and explain your methodology.', 'Find the latest train fares'],
  ]) {
    assert.equal(hasNonPublicSearchTerms(prompt), false, prompt);
    assert.equal(workspacePublicSearchQuery(prompt)?.query, query, prompt);
  }
  for (const prompt of [
    'Compare hosting services. Explain your criteria from the attached spreadsheet.',
    'Find the latest train fares and give your recommendation, then include our itinerary.',
    'Research the newest release and explain your reasoning using my private notes.',
  ]) {
    assert.equal(hasNonPublicSearchTerms(prompt), true, prompt);
    assert.equal(workspacePublicSearchQuery(prompt), undefined, prompt);
  }
});

test('public policy publishers can be researched without admitting internal policy requests', () => {
  for (const prompt of [
    'Which government department published the latest UK heat-pump subsidy policy?',
    'Which regulator issued the recent guidance on Australian bank disclosures?',
    'What ministry announced the latest French school assessment rules?',
  ]) {
    assert.equal(workspacePublicSearchQuery(prompt)?.query, prompt.slice(0, -1));
  }
  assert.equal(workspacePublicSearchQuery('I need a public source: which agency published the latest policy?')?.query,
    'which agency published the latest policy');
  assert.equal(workspacePublicSearchQuery('Please cite dated public sources: Which ministry recently issued the latest flood rules?')?.query,
    'Which ministry recently issued the latest flood rules');
  for (const prompt of [
    'Which department published our latest policy?',
    'Which department issued the latest guidance in the attached file?',
    'What regulator announced the latest policy using our draft as context?',
    'Which department published the latest policy? Do not browse.',
    'Use public sources: which commission published our latest internal policy?',
    'I need a public source: which ministry published the latest rule? Do not browse.',
    'What is the latest policy?',
  ]) assert.equal(workspacePublicSearchQuery(prompt), undefined, prompt);
});

test('automatic Search distinguishes software names, public pricing units, and source citation preferences from private URLs',()=>{
 const versions=workspacePublicSearchQuery('Compare the newest stable Next.js release and the previous major version. Mention official release dates and upgrade risks.');
 assert.match(versions?.query??'',/Next\.js release/);
 assert.deepEqual(versions?.officialDomains,[]);
 const hosting=workspacePublicSearchQuery('Compare three cloud application hosting options for a small startup with a $100/month infrastructure budget. Distinguish assumptions from verified current pricing.');
 assert.match(hosting?.query??'',/\$100 per month/);
 assert.match(hosting?.query??'',/\bcurrent pricing\b/);
 assert.ok([...hosting!.query].length <= 128);
 const executive='Who is the current CEO of Microsoft, and which official source confirms it?';
 assert.deepEqual(workspacePublicSearchQuery(executive,true),workspacePublicSearchQuery(executive));
 assert.ok(workspacePublicSearchQuery(executive,true));
 assert.deepEqual(workspacePublicSearchQuery('Research the latest Next.js release using only official sources (nextjs.org).',true)?.officialDomains,['nextjs.org']);
 for(const prompt of [
  'Find the latest version documented at Next.js.private.example.com.',
  'Find the latest software releases listed at example.js.',
  'Research the latest Next.js release on https://next.js/path.',
  'Find public pricing at $100/month using our internal subscription list.',
  'Find current pricing for customer account 12345678 at $100/month.',
  'Compare the newest release of Node.js using only official sources.',
  'Who is the current CEO of our private client, and which official source confirms it?',
 ]) assert.equal(workspacePublicSearchQuery(prompt,true),undefined,prompt);
});

test('citation links always point at the retrieved source they number, never at a model-written address',()=>{
 const sources=[{url:'https://nextjs.org/blog/next-16'},{url:'https://github.com/vercel/next.js/releases'}];
 const out=bindCitationLinks('See [1](https://evil.example/x) and [2](<https://github.com/vercel/next.js/releases?x=1>), also [3](https://other.example/y).\n```\n[1](https://keep.example/code)\n```\n',sources);
 assert.match(out,/\[1\]\(https:\/\/nextjs\.org\/blog\/next-16\)/);
 assert.match(out,/\[2\]\(https:\/\/github\.com\/vercel\/next\.js\/releases\)/);
 assert.match(out,/also \[3\]\./,'a number with no retrieved source remains visible as text');
 assert.doesNotMatch(out,/other\.example/,'an unresolved source cannot be opened from the answer');
 assert.match(out,/```\n\[1\]\(https:\/\/keep\.example\/code\)\n```/,'fenced code is never rewritten');
 assert.deepEqual(researchCitationIssues(bindCitationLinks('Claim [1](https://wrong.example) and [2].',sources),sources),[]);
 const code='Use `[1](https://keep.example/code)` and ``example `[77]` [1](https://keep.example/more)``.';
 const withInlineCode=bindCitationLinks('Claim [1](https://wrong.example). '+code,sources);
 assert.equal(withInlineCode,'Claim [1](https://nextjs.org/blog/next-16). '+code);
 assert.deepEqual(researchCitationIssues(withInlineCode,sources),[]);
 const unresolved=bindCitationLinks('Claim [3](<https://wrong.example/path_(label)> "Model label").',sources);
 assert.equal(unresolved,'Claim [3].');
 assert.ok(researchCitationIssues(unresolved,sources).includes('unresolved-source:3'),'an unmatched number is still reported');
 assert.equal(bindCitationLinks('Claim [2](https://wrong.example "Model label").',sources),
  'Claim [2](https://github.com/vercel/next.js/releases).');
 const parenthesizedSource=[{url:'https://example.com/docs/Feature_(product)'}];
 const parenthesized=bindCitationLinks('Claim [1](https://wrong.example).',parenthesizedSource);
 assert.equal(parenthesized,'Claim [1](<https://example.com/docs/Feature_(product)>).');
 assert.deepEqual(researchCitationIssues(parenthesized,parenthesizedSource),[]);
 assert.equal(bindCitationLinks('Use the [documentation](https://example.com/reference).',sources),
  'Use the [documentation](https://example.com/reference).');
});
