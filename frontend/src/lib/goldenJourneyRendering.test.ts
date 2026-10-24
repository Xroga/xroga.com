import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adaptTerminalEvent } from './terminal/terminalEventAdapter';
import { EMPTY_RUN_STATE, type TerminalRunState } from './terminal/terminalEvent';
import { terminalRunReducer } from './terminal/terminalRunReducer';
import { universalOutputToXrogaBlocks } from './xrogaOutputAdapters';
import { parseXrogaBlock } from './xrogaBlocks';

test('GJ canonical event replay after restored history deduplicates, and unfinished transport is interrupted',()=>{
  let state: TerminalRunState={...EMPTY_RUN_STATE,active:true};
  const first=adaptTerminalEvent('progress',{runId:'fixture-run',message:'Fixture task working',sequence:1},{fromSeq:0,now:1000});
  state=terminalRunReducer(state,{type:'events',events:first});
  const restored=JSON.parse(JSON.stringify(state)) as TerminalRunState;
  const replay=terminalRunReducer(restored,{type:'events',events:first});
  assert.equal(replay.events.length,1);assert.equal(replay.lastSeq,1);
  const closed=terminalRunReducer(replay,{type:'stream-closed'});
  assert.equal(closed.outcome,'interrupted');assert.equal(closed.active,false);
});
test('GJ one failed streamed outcome cannot be shown as all-success after reconnect',()=>{
  let state: TerminalRunState={...EMPTY_RUN_STATE,active:true};
  state=terminalRunReducer(state,{type:'events',events:adaptTerminalEvent('complete',{runId:'fixture-run',success:false,message:'Fixture subtask needs recovery'},{fromSeq:0,now:1000})});
  assert.equal(state.outcome,'failure');
  state=terminalRunReducer(state,{type:'events',events:adaptTerminalEvent('complete',{runId:'fixture-run',success:true},{fromSeq:state.lastSeq,now:1001})});
  assert.equal(state.outcome,'failure');
});
test('GJ mixed artifact/narrative/evidence output stays in the existing block adapter and valid stored union',()=>{
  const blocks=universalOutputToXrogaBlocks({type:'xroga.output',version:'1.0',status:'partial',summary:'DEMO fixture — report ready; provider action not executed.',
    artifacts:[{id:'fixture-report',name:'Example report',mediaType:'text/plain',sizeBytes:14,inline:'Fixture report',validation:[{validator:'fixture',status:'passed',detail:'Example only'}]}],
    evidence:[{kind:'SIMULATED_CHECK',detail:'Fixture artifact validation only; no provider transaction'}],blockers:['Fixture provider action not executed'],nextActions:['Review the fixture scope'],provenance:{runId:'fixture-run'}});
  assert.ok(blocks.some(block=>block.type==='artifact'));assert.ok(blocks.some(block=>block.type==='evidence'));
  for(const block of blocks)assert.ok(parseXrogaBlock(JSON.parse(JSON.stringify(block))));
  assert.match(JSON.stringify(blocks),/DEMO fixture/);assert.doesNotMatch(JSON.stringify(blocks),/deployed to production|payment completed/i);
});
test('GJ canonical event metadata cannot include a provider reasoning payload',()=>{
  const rows=adaptTerminalEvent('progress',{runId:'fixture-run',message:'Fixture working',reasoning_content:'fixture-private-reasoning'},{fromSeq:0,now:1000});
  assert.doesNotMatch(JSON.stringify(rows.map(row=>row.canonical)),/fixture-private-reasoning/);
});
