import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const modules={
  apify:['apifyScrapeJobs','simulateJobListings'],
  audioProviders:['generateElevenLabsVoiceover','generateSunoScore','generateVoiceoverWithFallback','generateSceneAudio','generateAudioTracks'],
  comfyui:['generateComfyUIImage'],gemini:['geminiGenerate','geminiFactCheck'],hailuo:['generateHailuoImage'],
  luma:['generateLumaImage'],runway:['generateRunwayImage'],youtubeSearch:['searchYoutubeVideos'],exa:['exaSearch'],
} as const;

test('seventeen legacy provider calls in nine unused adapters have no current production entry or importer',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../..');
  const paths=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/))]
    .filter(p=>/^(backend\/src|frontend\/src|workers)\//.test(p)&&/\.[cm]?[jt]sx?$/.test(p)&&!/(\.test\.|\.integration\.|\/__tests__\/|\/fixtures\/)/.test(p));
  for(const name of Object.keys(modules))assert.ok(paths.includes(`backend/src/lib/${name}.ts`));
  for(const path of paths){
    const text=readFileSync(resolve(root,path),'utf8'),source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    for(const[name,exports]of Object.entries(modules)){
      if(path===`backend/src/lib/${name}.ts`)continue;
      for(const symbol of exports)assert.doesNotMatch(text,new RegExp('\\b'+symbol+'\\b'),path+' references '+symbol);
    }
    const visit=(node:ts.Node)=>{
      if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)){
        for(const name of Object.keys(modules))if(path!==`backend/src/lib/${name}.ts`)
          assert.ok(!new RegExp('(?:^|/)'+name+'\\.(?:js|ts)$').test(node.text.replaceAll('\\','/')),path+' references unused local adapter '+name);
      }
      if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
        const arg=node.arguments[0];
        if(!arg||!ts.isStringLiteral(arg)&&!ts.isNoSubstitutionTemplateLiteral(arg)){
          assert.equal(path,'backend/src/synthesis/chromiumRuntime.ts','Unreviewed computed module loader can invalidate reachability: '+path);
          assert.equal(arg?.getText(source),'specifier as string');
          assert.match(text,/const CHROMIUM_MODULES = \['playwright', '@playwright\/test'\] as const/);
        }
      }
      ts.forEachChild(node,visit);
    };visit(source);
  }
  // Exact current-source reachability only. Future imports invalidate the review.
  // No provider call, generated-code execution, model or upstream caller is admitted.
});
