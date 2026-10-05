import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function source(relativeUrl: string): string {
  // LF-normalised: assertions here search for literals containing `\n`, which never match
  // on a CRLF checkout.
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

test('AI responses use cardless task-aware transient feedback before real activity arrives', () => {
  const messageLog = source('../../components/terminal/SwarmMessageLog.tsx');
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');
  const motion = source('../../components/terminal/ExecutionMotion.tsx');

  assert.doesNotMatch(messageLog, /TerminalRunStream|ResearchPagesLoader|waiting for first event/);
  assert.match(messageLog, /pendingIntent=\{pendingIntent\}/);
  assert.match(messageLog, /pendingLabel=\{pendingActivityLabel\}/);
  assert.match(liveActivity, /coalesceActivity\(run\.events\)/);
  assert.match(liveActivity, /if \(!pending\) return null/);
  assert.match(liveActivity, /xv-exec-inline--chat/);
  assert.match(liveActivity, /ExecutionShimmerText/);
  assert.match(liveActivity, /SearchGlobe/);
  assert.match(motion, /ExecutionPulse/);
  assert.doesNotMatch(liveActivity, /Connected · awaiting first update/);
  assert.doesNotMatch(liveActivity, /rounded-2xl border border-\[var\(--card-border\)\]/);
  assert.match(liveActivity, /aria-label="Execution activity"/);
  assert.match(liveActivity, /private model reasoning is never shown/i);
  assert.doesNotMatch(liveActivity, /chain-of-thought is being generated|generating private model reasoning/i);
});

test('the live transcript keeps pending UI separate from received execution rows', () => {
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');

  // No percentage or invented execution step list. The pending shell is explicitly
  // transient and the durable rows still come only from run.events.
  const code = liveActivity.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /percent|Math\.round\([^)]*100/i);
  assert.match(liveActivity, /run\.events/);
  assert.match(liveActivity, /data-state="pending"/);
  assert.match(liveActivity, /data-intent=\{pendingIntent\}/);
  assert.doesNotMatch(liveActivity, /Developer details/);
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
