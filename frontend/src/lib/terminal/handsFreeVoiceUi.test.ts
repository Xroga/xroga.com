import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('voice uses the supplied AudioLines icon with no pill, circle, settings, or fake Voice off UI', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const icon = source('../../components/terminal/AudioLinesIcon.tsx');
  const css = source('../../styles/uiverse.css');

  assert.match(voice, /<AudioLinesIcon size=\{28\}/);
  assert.match(icon, /motion\.path/);
  assert.doesNotMatch(voice, /Voice off|Voice settings|Prefer female|Prefer male|Tone/);
  assert.match(css, /VOICE V8 — wake \+ multilingual inline voice/);
  assert.match(css, /border-radius:\s*0\s*!important/);
  assert.match(css, /outline:\s*0\s*!important/);
  assert.match(css, /box-shadow:\s*none\s*!important/);
});

test('voice never enables a hidden wake listener after permission or page load', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.doesNotMatch(voice, /WAKE_STORAGE_KEY|armWakeWord|extractWakeCommand/);
  assert.match(voice, /captureGenerationRef/);
  assert.match(voice, /acceptMicStream\(stream\.getTracks\(\), generation/);
  assert.match(voice, /modeRef\.current !== 'listening' \|\| endingRef\.current \|\| !streamRef\.current\?\.active/);
});

test('voice capture keeps captions separate from the editable typed draft', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.match(voice, /recognition\.interimResults = true/);
  assert.match(voice, /recognition\.continuous = true/);
  assert.match(voice, /publishLiveDraft\(finalTextRef\.current, interim\)/);
  assert.match(voice, /setPreviewText\(captureText\)/);
  assert.match(voice, /mergeText\(composerTextRef\.current, finalVoice\)/);
  assert.match(voice, /finalTextRef\.current = ''/);
  assert.match(voice, /interimTextRef\.current = ''/);
  assert.match(chatbar, /onVoiceDraft=\{handleVoiceDraft\}/);
  assert.match(chatbar, /setDraft\(text\)/);
  assert.match(chatbar, /setPrompt\(text\)/);
});

test('inline voice session matches the requested X waveform pause stop and send controls', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const parts = source('../../components/terminal/ChatBarParts.tsx');
  const css = source('../../styles/uiverse.css');

  assert.match(voice, /Cancel voice typing/);
  assert.match(voice, /Pause voice typing/);
  assert.match(voice, /Stop voice typing and keep text/);
  assert.match(voice, /Finish voice typing and send/);
  assert.match(voice, /ArrowUp/);
  assert.match(voice, /const bars = 58/);
  assert.match(parts, /data-xroga-voice-stage/);
  assert.match(css, /\.xv-voice-v8-session/);
  assert.match(css, /\.xv-voice-v8-wave/);
});

test('spoken control commands can pause stop resume or send in multiple languages', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /STOP_COMMANDS/);
  assert.match(voice, /SEND_COMMANDS/);
  assert.match(voice, /PAUSE_COMMANDS/);
  assert.match(voice, /RESUME_COMMANDS/);
  assert.match(voice, /'بھیج دو'/);
  assert.match(voice, /'भेज दो'/);
  assert.match(voice, /'أرسل'/);
  assert.match(voice, /'envía'/);
  assert.match(voice, /'gönder'/);
  assert.match(voice, /finishVoiceRef\.current\(true\)/);
  assert.match(voice, /finishVoiceRef\.current\(false\)/);
});

test('authoritative final transcription is multilingual auto-detect and preserves Xroga spelling', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const api = source('../voiceApi.ts');
  const backend = source('../../../../backend/src/routes/voice.ts');

  assert.match(voice, /new MediaRecorder/);
  assert.match(voice, /transcribeVoiceAudio\(audio\)/);
  assert.match(api, /\/api\/voice\/transcribe/);
  assert.match(api, /getAccessToken/);
  assert.match(backend, /gpt-4o-mini-transcribe/);
  assert.match(backend, /gpt-4o-transcribe/);
  assert.match(backend, /whisper-1/);
  assert.match(backend, /language they actually use/);
  assert.match(backend, /product name is Xroga/);
  assert.doesNotMatch(backend, /form\.append\('language', 'en'\)/);
  assert.doesNotMatch(backend, /languages\[\]', 'en'/);
});

test('voice send uses the exact same canonical form submit path as typed chat', () => {
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.match(chatbar, /const handleVoiceSend = useCallback/);
  assert.match(chatbar, /formRef\.current\?\.requestSubmit\(\)/);
  assert.match(chatbar, /onVoiceSend=\{handleVoiceSend\}/);
  assert.match(chatbar, /await submit\(/);
  assert.match(chatbar, /ensureRepoWorkspace/);
});

test('final server failure preserves browser captions and the current typed draft', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /let finalVoice = browserVoice/);
  assert.match(voice, /catch \{[\s\S]*Preserve the browser text already visible/);
  assert.match(voice, /const fullText = mergeText\(composerTextRef\.current, finalVoice\)/);
  assert.match(voice, /onVoiceDraft\(fullText\)/);
});

test('voice conversation has separate audio, session, and build controls', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  assert.match(voice, /Start voice conversation/);
  assert.match(voice, /speechSynthesis\.speak\(utterance\)/);
  assert.match(voice, /End voice conversation/);
  assert.match(voice, /Stop response audio without cancelling work/);
  assert.match(voice, /Cancel build/);
  assert.match(voice, /requiresVoiceReview\(finalTextRef\.current\)/);
  assert.match(voice, /await onVoiceSend\(fullText\)/);
  const end = voice.slice(voice.indexOf('const endConversation ='), voice.indexOf('const startConversation ='));
  assert.doesNotMatch(end, /\bstop\(\)|cancelRun/);
  assert.match(voice, /document\.addEventListener\('visibilitychange', closeOnBackground\)/);
});

test('live captions expose explicit language choices without changing server auto-detection', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  assert.match(voice, /recognition\.lang = speechLanguage === 'auto'/);
  for (const language of ['en-US', 'ur-PK', 'hi-IN', 'ar-SA']) {
    assert.ok(voice.includes(`value="${language}"`));
  }
});
