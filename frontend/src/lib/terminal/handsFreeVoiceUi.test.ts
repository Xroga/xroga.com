import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('hands-free voice reuses the canonical terminal submit path', () => {
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.match(chatbar, /<XrogaVoiceControl\b/);
  assert.match(chatbar, /onVoiceCommand=\{handleVoiceCommand\}/);
  assert.match(chatbar, /formRef\.current\?\.requestSubmit\(\)/);
  assert.match(chatbar, /Voice and typing deliberately converge on the same form submit path/);
  assert.match(chatbar, /hideMicrophone=\{!incognito\}/);
});

test('voice onboarding requires microphone and speaker interaction before hands-free completion', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(voice, /echoCancellation:\s*true/);
  assert.match(voice, /noiseSuppression:\s*true/);
  assert.match(voice, /Hear Xroga first/);
  assert.match(voice, /Enable notifications/);
  assert.match(voice, /disabled=\{!micReady \|\| !speakerReady\}/);
  assert.match(voice, /Finish & turn on voice/);
});

test('wake-word recognition is foreground hands-free and task output can speak back', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /const WAKE_WORD = \/\\\\bxroga\\\\b\/i/);
  assert.match(voice, /recognition\.continuous = true/);
  assert.match(voice, /recognition\.interimResults = true/);
  assert.match(voice, /wakeActiveRef\.current = true/);
  assert.match(voice, /await onVoiceCommand\(command\)/);
  assert.match(voice, /new SpeechSynthesisUtterance/);
  assert.match(voice, /latestAssistantId === lastSpokenAssistantRef\.current/);
});

test('voice settings expose language, tone, voice preference, replies and notifications', () => {
  const store = source('../../store/useVoicePrefsStore.ts');
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  for (const language of ['ur-PK', 'hi-IN', 'ar-SA', 'es-ES', 'pt-BR', 'id-ID', 'tr-TR']) {
    assert.match(store, new RegExp(language.replace('-', '\\\\-')));
  }
  for (const tone of ['warm', 'calm', 'professional', 'energetic']) {
    assert.match(store, new RegExp("'" + tone + "'"));
  }
  assert.match(store, /handsFreeEnabled/);
  assert.match(store, /autoSpeak/);
  assert.match(store, /notificationsEnabled/);
  assert.match(voice, /Prefer female/);
  assert.match(voice, /Prefer male/);
  assert.match(voice, /Task notifications/);
});

test('voice waveform is driven by the real microphone analyser and respects reduced motion', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const css = source('../../styles/uiverse.css');

  assert.match(voice, /createAnalyser\(\)/);
  assert.match(voice, /getByteFrequencyData\(bins\)/);
  assert.match(voice, /setLevel\(/);
  assert.match(css, /\.xv-voice-wave/);
  assert.match(css, /#22d3ee/);
  assert.match(css, /#3b82f6/);
  assert.match(css, /#8b5cf6/);
  assert.match(css, /#d946ef/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('voice never replaces the existing backend runtime or exposes a second submit endpoint', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.doesNotMatch(voice, /fetch\(|axios|\/api\/voice|\/api\/speech|\/api\/transcribe/);
  assert.match(chatbar, /await submit\(/);
  assert.match(chatbar, /ensureRepoWorkspace/);
});
