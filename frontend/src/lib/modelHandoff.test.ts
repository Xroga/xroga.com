import test from 'node:test';
import assert from 'node:assert/strict';
import {attachModelResult,markModelUnavailable,pendingModelConfirmation} from './modelHandoff';
const id='221fe7f9-f0dd-4b12-b03a-bcb57a13f655';
const message={id:'original-turn',role:'assistant',content:`This complex engineering response requires a separate capped spending approval. [Review Sonnet task](/dashboard/actions/confirm/${id}). The model task has not run.`};
test('saved model receipt resumes only its originating turn, without duplicating or calling a provider',()=>{
 const result={confirmationId:id,receiptId:id,text:'## Diagnosis\n\nUse a transaction and verify current membership.\n\n```ts\nconst value = 25 * 40;\n```',completion:{status:'complete'}};
 const answer=attachModelResult(message,result);
 assert.equal(pendingModelConfirmation(message),id);assert.equal(pendingModelConfirmation({...message,role:'user'}),null);
 assert.match(answer.content,/const value = 25 \* 40/);assert.equal(answer.id,message.id);assert.equal(answer.modelReceiptId,id);
 assert.deepEqual(attachModelResult(JSON.parse(JSON.stringify(answer)),result),answer);
 assert.equal(attachModelResult(message,{...result,confirmationId:'foreign'}),message);
 assert.equal(attachModelResult(message,{...result,receiptId:'foreign'}),message);
 assert.equal(pendingModelConfirmation({...message,content:message.content+message.content}),null);
});
test('unavailable private result stays recoverable and never creates a replacement request',()=>{
 const unavailable=markModelUnavailable(message,id);
 assert.match(unavailable.content,/No model request was repeated/);
 assert.equal(markModelUnavailable(unavailable,id),unavailable);
 assert.equal(pendingModelConfirmation(unavailable),id);
 const recovered=attachModelResult(JSON.parse(JSON.stringify(unavailable)),{confirmationId:id,receiptId:id,text:'The saved exact answer.',completion:{status:'partial',reason:'length'}});
 assert.equal(pendingModelConfirmation(recovered),null);
 assert.equal(recovered.modelReceiptId,id);
 assert.doesNotMatch(recovered.content,/currently unavailable/);
 assert.equal(markModelUnavailable(message,'foreign'),message);
});
