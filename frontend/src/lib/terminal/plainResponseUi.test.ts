import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

test('AI responses use one lightweight universal activity surface', () => {
  const messageLog = source('../../components/terminal/SwarmMessageLog.tsx');
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');

  assert.match(messageLog, /<TerminalLiveActivity run=\{terminalRun\} \/>/);
  assert.match(liveActivity, /run\.events/);
  assert.match(liveActivity, /PENDING_REVEAL_DELAY_MS/);
  assert.match(liveActivity, /pendingActivityLabel\(\)/);
  assert.doesNotMatch(liveActivity, /Xroga is on it|Getting things ready|Working on your request|terminal-elapsed/);
  assert.doesNotMatch(liveActivity, /event\.source\s*\?/);
});

test('the live transcript does not fabricate percentage progress or giant waiting cards', () => {
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');
  const code = liveActivity.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

  assert.doesNotMatch(code, /progress-?bar|percent|Math\.round\([^)]*100/i);
  assert.doesNotMatch(code, /rounded-2xl[^\n]*border[^\n]*Xroga is on it/i);
  assert.match(liveActivity, /View activity/);
});

test('ordinary prose uses semantic markdown and math is opt-in', () => {
  const response = source('../../components/terminal/ReasoningAndFollowUps.tsx');
  const plain = source('../plainAiText.tsx');

  assert.match(
    response,
    /isMathSolutionContent\(safeContent\)[\s\S]*?<PlainAiResponse[\s\S]*?mathMode[\s\S]*?:\s*\([\s\S]*?<FormattedAiMarkdown/s,
  );
  assert.doesNotMatch(plain, />Final answer</i);
});

test('AI response renderers contain no per-token cursor or reveal animation', () => {
  const response = source('../../components/terminal/ReasoningAndFollowUps.tsx');
  const buildReport = source('../../components/terminal/TerminalBuildReport.tsx');
  const plain = source('../plainAiText.tsx');
  const markdown = source('../formatAiMarkdown.tsx');
  const combined = `${response}\n${buildReport}\n${plain}\n${markdown}`;

  assert.doesNotMatch(combined, /style\.animation|xv-stream-cursor|xv-response-in/);
});
