// Controlled public speech through the actual deployed microphone. No physical mic,
// login export, paid request or Send. Run only against an explicitly selected release.
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const origin = process.argv[2];
const expectedSource = process.argv[3];
assert.ok(origin && /^https:\/\/(?:xroga\.com|[a-z0-9-]+\.vercel\.app)$/.test(origin), 'An approved HTTPS release origin is required');
assert.match(expectedSource ?? '',/^[a-f0-9]{40}$/, 'The immutable release source is required');
const identity = await (await fetch(origin+'/api/release',{cache:'no-store'})).json();
assert.equal(identity.release,expectedSource,'The live frontend must match the verified source');
const fixture = new Uint8Array(await (await fetch('https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac', {signal:AbortSignal.timeout(30000)})).arrayBuffer());
const wavPath = path.join(tmpdir(),'xroga-public-speech.wav');
let browser;
try {
  browser = await chromium.launch({channel:'msedge',headless:true});
  const decode = await browser.newPage();
  const wav = await decode.evaluate(async bytes => {
    const audio = await new OfflineAudioContext(1,1,16000).decodeAudioData(Uint8Array.from(bytes).buffer);
    const samples = audio.getChannelData(0), buffer = new ArrayBuffer(44+samples.length*2), view = new DataView(buffer);
    const text = (offset,value) => {for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
    view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);
    view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++)view.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(samples[i]*32767))),true);
    return {bytes:Array.from(new Uint8Array(buffer)),durationMs:audio.duration*1000};
  },Array.from(fixture));
  await writeFile(wavPath,Uint8Array.from(wav.bytes)); await browser.close();
  browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${wavPath}`]});
  const context = await browser.newContext({permissions:['microphone']});
  const page = await context.newPage();
  const automaticSubmissions = [], errors = [];
  await page.route('https://api.xroga.com/**',async route => {
    const request=route.request(), url=new URL(request.url());
    if(request.method()==='POST' && /^\/api\/(?:chat|swarm|phase1|builder|v1\/runs)(?:\/|$)/.test(url.pathname)) {
      automaticSubmissions.push(url.pathname); await route.abort();
    } else await route.continue();
  });
  page.on('pageerror',error=>errors.push(error.name));
  await page.goto(origin+'/workspace',{waitUntil:'domcontentloaded'});
  const mic = page.getByRole('button',{name:'Start voice typing',exact:true});
  await mic.waitFor({state:'visible',timeout:60000}); assert.ok(await mic.isEnabled());
  assert.equal(await page.getByRole('button',{name:'Voice options',exact:true}).count(),0);
  const draft = page.locator('textarea[data-terminal-composer]');
  await draft.fill('Editable fixture.');
  await mic.click();
  await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor({state:'visible',timeout:30000});
  await page.waitForTimeout(wav.durationMs+200);
  await page.getByRole('button',{name:'Stop recording',exact:true}).click();
  await page.waitForFunction(() => /ask not what your country can do for you/i.test(document.querySelector('textarea[data-terminal-composer]')?.value ?? ''),undefined,{timeout:600000});
  const transcript = await draft.inputValue();
  assert.ok(transcript.startsWith('Editable fixture.'));
  assert.match(transcript,/what you can do for your country/i);
  assert.deepEqual(automaticSubmissions,[]);
  await draft.fill(transcript+' Reviewed.'); assert.ok((await draft.inputValue()).endsWith(' Reviewed.'));
  assert.ok(await page.getByRole('button',{name:'Send prompt',exact:true}).isEnabled());
  await page.locator('.xv-terminal-dock').screenshot({path:path.join(tmpdir(),'voice-live.png')});
  await draft.fill('');
  const evidence={scope:'DEPLOYED_GUEST_WORKSPACE_REAL_LOCAL_ASR_WITH_PUBLIC_SYNTHETIC_MIC_NOT_PHYSICAL_DEVICE_OR_AUTHENTICATED_SPEECH',origin,source:identity.release,browser:browser.version(),recordStopTranscribeEdit:'PASS',manualSendEnabled:true,sendExecuted:false,automaticSubmissions,paidModelRequests:0,pageErrorNames:errors};
  await writeFile(path.join(tmpdir(),'voice-live.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
} finally {await browser?.close();}
