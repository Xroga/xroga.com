import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function source(relativeUrl: string): string {
  // LF-normalised: assertions here search for literals containing `\n`, which never match
  // on a CRLF checkout.
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

test('AI responses use only received activity instead of an execution card or client-authored wait copy', () => {
  const messageLog = source('../../components/terminal/SwarmMessageLog.tsx');
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');

  assert.doesNotMatch(messageLog, /TerminalRunStream|ResearchPagesLoader|waiting for first event/);
  assert.match(messageLog, /<TerminalLiveActivity run=\{terminalRun\} \/>/);
  assert.match(liveActivity, /coalesceActivity\(run\.events\)/);
  assert.match(liveActivity, /aria-label="Xroga activity"/);
  assert.doesNotMatch(liveActivity, /pendingLabel|waitingLine|terminal-waiting-line/);
});

test('the live transcript renders only received rows', () => {
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');

  // No progress bar, no percentage, no invented step list — the failure modes the
  // execution card was removed for.
  const code = liveActivity.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /progress-?bar|percent|Math\.round\([^)]*100/i);
  // Rows come from run state; the component may not synthesise one.
  assert.match(liveActivity, /run\.events/);
  assert.doesNotMatch(liveActivity, /Xroga is on it|terminal-elapsed|Developer details/);
});

test('chat lanes do not invent thinking or composing status callbacks', () => {
  const guest = source('../runGuestLaneChat.ts');
  const light = source('../runLightLaneChat.ts');
  const combined = `${guest}\n${light}`;

  assert.doesNotMatch(combined, /onStatus|Thinking in guest preview|Understanding your request|Composing your answer/);
});

test('AI response renderers contain no cursor, reveal, or pulse animation', () => {
  const response = source('../../components/terminal/ReasoningAndFollowUps.tsx');
  const buildReport = source('../../components/terminal/TerminalBuildReport.tsx');
  const plain = source('../plainAiText.tsx');
  const markdown = source('../formatAiMarkdown.tsx');
  const combined = `${response}\n${buildReport}\n${plain}\n${markdown}`;

  assert.doesNotMatch(combined, /animate-|style\.animation|xv-stream-cursor|xv-response-in/);
});

test('normal output does not append internal developer identifiers', () => {
  const output = source('../../components/terminal/XrogaBlockView.tsx');

  assert.doesNotMatch(output, /XrogaDeveloperInspector|Developer details/);
});
