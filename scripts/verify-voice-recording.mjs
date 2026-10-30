import { tmpdir } from 'node:os';
/** Real browser MediaRecorder + PCM normalization. Generated tone, no speech/provider or OS mic. */
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const result=await build({stdin:{contents:`import {captureVoiceRecording} from './frontend/src/lib/terminal/voiceRecording'; import {normalizeVoiceAudio} from './frontend/src/lib/voicePcm'; window.verifyVoice=async()=>{const context=new AudioContext();await context.resume();const source=context.createOscillator();const dest=context.createMediaStreamDestination();source.connect(dest);source.start();const controller=new AbortController();const start=performance.now();const capture=captureVoiceRecording(dest.stream,controller.signal);if(!await capture.ready)throw Error('Recorder did not start');await new Promise(r=>setTimeout(r,2200));capture.stop();const audio=await capture.audio;source.stop();await context.close();const wav=await normalizeVoiceAudio(audio);const data=new DataView(await wav.arrayBuffer());if(data.getUint32(24,true)!==22050||wav.size<20000)throw Error('Invalid PCM');if(dest.stream.getTracks().some(t=>t.readyState!=='ended'))throw Error('Track leaked');return {mime:audio.type,bytes:audio.size,wavBytes:wav.size,durationMs:performance.now()-start,tracksStopped:true};};`,resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser'});
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<script>'+result.outputFiles[0].text+'</script>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const receipts=[];
 for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
 const page=await browser.newPage({viewport});await page.goto(`http://127.0.0.1:${server.address().port}`);
 receipts.push({viewport,...await page.evaluate(()=>window.verifyVoice())});await page.close();}
 const evidence={scope:'REAL_EDGE_MEDIARECORDER_GENERATED_TONE_NOT_SPEECH_OR_OS_PERMISSION',browser:browser.version(),receipts};
 console.log(JSON.stringify(evidence));
 await writeFile(path.join(tmpdir(),'voice-browser-receipt.json'),JSON.stringify(evidence,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
