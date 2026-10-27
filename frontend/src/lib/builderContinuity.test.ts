import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * A builder project belongs to the chat it was started in, and a running build can be stopped. These pin the wiring between the
 * chat, the project store and the project panel (the backend behaviour has its own tests: cancel.test.ts, conversation.test.ts).
 */
const root = resolve(process.cwd(), process.cwd().endsWith('frontend') ? '..' : '.');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('builder project follows its chat', () => {
  const chat = read('frontend/src/lib/builderChat.ts');
  const context = read('frontend/src/context/TerminalChatContext.tsx');
  const store = read('frontend/src/store/useBuilderProjectStore.ts');

  it('sends the chat session id as the conversation when it creates a project, so the server can find it again', () => {
    assert.match(context, /resolveBuilderProject\(\{[\s\S]*?conversationId: sessionIdRef\.current,[\s\S]*?\}\)/);
    assert.match(chat, /builderApi\.create\(\{[^}]*conversationId: input\.conversationId/);
  });

  it('looks the project up whenever the chat changes, and again before a build, never reusing another chat\'s project', () => {
    assert.match(context, /useEffect\(\(\) => \{\s*void syncBuilderConversation\(liveSessionId\);\s*\}, \[liveSessionId\]\)/);
    assert.match(chat, /if \(input\.conversationId\) await syncBuilderConversation\(input\.conversationId\)/);
    const sync = chat.slice(chat.indexOf('export async function syncBuilderConversation'), chat.indexOf('export async function resolveBuilderProject'));
    assert.ok(sync.indexOf('bindConversation(conversationId, null)') < sync.indexOf('builderApi.forConversation'), 'the previous chat\'s project is cleared before the lookup starts');
    assert.match(sync, /getState\(\)\.conversationId === conversationId/, 'a late answer for a chat the user already left is ignored');
  });

  it('does not hand a new chat the most recent project of another chat', () => {
    const workspace = read('frontend/src/components/terminal/DevWorkspacePanel.tsx');
    assert.match(workspace, /if \(!BUILDER_ENABLED \|\| builderProjectId \|\| boundConversation\) return;/);
  });

  it('keeps the project and its chat together in the store', () => {
    assert.match(store, /conversationId: string \| null/);
    assert.match(store, /bindConversation: \(conversationId, projectId\) =>/);
  });
});

describe('stopping a build', () => {
  const panel = read('frontend/src/components/terminal/BuilderProjectPanel.tsx');

  it('shows Stop only while a build is running and calls the cancel route', () => {
    assert.match(panel, /\{active \? \(\s*<button[^>]*onClick=\{\(\) => void stop\(\)\}[^>]*aria-label="Stop the build"/);
    assert.match(panel, /await builderApi\.cancel\(projectId\)/);
  });

  it('never says the build stopped when the stop was not saved', () => {
    const stop = panel.slice(panel.indexOf('const stop = async'), panel.indexOf('if (loading && !state)'));
    assert.match(stop, /catch \(caught\)[\s\S]*setError\(/);
    assert.doesNotMatch(stop, /setState\(\s*\{[^}]*cancelled/, 'the panel shows the server\'s recorded state, not one it invented');
    assert.match(stop, /finally \{[\s\S]*void load\(\)/, 'the recorded state is reloaded either way');
  });
});
