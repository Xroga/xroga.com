import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
const source=(p:string)=>fs.readFileSync(path.resolve(__dirname,p),'utf8');
test('single manual dictation control has no spoken commands, auto-send or conversation restart',()=>{
 const voice=source('../../components/terminal/XrogaVoiceControl.tsx');
 assert.doesNotMatch(voice,/SEND_COMMANDS|onVoiceSend|autoSendTimerRef|speechSynthesis|new SpeechRecognition|webkitSpeechRecognition\(|conversationRef|optionsOpen|speechLanguage|ChevronDown/);
 assert.match(voice,/Stop dictation/);assert.match(voice,/VoiceWaveform/);assert.match(voice,/editor.focus\(\)/);assert.match(voice,/Cancel voice typing/);
 assert.match(voice,/startSpeechFallback/);assert.match(voice,/DictationController/);assert.match(voice,/pagehide/);assert.match(voice,/session.current !== current/);
});
test('dictation uses Cloudflare through the authenticated Xroga voice API only, with no on-device model',()=>{
 const voice=source('../../components/terminal/XrogaVoiceControl.tsx');
 assert.match(voice,/transcribeVoiceAudio\(wav, signal, \{ freeOnly: true, preparedPcm: true, expectedToken: token \}\)/);
 assert.match(voice,/Your voice is sent to Cloudflare to be transcribed\./);
 assert.doesNotMatch(voice,/fetch\(|huggingface|onnx|transformers|voiceLocal|voiceEngine|new Worker/);
 const api=source('../voiceApi.ts');
 assert.match(api,/transcribe-free/);assert.doesNotMatch(api,/api\.cloudflare\.com|CLOUDFLARE/);
});
test('composer preserves editable draft and scopes microphone to account, project and conversation',()=>{
 const bar=source('../../components/terminal/TerminalChatBar.tsx');
 assert.match(bar,/appendVoiceTranscript\(draftRef.current, spokenText\)/);assert.match(bar,/dir="auto"/);
 assert.match(bar,/key=\{`\$\{workspaceIdentity.status\}:\$\{workspaceIdentity.userId\}:\$\{sessionId\}:\$\{projectId\}:\$\{incognito\}:\$\{voiceEpoch\}`\}/);
 assert.doesNotMatch(bar,/onVoiceSend|handleVoiceSend/);
});
test('protected server routes keep language auto-detection and canonical accounting',()=>{
 const backend=source('../../../../backend/src/routes/voice.ts');
 assert.match(backend,/beginVoiceRequest/);assert.match(backend,/current.complete/);assert.match(backend,/language they actually use/);
 assert.doesNotMatch(backend,/form.append\('language'/);
 const free=source('../../../../backend/src/routes/voiceFree.ts');
 assert.match(free,/@cf\/openai\/whisper-large-v3-turbo|FREE_VOICE_MODEL/);assert.match(free,/task: 'transcribe'/);
 assert.doesNotMatch(free,/\blanguage:\s*['"]/);
});
