import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('voice is a single AudioLines icon with no wake word or settings system', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const icon = source('../../components/terminal/AudioLinesIcon.tsx');

  assert.match(voice, /<AudioLinesIcon size=\{28\}/);
  assert.match(icon, /motion\.path/);
  assert.match(icon, /M10 3v18/);
  assert.match(voice, /Start voice typing/);
  assert.doesNotMatch(voice, /WAKE_WORD|WAKE_ALIAS|handsFree|Voice settings|SpeechSynthesisUtterance/);
  assert.doesNotMatch(voice, /onVoiceSend|requestSubmit|autoSpeak|notifications/);
});

test('click-to-dictate is English only and publishes interim speech into the real composer', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.match(voice, /recognition\.lang = 'en-US'/);
  assert.match(voice, /recognition\.interimResults = true/);
  assert.match(voice, /recognition\.continuous = true/);
  assert.match(voice, /publishLiveDraft\(finalTextRef\.current, interim\)/);
  assert.match(chatbar, /onVoiceDraft=\{handleVoiceDraft\}/);
  assert.match(chatbar, /setDraft\(text\)/);
  assert.match(chatbar, /setPrompt\(text\)/);
});

test('the chatbar shows a real microphone-driven waveform with pause cancel and stop', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const parts = source('../../components/terminal/ChatBarParts.tsx');
  const css = source('../../styles/uiverse.css');

  assert.match(voice, /createAnalyser\(\)/);
  assert.match(voice, /getByteFrequencyData\(bins\)/);
  assert.match(voice, /const bars = 54/);
  assert.match(voice, /Pause voice typing/);
  assert.match(voice, /Cancel voice typing/);
  assert.match(voice, /Stop voice typing and keep text/);
  assert.match(parts, /data-xroga-voice-stage/);
  assert.match(css, /\.xv-simple-voice-session/);
  assert.match(css, /\.xv-simple-voice-wave/);
});

test('stopping voice keeps text in the composer and never auto-sends', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /const fullText = mergeText\(baselineRef\.current, finalVoice\)/);
  assert.match(voice, /onVoiceDraft\(fullText\)/);
  assert.doesNotMatch(voice, /submit\(|requestSubmit|onVoiceSend/);
});

test('each new recording starts from fresh recognition state and appends to the current composer', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /baselineRef\.current = composerTextRef\.current\.trim\(\)/);
  assert.match(voice, /finalTextRef\.current = ''/);
  assert.match(voice, /interimTextRef\.current = ''/);
  assert.match(voice, /const recognition = new Recognition\(\)/);
  assert.match(voice, /recognitionRef\.current = recognition/);
});

test('final accuracy pass uses recorded audio but preserves visible browser text if the server fails', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const api = source('../voiceApi.ts');
  const backend = source('../../../../backend/src/routes/voice.ts');

  assert.match(voice, /new MediaRecorder/);
  assert.match(voice, /transcribeVoiceAudio\(audio\)/);
  assert.match(voice, /let finalVoice = browserVoice/);
  assert.match(voice, /catch \{[\s\S]*Do not erase what the user already saw/);
  assert.match(api, /\/api\/voice\/transcribe/);
  assert.match(api, /getAccessToken/);
  assert.doesNotMatch(api, /X-Xroga-Language/);
  assert.match(backend, /language', 'en'/);
  assert.match(backend, /languages\[\]', 'en'/);
  assert.match(backend, /Transcribe the speaker in English faithfully/);
  assert.doesNotMatch(backend, /wake word|X Roga|Acroga|Do not translate/);
});

test('idle mic has no circular outline or pill surface', () => {
  const css = source('../../styles/uiverse.css');

  assert.match(css, /VOICE V7 — simple English click-to-dictate/);
  assert.match(css, /border-radius:\s*0\s*!important/);
  assert.match(css, /outline:\s*0\s*!important/);
  assert.match(css, /box-shadow:\s*none\s*!important/);
});
