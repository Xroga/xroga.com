import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildOutcomeFromTerminalRun} from './buildOutcomeMemory.js';
import type {RoutingOutcome} from './routingOutcomes.js';

const row: RoutingOutcome={runId:'same-run',userId:'owner',taskClass:'coding',modelId:'deepseek_v4_flash',mode:'balanced',
  inputTokens:1,outputTokens:2,repairLoops:0,modelSwitches:0,finalVerificationOk:true};
const outcome=(rows:RoutingOutcome[])=>buildOutcomeFromTerminalRun({runId:'same-run',userId:'owner',terminalStatus:'complete',
  iterationCount:1,output:null,routingOutcomes:rows});

test('terminal learning retains matching owner and run telemetry',()=>{
  const result=outcome([row]);assert.equal(result.modelTelemetry.length,1);assert.equal(result.verified,true);
});
test('another owner cannot attest verification or attach model evidence through a matching run identifier',()=>{
  const result=outcome([{...row,userId:'foreign-owner'}]);
  assert.equal(result.modelTelemetry.length,0);assert.equal(result.verified,false);
});
test('matching ownership alone cannot import another run telemetry',()=>{
  const result=outcome([{...row,runId:'other-run'}]);assert.equal(result.modelTelemetry.length,0);assert.equal(result.verified,false);
});
