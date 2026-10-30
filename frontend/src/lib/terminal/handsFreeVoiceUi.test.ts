import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
const source=(p:string)=>fs.readFileSync(path.resolve(__dirname,p),'utf8');
test('single manual dictation control has no spoken commands, auto-send or conversation restart',()=>{
 const voice=source('../../components/terminal/XrogaVoiceControl.tsx');
 assert.doesNotMatch(voice,/SEND_COMMANDS|onVoiceSend|autoSendTimerRef|speechSynthesis|new SpeechRecognition|webkitSpeechRecognition\(|conversationRef|optionsOpen|speechLanguage|ChevronDown/);
 assert.match(voice,/Stop recording/);assert.match(voice,/Cancel voice typing/);assert.match(voice,/transcribeVoiceLocally/);
 assert.doesNotMatch(voice,/voiceApi|getAccessToken|fetch\(/);assert.match(voice,/startSpeechFallback/);assert.match(voice,/DictationController/);assert.match(voice,/pagehide/);assert.match(voice,/session.current !== current/);
});
test('composer preserves editable draft and scopes microphone to account, project and conversation',()=>{
 const bar=source('../../components/terminal/TerminalChatBar.tsx');
 assert.match(bar,/appendVoiceTranscript\(draftRef.current, spokenText\)/);assert.match(bar,/dir="auto"/);
 assert.match(bar,/key=\{`\$\{workspaceIdentity.status\}:\$\{workspaceIdentity.userId\}:\$\{sessionId\}:\$\{projectId\}:\$\{incognito\}:\$\{voiceEpoch\}`\}/);
 assert.doesNotMatch(bar,/onVoiceSend|handleVoiceSend/);
});
test('existing protected server route retains auto-detection and canonical accounting',()=>{
 const backend=source('../../../../backend/src/routes/voice.ts');
 assert.match(backend,/beginVoiceRequest/);assert.match(backend,/current.complete/);assert.match(backend,/language they actually use/);
 assert.doesNotMatch(backend,/form.append\('language'/);
});
