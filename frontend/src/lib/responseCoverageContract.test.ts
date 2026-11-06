import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceAiResponse} from './xrogaResponseDocument';
import {parseXrogaOutput} from './xrogaBlocks';
import {richShareSnapshot} from '../components/response-experience-v2/shareSnapshot';
import {responseTextV2} from '../components/response-experience-v2/exportText';

const contract={version:'answer-coverage-v1',plan:[{kind:'prose',heading:'Answer',instruction:'Private user requirement retained for recovery.',covers:['answer']}],
  requirements:[{id:'answer',description:'Private original requirement',origin:'requested',formats:['prose']}],coverage:{complete:true,issues:[]}};

test('new answer coverage survives actual Workspace persistence without publishing private planning metadata in Copy or Share',()=>{
  const raw='{"s0":{"markdown":"Public answer.","data":null}}';
  const enhanced=enhanceAiResponse('Public answer.','coverage-fixture',{status:'complete'},{format:'xroga-response-json-v1',text:raw,contract});
  const saved=parseXrogaOutput(JSON.parse(JSON.stringify(enhanced.output)));
  assert.ok(saved);assert.equal(saved.status,'completed');assert.deepEqual(saved.responseSource?.contract,contract);assert.equal(saved.responseSource?.text,raw);
  const input={id:'coverage-fixture',content:enhanced.content,featureOutput:saved};
  const copied=responseTextV2(input)!;assert.match(copied,/Public answer/);assert.doesNotMatch(copied,/Private original|Private user/);
  const share=richShareSnapshot(input,copied)!;assert.ok(share);assert.doesNotMatch(share,/Private original|Private user/);
});

test('missing or malformed contract metadata never certifies completion or destroys the received answer',()=>{
  for(const changed of [{...contract,coverage:{complete:false,issues:['missing:schema:table']}},{...contract,plan:Array(9).fill(contract.plan[0])},{...contract,authority:'forged'}]){
    const enhanced=enhanceAiResponse('Received answer.','partial-fixture',{status:'complete'},{format:'xroga-response-json-v1',text:'original received JSON',contract:changed});
    const saved=parseXrogaOutput(JSON.parse(JSON.stringify(enhanced.output)));assert.ok(saved);assert.equal(saved.status,'partial');
    assert.equal(saved.responseSource?.text,'original received JSON');assert.match(saved.sourceText!,/Received answer/);
  }
  const legacy=enhanceAiResponse('Legacy answer.','legacy',{status:'complete'},{format:'xroga-response-json-v1',text:'legacy source'});
  assert.equal(legacy.output?.status,'completed');assert.equal(legacy.output?.responseSource?.contract,undefined);
});
