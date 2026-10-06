import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('voice is one icon, not the retired voice-off pill or settings menu', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  const icon = source('../../components/terminal/AudioLinesIcon.tsx');
  assert.match(voice, /xv-voice-icon-only/);
  assert.match(voice, /<AudioLinesIcon/);
  assert.match(icon, /motion\.path/);
  assert.match(icon, /M10 3v18/);
  assert.match(voice, /aria-label=\{/);
  assert.doesNotMatch(voice, /xv-voice-settings-panel/);
  assert.doesNotMatch(voice, /xv-voice-settings-trigger/);
  assert.doesNotMatch(voice, /Voice off/);
  assert.doesNotMatch(voice, /SpeechSynthesisUtterance/);
});

test('wake word accepts Xroga recognition variants and activates capture', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.ok(voice.includes("x[\\\\s-]*roga"));
  assert.ok(voice.includes("ex[\\\\s-]*roga"));
  assert.ok(voice.includes('acroga'));
  assert.ok(voice.includes('zroga'));
  assert.match(voice, /extractWakeCommand/);
  assert.match(voice, /activateCapture\(wakeCommand\)/);
  assert.match(voice, /recognition\.continuous = true/);
  assert.match(voice, /recognition\.interimResults = true/);
  assert.match(voice, /recognition\.maxAlternatives = 5/);
  assert.match(voice, /wakeCandidate\(result\)/);
});

test('real microphone amplitude drives the full inline chatbar waveform', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const parts = source('../../components/terminal/ChatBarParts.tsx');
  const css = source('../../styles/uiverse.css');

  assert.match(voice, /createAnalyser\(\)/);
  assert.match(voice, /getByteFrequencyData\(bins\)/);
  assert.match(voice, /const bars = 52/);
  assert.match(voice, /xv-voice-capture-bar/);
  assert.match(parts, /data-xroga-voice-stage/);
  assert.match(parts, /xv-chatbar-compose-field/);
  assert.match(css, /:has\(\.xv-voice-capture-bar\)/);
  assert.match(css, /\.xv-voice-line-wave/);
  assert.match(css, /\.xv-voice-icon-only\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.xv-voice-icon-only\.is-listening\s*\{[\s\S]*?background:\s*transparent;/);
});

test('manual voice controls expose pause stop done cancel and send without auto-send', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /Pause/);
  assert.match(voice, /Stop recording and keep text/);
  assert.match(voice, /Done with voice and keep text/);
  assert.match(voice, /Close voice and discard this dictation/);
  assert.match(voice, /Send voice message/);
  assert.match(voice, /finalizeCapture\(\{ send: false \}\)/);
  assert.match(voice, /finalizeCapture\(\{ send: true \}\)/);
  assert.doesNotMatch(voice, /Done with voice and keep text[\s\S]{0,240}disableAfter:\s*true/);
});

test('spoken stop send enter and start-now controls are recognized', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  for (const phrase of [
    "'stop'",
    "'send it'",
    "'enter'",
    "'start now'",
    "'now start'",
    "'pause'",
    "'resume'",
    "'done'",
  ]) {
    assert.ok(voice.includes(phrase), 'missing spoken control ' + phrase);
  }
  assert.match(voice, /controlAtEnd/);
});

test('native-language final transcription uses authenticated server auto detection', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const api = source('../voiceApi.ts');

  assert.match(voice, /new MediaRecorder/);
  assert.match(voice, /transcribeVoiceAudio\(audio, 'auto'\)/);
  assert.match(api, /getAccessToken/);
  assert.match(api, /\/api\/voice\/transcribe/);
  assert.match(api, /X-Xroga-Language/);
});

