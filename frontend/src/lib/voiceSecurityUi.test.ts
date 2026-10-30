import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
type StreamFixture = { getTracks: () => { stop: () => void }[] };
function handler(failure?: unknown) {
 const source=readFileSync(new URL('../components/terminal/XrogaVoiceControl.tsx',import.meta.url),'utf8');
 const ast=ts.createSourceFile('voice.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const callbacks=new Map<string,string>(); const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&['start','run','retry','getInference'].includes(node.name.getText(ast))&&node.initializer)callbacks.set(node.name.getText(ast),node.initializer.getText(ast));ts.forEachChild(node,visit);};visit(ast);assert.ok(callbacks.has('start'));
 const drafts:string[]=[],errors:string[]=[];let stopped=false;
 const context={start:async()=>{},AbortController,MediaRecorder:class{},disabled:false,window:{},getDictationConstructor:()=>null,localWhisperSupported:()=>true,speech:{current:null},startSpeechFallback:()=>{},session:{current:null as {abort:AbortController} | null},publish:{current:(text:string)=>drafts.push(text)},
 setError:(text:string)=>{if(text)errors.push(text);},setMode:()=>{},setProgress:()=>{},setPercent:()=>{},setRetryable:()=>{},retainedAudio:{current:null},inference:{current:null},retryExpiry:{current:undefined},setTimeout:()=>1,clearTimeout:()=>{},
 createVoiceEngine:()=>({prepare:async()=>{},recognize:async()=>'',dispose:()=>{},idle:()=>{}}),
 navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop:()=>{stopped=true;}}]})}},
 captureVoiceRecording:()=>({stop:()=>{},ready:Promise.resolve(true),audio:Promise.resolve(new Blob(['fixture']))}),
 transcribeVoiceLocally:async()=>{if(failure)throw failure;return 'send send ابھی بھیج دو';}};
 vm.runInNewContext(ts.transpileModule([...callbacks].map(([name,callback])=>'globalThis.'+name+'='+callback).join(';'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {context,drafts,errors,stopped:()=>stopped,start:context.start as ()=>Promise<void>};
}
test('actual recording workflow publishes verified speech as editable text only',async()=>{
 const f=handler();await f.start();assert.deepEqual(f.drafts,['send send ابھی بھیج دو']);assert.equal(f.stopped(),true);
});
test('local model and device failures preserve draft and release mic',async()=>{
 for(const code of ['MODEL_DOWNLOAD_FAILED','DEVICE_MEMORY_LIMIT','WORKER_CRASH','LOCAL_TIMEOUT']){
 const f=handler({code});await f.start();assert.deepEqual(f.drafts,[]);assert.equal(f.errors.length,1);assert.equal(f.stopped(),true);}
});
test('late permission response after session cancellation stops tracks and never uploads',async()=>{
 const f=handler();let permission!:(value:StreamFixture)=>void; f.context.navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{permission=resolve;});
 const pending=f.start();f.context.session.current=null;let released=false;
 permission({getTracks:()=>[{stop:()=>{released=true;}}]});await pending;assert.equal(released,true);assert.deepEqual(f.drafts,[]);
});
test('late transcript after cancellation cannot publish into the next chat',async()=>{
 const f=handler();f.context.transcribeVoiceLocally=async()=>{f.context.session.current=null;return 'stale';};await f.start();assert.deepEqual(f.drafts,[]);
});
