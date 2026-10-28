import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {isTerminalVoiceFailure} from './voiceRequestPolicy';
import {requiresVoiceReview} from './terminal/voiceConversation';

function actualVoiceHandler(error?: unknown) {
  const source = readFileSync(new URL('../components/terminal/XrogaVoiceControl.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('XrogaVoiceControl.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'finishVoice' && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(callback);
  const helpers = ast.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && ['cleanSpeech', 'mergeText', 'mergeSeed'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n');
  const sends: string[] = [], drafts: string[] = [], errors: string[] = [];
  const context: Record<string, unknown> = {
    AbortController, Blob, isTerminalVoiceFailure, requiresVoiceReview,
    endingRef: {current: false}, modeRef: {current: 'listening'}, captureGenerationRef: {current: 1},
    seedTextRef: {current: ''}, finalTextRef: {current: 'Ordinary spoken user text'}, interimTextRef: {current: ''},
    composerTextRef: {current: ''}, conversationRef: {current: false}, awaitingAfterRef: {current: null}, latestAssistantIdRef: {current: null},
    transcriptionAbortRef: {current: null},
    setMode: (mode: string) => {(context.modeRef as {current: string}).current = mode;},
    clearRecordingTimeout: () => {}, stopRecognition: () => {}, releaseMicrophone: () => {},
    stopRecorder: async () => new Blob([new Uint8Array(1024)], {type: 'audio/wav'}),
    transcribeVoiceAudio: async () => {if (error) throw error; return 'Ordinary verified transcript';},
    onVoiceSend: async (text: string) => {sends.push(text);}, onVoiceDraft: (text: string) => drafts.push(text),
    setVoiceError: (text: string) => errors.push(text), setPreviewText: () => {}, setNeedsReview: () => {}, setAwaitingReply: () => {}, setConversation: () => {},
  };
  const javascript = ts.transpileModule(helpers + '\nglobalThis.__finish=' + callback, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(javascript, context, {timeout: 1000});
  return {sends, drafts, errors, finish: context.__finish as (send: boolean, automatic?: boolean) => Promise<void>};
}

test('actual voice finish handler cannot auto-send browser fallback after security or accounting denial', async () => {
  for (const code of ['VOICE_TRANSCRIPTION_DENIED', 'VOICE_SESSION_CHANGED', 'VOICE_INPUT_DENIED', 'PROVIDER_RESERVATION_DENIED', 'POST_COMPLETION_ACCOUNTING_UNCERTAIN']) {
    const ui = actualVoiceHandler({status: 503, data: {code}}); await ui.finish(true);
    assert.equal(ui.sends.length, 0, code); assert.equal(ui.drafts.length, 0, code); assert.equal(ui.errors.length, 1);
  }
});
test('actual voice finish preserves verified speech and ordinary authorized availability recovery', async () => {
  const verified = actualVoiceHandler(); await verified.finish(true); assert.deepEqual(verified.sends, ['Ordinary verified transcript']);
  const outage = actualVoiceHandler({status: 503, data: {code: 'VOICE_PROVIDER_UNAVAILABLE'}}); await outage.finish(true);
  assert.deepEqual(outage.sends, ['Ordinary spoken user text']);
});
