import assert from 'node:assert/strict';
import test from 'node:test';
import {createCanonicalExecutionState,ExecutionScheduler,InMemoryExecutionStateStore,type ExecutableTaskNode} from './executionRuntime.js';
import {SandboxAdmissionError} from '../sandbox/sandboxTypes.js';

test('canonical scheduler records native admission denial and cannot retry or run a dependent task',async()=>{
  const task:ExecutableTaskNode={id:'native-validation',objective:'Synthetic validation',operationType:'validation',requiredCapabilities:['code_execution'],
    selectedRuntime:'google-gce',selectedProvider:null,selectedModel:null,requiredContextReferences:[],allowedFiles:[],expectedOutputSchema:{},dependencies:[],
    riskLevel:'high',timeoutMs:10000,retryPolicy:{maximumAttempts:3,initialBackoffMs:1,maximumBackoffMs:2},budget:{},validationMethod:['receipt'],
    evidenceRequirements:['receipt'],fallbackRoutes:[],status:'ready',attempts:0,evidence:[]};
  const state=createCanonicalExecutionState({runId:'synthetic-run',projectId:'synthetic-project',tasks:[task,{...task,id:'dependent',dependencies:[task.id],status:'pending'}]});
  const store=new InMemoryExecutionStateStore();let dispatches=0;const denial=new SandboxAdmissionError();
  await assert.rejects(new ExecutionScheduler(store).run(state,{validation:async()=>{dispatches++;throw denial;}}),error=>error===denial);
  assert.equal(dispatches,1);assert.equal(state.tasks[0].attempts,1);assert.equal(state.tasks[0].status,'blocked');
  assert.equal((await store.load(state.runId))?.tasks[0].status,'blocked');
});
