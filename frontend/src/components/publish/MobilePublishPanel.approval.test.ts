import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import vm from'node:vm';import ts from'typescript';

test('actual mobile build and submit handlers show exact approval without a false start or extra provider action',async()=>{
 const source=readFileSync(new URL('./MobilePublishPanel.tsx',import.meta.url),'utf8'),ast=ts.createSourceFile('MobilePublishPanel.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions=new Map<string,string>();
 function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name&&['showApproval','startBuild','submitToStore'].includes(node.name.text))functions.set(node.name.text,node.getText(ast));ts.forEachChild(node,visit);}visit(ast);assert.equal(functions.size,3);
 const script=ts.transpileModule(`${[...functions.values()].join('\n')}\nglobalThis.handlers={startBuild,submitToStore};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const review='/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111';
 for(const operation of ['startBuild','submitToStore'])for(const mode of ['approval','foreign-link','outage','legacy-queued']){
  let requests=0,loaded=0,success=0,errors=0,shown:string|null=null,submitClosed=false;const busy:unknown[]=[];
  const toast=Object.assign(()=>{},{success:()=>{success++;},error:()=>{errors++;}});
  const context:Record<string,unknown>={easProjectId:'owned-project',setBusy:(value:unknown)=>busy.push(value),setReviewUrl:(url:string)=>{shown=url;},toast,setConfirmSubmit:(value:unknown)=>{submitClosed=value===null;},setLastRunUrl:()=>{},loadBuilds:async()=>{loaded++;},
   api:{publish:{easPublish:async(input:{platform:string;projectId:string;submit:boolean})=>{requests++;assert.equal(input.projectId,'owned-project');assert.equal(input.submit,operation==='submitToStore');if(mode==='outage')throw new Error('Synthetic outage');return mode==='legacy-queued'?{ok:true,url:'https://expo.dev',message:'Queued'}:{ok:false,needsConfirmation:true,reviewUrl:mode==='foreign-link'?'https://foreign.invalid/collect':review};}}}};
  vm.runInNewContext(script,context,{timeout:1000});await(context.handlers as Record<string,(platform:string)=>Promise<void>>)[operation]('android');
  assert.equal(requests,1);assert.equal(busy.at(-1),null);
  if(mode==='approval'){assert.equal(shown,review);assert.equal(success,0);assert.equal(errors,0);assert.equal(loaded,0);assert.equal(submitClosed,operation==='submitToStore');}
  else if(mode==='legacy-queued'){assert.equal(success,1);assert.equal(loaded,1);}
  else{assert.equal(shown,null);assert.equal(success,0);assert.equal(loaded,0);assert.equal(errors,1);}
 }
});
