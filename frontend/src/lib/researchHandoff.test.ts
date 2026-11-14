import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachResearchResult, markResearchUnavailable, pendingResearchConfirmation } from './researchHandoff';
import {responseTextV2} from '../components/response-experience-v2/exportText';
import {richShareSnapshot} from '../components/response-experience-v2/shareSnapshot';
const id = '221fe7f9-f0dd-4b12-b03a-bcb57a13f655';
const message = { id: 'original-message', role: 'assistant', content: `Research requires approval. [Review](/dashboard/actions/confirm/${id})` };
const result = { confirmationId: id, receiptId: 'receipt', text: '', omittedSourceCount: 0,
  sources: [{ title: 'Retrieved page', url: 'https://example.com/page', snippet: 'Actual returned excerpt.', source: 'parallel' }] };
test('attaches evidence only to the exact originating approval and keeps original context', () => {
  assert.equal(pendingResearchConfirmation(message), id);
  const updated = attachResearchResult(message, result);
  assert.ok(updated.content.startsWith(message.content));
  assert.ok(updated.content.includes('Actual returned excerpt.'));
  assert.deepEqual(attachResearchResult(updated, result), updated);
  assert.deepEqual(attachResearchResult(JSON.parse(JSON.stringify(updated)), result), updated);
  assert.equal(attachResearchResult(message, { ...result, confirmationId: 'different' }), message);
  assert.equal(pendingResearchConfirmation({ ...message, role: 'user' }), null);
  assert.equal(pendingResearchConfirmation({ ...message, content: message.content + message.content }), null);
  const unavailable = markResearchUnavailable(message, id);
  assert.equal(markResearchUnavailable(unavailable, id), unavailable);
  assert.ok(!attachResearchResult(unavailable, result).content.includes('currently unavailable'));
  const chat = attachResearchResult({ ...message, featureOutput: { type: 'chat', content: message.content } }, result);
  assert.equal(chat.featureOutput.content, chat.content);
});
test('the original research turn receives its saved structured answer once, including citation and Share data',()=>{
 const raw=JSON.stringify({s0:{markdown:'Documented choices [1].',data:{columns:['Option','Evidence'],rows:[['One','Supplied source [1]']]}}});
 const answer={response:'## Options\n\nDocumented choices [1].\n\n```xroga-ui\n'+JSON.stringify({type:'table',id:'options',columns:[{key:'a',label:'Option',type:'text'},{key:'b',label:'Evidence',type:'text'}],rows:[{a:'One',b:'Supplied source [1]'}]})+'\n```',
  completion:{status:'complete'},responseSource:{format:'xroga-response-json-v1',text:raw},webSources:[{...result.sources[0]}]};
 const delivered=attachResearchResult(message,{...result,receiptId:id,answer});
 assert.equal(delivered.id,message.id);assert.equal(delivered.researchReceiptId,id);assert.equal(delivered.webSources.length,1);
 assert.doesNotMatch(delivered.content,/Approved research results|Review.*confirm|Actual returned excerpt/);
 assert.equal(delivered.featureOutput.responseSource.text,raw);
 assert.deepEqual(attachResearchResult(JSON.parse(JSON.stringify(delivered)),{...result,receiptId:id,answer}),delivered);
 const copied=responseTextV2({id:delivered.id,content:delivered.content,featureOutput:delivered.featureOutput,webSources:delivered.webSources})!;
 assert.match(copied,/Option/);assert.match(copied,/Supplied source/);
 assert.ok(richShareSnapshot({id:delivered.id,content:delivered.content,featureOutput:delivered.featureOutput,webSources:delivered.webSources},copied));
 const partial=attachResearchResult(message,{...result,answerFailure:'SYNTHESIS_UNAVAILABLE'});
 assert.match(partial.content,/full answer could not be completed safely/);assert.match(partial.content,/Actual returned excerpt/);
});

test('retains ordered rich blocks, source evidence and old citations through unavailable and recovered states', () => {
  const graph = { schemaVersion: 1, id: 'architecture', type: 'graph', nodes: [{ id: 'api', label: 'API' }], edges: [] };
  const original = { ...message, webSources: [{ title: 'Earlier evidence', url: 'https://example.com/earlier', snippet: 'Original excerpt.' }], featureOutput: {
    schemaVersion: 1, id: 'answer', status: 'completed', composition: 'source-order', sourceText: 'Original model protocol',
    blocks: [{ schemaVersion: 1, id: 'intro', type: 'narrative', text: message.content }, graph],
  } };
  const updated = attachResearchResult(markResearchUnavailable(original, id), result);
  assert.deepEqual(updated.featureOutput.blocks.slice(0, 2), original.featureOutput.blocks);
  assert.equal(updated.featureOutput.blocks.length, 3);
  assert.equal(updated.featureOutput.sourceText, original.featureOutput.sourceText);
  assert.equal(updated.featureOutput.blocks.filter(b => b.type === 'narrative').map(b => 'text' in b ? b.text : '').join('\n\n'), updated.content);
  assert.equal(updated.webSources.length, 2);
  assert.deepEqual(attachResearchResult(JSON.parse(JSON.stringify(updated)), result), updated);
});

test('an empty qualifying-source receipt replaces the stale approval prompt and survives reopening', () => {
  const receipt = { ...result, sources: [], answerFailure: 'NO_QUALIFYING_SOURCES' };
  const pending = { ...message, webSources: [result.sources[0]] };
  const settled = attachResearchResult(pending, receipt);
  assert.match(settled.content, /found no sources that met your request/);
  assert.doesNotMatch(settled.content, /approval|Review|Actual returned excerpt/);
  assert.deepEqual(settled.webSources, []);
  assert.equal(settled.researchReceiptId, receipt.receiptId);
  assert.deepEqual(attachResearchResult(JSON.parse(JSON.stringify(settled)), receipt), settled);
});
