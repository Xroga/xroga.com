import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {requireSigningConfirmation,requireSigningConfirmations} from './signingAdmission';
type Element={type:unknown;props:Record<string,unknown>};
/** Actual component handlers with controlled React and API fixtures. This does
 * not claim a DOM, live account, deployed UI or provider acceptance test. */
function signingUi(mode='ok'){
 const states:unknown[]=[],calls:Array<{operation:string;argument:string}>=[],messages:string[]=[];let cursor=0,tree:Element;
 const row={id:'11111111-1111-4111-8111-111111111111',summary:'Set CSC_LINK in GitHub Actions for Owner/repo.',status:'pending',toolkit:mode==='foreign-tool'?'github':'xroga-native-signing',toolSlug:'XROGA_SET_SIGNING_MATERIAL',expiresAt:new Date(Date.now()+60000).toISOString()};
 const useState=(initial:unknown)=>{const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],(value:unknown)=>{states[index]=typeof value==='function'?value(states[index]):value;}];};
 const jsx=(type:unknown,props:Record<string,unknown>)=>({type,props});
 const toast=Object.assign((message:string)=>messages.push(message),{success:(message:string)=>messages.push('success:'+message),error:(message:string)=>messages.push('error:'+message)});
 const context:Record<string,unknown>={exports:{},require:(id:string)=>{
  if(id==='react')return{useState,useMemo:(fn:()=>unknown)=>fn()};
  if(id==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'fragment'};
  if(id==='react-hot-toast')return toast;
  if(id==='lucide-react')return Object.fromEntries(['ArrowRight','Check','Loader2','Monitor','ShieldCheck'].map(name=>[name,()=>null]));
  if(id==='@/components/publish/PublishPrimitives')return Object.fromEntries(['PublishDisclosure','PublishRequirement','PublishStatusBadge'].map(name=>[name,()=>null]));
  if(id==='@/lib/signingAdmission')return{requireSigningConfirmation,requireSigningConfirmations};
  if(id==='@/lib/api')return{api:{publish:{syncElectronSecrets:async(argument:string)=>{calls.push({operation:'prepare',argument});return{ok:false,synced:[],needsConfirmation:true,confirmations:[row]};},confirmElectronSecret:async(argument:string)=>{calls.push({operation:'confirm',argument});return{ok:true,synced:['CSC_LINK'],message:'Approved signing material updated.'};}}},apiFetch:async(argument:string)=>{calls.push({operation:'cancel',argument});return{};}};
  throw new Error('Unexpected component dependency '+id);
 }};
 const source=readFileSync(new URL('../components/publish/DesktopPublishPanel.tsx',import.meta.url),'utf8')+'\nglobalThis.__signingSetup=DesktopSigningSetup;';
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,context,{timeout:1000,filename:'actual-DesktopPublishPanel.tsx'});
 const render=()=>{cursor=0;tree=(context.__signingSetup as (props:unknown)=>Element)({cscSaved:true,notarizationSaved:false,project:{githubRepoName:'Owner/repo'},onSaved:()=>{}});};
 const text=(value:unknown):string=>Array.isArray(value)?value.map(text).join(''):value&&typeof value==='object'&&'props'in value?text((value as Element).props.children):typeof value==='string'?value:'';
 const buttons=()=>{const found:Element[]=[];const walk=(value:unknown)=>{if(Array.isArray(value)){value.forEach(walk);return;}if(!value||typeof value!=='object'||!('props'in value))return;const element=value as Element;if(element.type==='button')found.push(element);walk(element.props.children);};walk(tree);return found;};
 render();return{calls,messages,has:(label:string)=>buttons().some(button=>text(button.props.children)===label),click:async(label:string)=>{const button=buttons().find(button=>text(button.props.children)===label);assert.ok(button,label);assert.notEqual(button.props.disabled,true);(button.props.onClick as ()=>unknown)();await new Promise<void>(resolve=>setImmediate(resolve));render();}};
}
test('actual signing UI prepares, explicitly confirms or cancels the exact durable approval',async t=>{
 await t.test('preparation does not execute or claim a completed transfer',async()=>{const ui=signingUi();await ui.click('Sync signing credentials');assert.deepEqual(ui.calls,[{operation:'prepare',argument:'Owner/repo'}]);assert.ok(ui.has('Approve this transfer'));assert.ok(!ui.messages.some(message=>message.startsWith('success:')));});
 await t.test('cancel uses canonical cancellation without a provider confirmation',async()=>{const ui=signingUi();await ui.click('Sync signing credentials');await ui.click('Cancel');assert.deepEqual(ui.calls.map(call=>call.operation),['prepare','cancel']);assert.equal(ui.calls[1].argument,'/api/phase1/business-actions/confirmations/11111111-1111-4111-8111-111111111111/cancel');assert.equal(ui.has('Approve this transfer'),false);});
 await t.test('only an explicit click confirms once and removes the consumed prompt',async()=>{const ui=signingUi();await ui.click('Sync signing credentials');await ui.click('Approve this transfer');assert.deepEqual(ui.calls,[{operation:'prepare',argument:'Owner/repo'},{operation:'confirm',argument:'11111111-1111-4111-8111-111111111111'}]);assert.equal(ui.has('Approve this transfer'),false);assert.ok(ui.messages.some(message=>message.startsWith('success:')));});
 await t.test('substituted operation metadata never creates an approval action',async()=>{const ui=signingUi('foreign-tool');await ui.click('Sync signing credentials');assert.equal(ui.has('Approve this transfer'),false);assert.equal(ui.calls.length,1);assert.ok(ui.messages.some(message=>message.startsWith('error:')));});
});
