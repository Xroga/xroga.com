import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

test('AI responses use a plain factual status instead of an execution card', () => {
  const messageLog = source('../../components/terminal/SwarmMessageLog.tsx');
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');

  assert.doesNotMatch(messageLog, /TerminalRunStream|ResearchPagesLoader|waiting for first event/);
  // The status line moved into `TerminalLiveActivity`, which renders the last few real
  // rows rather than only the newest one. The old single-line version was invisible
  // until the first event arrived, which is the blank terminal users reported.
  assert.match(messageLog, /<TerminalLiveActivity run=\{terminalRun\} \/>/);
  assert.match(liveActivity, /data-testid={isLatest \? 'ai-processing-status' : undefined}/);
  assert.match(liveActivity, /event\.text/);
});

test('the live transcript renders only received rows plus one honest waiting line', () => {
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');

  // No progress bar, no percentage, no invented step list — the failure modes the
  // execution card was removed for.
  const code = liveActivity.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /progress-?bar|percent|Math\.round\([^)]*100/i);
  // Rows come from run state; the component may not synthesise one.
  assert.match(liveActivity, /run\.events/);
  assert.match(liveActivity, /waitingLine\(elapsed\)/);
});

test('AI response renderers contain no cursor, reveal, or pulse animation', () => {
  const response = source('../../components/terminal/ReasoningAndFollowUps.tsx');
  const buildReport = source('../../components/terminal/TerminalBuildReport.tsx');
  const plain = source('../plainAiText.tsx');
  const markdown = source('../formatAiMarkdown.tsx');
  const combined = `${response}\n${buildReport}\n${plain}\n${markdown}`;

  assert.doesNotMatch(combined, /animate-|style\.animation|xv-stream-cursor|xv-response-in/);
});
