import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

test('AI responses use a plain factual status instead of an execution card', () => {
  const messageLog = source('../../components/terminal/SwarmMessageLog.tsx');

  assert.doesNotMatch(messageLog, /TerminalRunStream|ResearchPagesLoader|waiting for first event/);
  assert.match(messageLog, /data-testid="ai-processing-status"/);
  assert.match(messageLog, /latestExecutionEvent\.text/);
});

test('AI response renderers contain no cursor, reveal, or pulse animation', () => {
  const response = source('../../components/terminal/ReasoningAndFollowUps.tsx');
  const buildReport = source('../../components/terminal/TerminalBuildReport.tsx');
  const plain = source('../plainAiText.tsx');
  const markdown = source('../formatAiMarkdown.tsx');
  const combined = `${response}\n${buildReport}\n${plain}\n${markdown}`;

  assert.doesNotMatch(combined, /animate-|style\.animation|xv-stream-cursor|xv-response-in/);
});
