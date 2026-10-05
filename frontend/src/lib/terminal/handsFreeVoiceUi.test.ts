import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('voice speech visibly enters the same canonical composer and submit path as typing', () => {
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.match(chatbar, /<XrogaVoiceControl\b/);
  assert.match(chatbar, /onVoiceCommand=\{handleVoiceCommand\}/);
  assert.match(chatbar, /onVoiceDraft=\{handleVoiceDraft\}/);
  assert.match(chatbar, /formRef\.current\?\.requestSubmit\(\)/);
  assert.match(chatbar, /Voice and typing deliberately converge on the same form submit path/);
  assert.match(chatbar, /setDraft\(text\)/);
});

test('wake recognition accepts real STT variants while the visible brand stays Xroga', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /x\\s\*roga/);
  assert.match(voice, /ex\\s\*roga/);
  assert.match(voice, /acroga/);
  assert.match(voice, /zroga/);
  assert.match(voice, /extractWakeCommand/);
  assert.match(voice, /The product name rendered to the user remains/);
  assert.match(voice, /replace\(\/\\bXroga\\b\/gi, 'X Roga'\)/);
});

test('voice has real microphone metering, live chatbar waveform, pause, finish and stop controls', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const parts = source('../../components/terminal/ChatBarParts.tsx');
  const css = source('../../styles/uiverse.css');

  assert.match(voice, /createAnalyser\(\)/);
  assert.match(voice, /getByteFrequencyData\(bins\)/);
  assert.match(voice, /large \? 23/);
  assert.match(voice, /CirclePause/);
  assert.match(voice, /Finish voice input/);
  assert.match(voice, /Stop Xroga task and voice/);
  assert.match(parts, /data-xroga-voice-stage/);
  assert.match(css, /\.xv-voice-session-bar/);
  assert.match(css, /\.xv-voice-wave--large/);
});

test('tap-to-talk records audio and has authenticated server transcription fallback', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const api = source('../voiceApi.ts');

  assert.match(voice, /new MediaRecorder/);
  assert.match(voice, /transcribeVoiceAudio\(recorded, language\)/);
  assert.match(api, /getAccessToken/);
  assert.match(api, /\/api\/voice\/transcribe/);
  assert.match(api, /Authorization:/);
  assert.match(api, /X-Xroga-Language/);
});

test('compact setup uses the existing Xroga orb and does not auto-open on workspace entry', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  assert.match(voice, /xroga-orb-mark-v2\.webp/);
  assert.match(voice, /xv-voice-onboarding--compact/);
  assert.match(voice, /Allow microphone/);
  assert.match(voice, /Hear Xroga/);
  assert.match(voice, /Task notifications/);
  assert.match(voice, /setOnboardingOpen\(true\)/);
  assert.doesNotMatch(voice, /setOnboardingOpen\(!onboardingComplete/);
});

test('voice settings keep language, voice preference, tone, spoken replies and notifications', () => {
  const store = source('../../store/useVoicePrefsStore.ts');
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');

  for (const language of ['ur-PK', 'hi-IN', 'ar-SA', 'es-ES', 'pt-BR', 'id-ID', 'tr-TR']) {
    assert.ok(store.includes(language), 'missing voice language ' + language);
  }
  for (const tone of ['warm', 'calm', 'professional', 'energetic']) {
    assert.match(store, new RegExp("'" + tone + "'"));
  }
  assert.match(voice, /Prefer female/);
  assert.match(voice, /Prefer male/);
  assert.match(voice, /Speak replies/);
  assert.match(voice, /Task notifications/);
});

test('voice runtime reset prevents stale v2 enabled state from masquerading as a working mic', () => {
  const store = source('../../store/useVoicePrefsStore.ts');
  assert.match(store, /version: 3/);
  assert.match(store, /handsFreeEnabled: false/);
  assert.match(store, /onboardingComplete: false/);
});

test('voice request execution still belongs to Xroga agents, not a second chat backend', () => {
  const voice = source('../../components/terminal/XrogaVoiceControl.tsx');
  const chatbar = source('../../components/terminal/TerminalChatBar.tsx');

  assert.doesNotMatch(voice, /streamSwarmExecute|\/api\/swarm\/execute|\/api\/chat/);
  assert.match(chatbar, /await submit\(/);
  assert.match(chatbar, /ensureRepoWorkspace/);
  assert.match(chatbar, /onVoiceCommand=\{handleVoiceCommand\}/);
});