test('voice text stays in the canonical composer until explicit send', () => {
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.match(chatbar, /composerText=\{draft\}/);
  assert.match(chatbar, /onVoiceDraft=\{handleVoiceDraft\}/);
  assert.match(chatbar, /onVoiceSend=\{handleVoiceSend\}/);
  assert.match(chatbar, /formRef\.current\?\.requestSubmit\(\)/);
  assert.match(chatbar, /Voice and typing deliberately converge|Voice and typing deliberately converge|same canonical form submit/);
  assert.match(chatbar, /await submit\(/);
  assert.match(chatbar, /ensureRepoWorkspace/);
});

test('voice execution never creates a second Xroga agent backend', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.doesNotMatch(voice, /streamSwarmExecute|\/api\/swarm\/execute|\/api\/chat/);
  assert.match(voice, /onVoiceSend/);
});


test('voice final segments de-duplicate wake-seed text and understand polite commands', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /browserTextRef\.current = mergeWakeSeed\(browserTextRef\.current, clean\)/);
  assert.match(voice, /isPoliteControlPrefix/);
  for (const phrase of ["'send it now'", "'go ahead'", "'stop now'", "'pause now'", "'resume now'"]) {
    assert.ok(voice.includes(phrase), 'missing resilient control phrase ' + phrase);
  }
});

test('server transcription prefers keyword-guided current transcription and falls back safely', () => {
  const backend = source('../../../../backend/src/routes/voice.ts');

  assert.match(backend, /configuredModel \|\| 'gpt-transcribe'/);
  assert.match(backend, /'gpt-4o-transcribe'/);
  assert.match(backend, /'gpt-4o-mini-transcribe'/);
  assert.match(backend, /keywords\[\]/);
  assert.match(backend, /'Xroga'/);
  assert.match(backend, /'X Roga'/);
  assert.match(backend, /response_format', 'json'/);
  assert.match(backend, /temperature', '0'/);
});


test('server fallback can still honor a spoken send or cancel command', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /if \(serverControl\.action === 'send'\) shouldSend = true/);
  assert.match(voice, /if \(serverControl\.action === 'cancel'\)/);
  assert.match(voice, /refined\.shouldSend && refined\.fullText/);
});


test('interim speech is never lost when Stop or Done happens before a final browser segment', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /const interimTextRef = useRef\(''\)/);
  assert.match(voice, /interimTextRef\.current = cleanSpeech\(preview\)/);
  assert.match(
    voice,
    /mergeWakeSeed\(browserTextRef\.current, interimTextRef\.current\)/,
  );
  assert.match(voice, /interimTextRef\.current = ''/);
});

test('wake detection avoids regex lookbehind and accepts hyphenated X-Roga variants', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.ok(voice.includes("x[\\\\s-]*roga"));
  assert.match(voice, /new RegExp\(WAKE_ALIAS_SOURCE, 'iu'\)/);
  assert.doesNotMatch(voice, /\?<!/);
});


test('Stop and Done wait for one authoritative transcription before arming the next voice turn', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /setMode\('transcribing'\)/);
  assert.match(voice, /transcribed = await transcribeVoiceAudio\(audio, 'auto'\)/);
  assert.match(voice, /const sourceText = cleanSpeech\(transcribed \|\| fallbackVoiceText\)/);
  assert.match(voice, /browserTextRef\.current = ''/);
  assert.match(voice, /interimTextRef\.current = ''/);
  assert.match(voice, /baselineRef\.current = ''/);
  assert.match(voice, /composerTextRef\.current = fullText/);
  assert.match(voice, /onVoiceDraft\(fullText\)/);
  assert.doesNotMatch(voice, /void transcribe\(\)\.then/);
});


test('audio-lines mic has no circular outline or pill surface', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const css = source('../../styles/uiverse.css');

  assert.match(voice, /<AudioLinesIcon[\s\S]*?size=\{28\}/);
  assert.match(css, /Voice v6 icon hard reset/);
  assert.match(css, /border-radius:\s*0\s*!important/);
  assert.match(css, /outline:\s*0\s*!important/);
  assert.match(css, /box-shadow:\s*none\s*!important/);
});

test('voice draft keeps both visible composer and canonical prompt synchronized', () => {
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.match(chatbar, /setDraft\(text\)/);
  assert.match(chatbar, /draftRef\.current = text/);
  assert.match(chatbar, /setPrompt\(text\)/);
});