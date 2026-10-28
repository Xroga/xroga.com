import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const WORKER=read('../scripts/runCanonicalWorker.ts');
const ROUTE=read('../routes/swarm.ts');

test('the swarm route forwards the ownership-checked Builder project into the durable queue',()=>{
  assert.match(ROUTE,/enqueueGoogleSwarm\([\s\S]*?\{prompt:prompt\.trim\(\),history,projectId,clientMeta,attachments,builderProjectId\}/);
  // The ownership check still runs before the durable branch.
  assert.ok(ROUTE.indexOf('builderProjectExists(')<ROUTE.indexOf('googleBackgroundSelected()'));
});

test('the Google worker opens and closes a Builder run and never passes the raw id to the pipeline',()=>{
  assert.match(WORKER,/openBuilderRun\(context,builderProjectId,claim\.runId\)/);
  assert.match(WORKER,/\.\.\.\(builderRun\?\{builder:builderRun\}:\{\}\)/);
  assert.match(WORKER,/closeBuilderRun\(context,builderRun,\{ok:result\.success\}\)/);
  assert.match(WORKER,/blocked:code==='BUILDER_ENGINE_DISABLED'/);
  assert.match(WORKER,/const \{builderProjectId,\.\.\.pipelineInput\}=input/);
  // The run opens before the pipeline starts and closes after it returns.
  assert.ok(WORKER.indexOf('openBuilderRun(context')<WORKER.indexOf('runBuildPipeline({'));
  assert.ok(WORKER.indexOf('runBuildPipeline({')<WORKER.indexOf('closeBuilderRun(context,builderRun,{ok:result.success})'));
});
