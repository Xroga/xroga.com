import assert from 'node:assert/strict';
import test from 'node:test';
import {isVoiceLanguage, readVoiceLanguage, saveVoiceLanguage, VOICE_LANGUAGES} from './voiceLanguage';

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); }};
}

test('automatic is the default and is offered first', () => {
  assert.equal(VOICE_LANGUAGES[0].code, ''); assert.equal(readVoiceLanguage(store()), '');
});

test('a chosen language is remembered, and choosing automatic forgets it', () => {
  const memory = store();
  saveVoiceLanguage('hi', memory); assert.equal(readVoiceLanguage(memory), 'hi');
  saveVoiceLanguage('', memory); assert.equal(readVoiceLanguage(memory), ''); assert.equal(memory.data.size, 0);
});

test('only listed languages are ever accepted', () => {
  for (const value of ['xx', 'HI', 'hi&x=1', '../hi', ' hi']) {
    assert.equal(isVoiceLanguage(value), false, value);
    assert.equal(readVoiceLanguage(store({'xroga.voice.language': value})), '');
    const memory = store(); saveVoiceLanguage(value, memory); assert.equal(memory.data.size, 0);
  }
  assert.equal(isVoiceLanguage(''), false);
});

test('blocked browser storage never breaks the microphone', () => {
  const blocked = {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); }};
  assert.equal(readVoiceLanguage(blocked), ''); assert.doesNotThrow(() => saveVoiceLanguage('hi', blocked));
});
