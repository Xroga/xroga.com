import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

function source(relativeUrl: string): string {
  // LF-normalised: assertions here search for literals containing `\n`, which never match
  // on a CRLF checkout.
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

test('AI responses share one compact activity view in both Workspace layouts', () => {
  const messageLog = source('../../components/terminal/SwarmMessageLog.tsx');
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');
  const timeline = source('../../components/activity/ActivityTimeline.tsx');
  const motion = source('../../components/terminal/ExecutionMotion.tsx');

  assert.doesNotMatch(messageLog, /TerminalRunStream|ResearchPagesLoader|waiting for first event/);
  assert.match(messageLog, /activity=\{work\}/);
  assert.match(messageLog, /\{work\}/);
  assert.match(messageLog, /isQuickConversationPrompt\(messagePrompt\)/);
  assert.match(liveActivity, /coalesceActivity\(run\.events\)/);
  assert.doesNotMatch(liveActivity, /thinkingSteps|pendingIntent/);
  assert.match(liveActivity, /ActivityTimeline/);
  assert.match(liveActivity, /STALLED_AFTER_MS/);
  // The redesign shows one quiet timeline: no request panel, no branding block and no capability claims.
  assert.doesNotMatch(liveActivity, /Your request|BlackHoleMark|BlackHoleWordmark|ExecutionShimmerText|Ready to use|Observed:/);
  assert.doesNotMatch(liveActivity, /SearchScanner|UniversalExecutionOrb|Globe2/);
  assert.match(motion, /ExecutionPulse/);
  assert.match(motion, /SearchScanner/);
  assert.match(motion, /UniversalExecutionOrb/);
  assert.match(motion, /StalledDots/);
  assert.doesNotMatch(liveActivity, /Connected · awaiting first update/);
  assert.doesNotMatch(liveActivity, /rounded-2xl border border-\[var\(--card-border\)\]/);
  assert.match(timeline, /aria-label="Activity"/);
  assert.doesNotMatch(`${liveActivity}
${timeline}`, /chain-of-thought is being generated|generating private model reasoning/i);
});

test('the live transcript keeps pending UI separate from received execution rows', () => {
  const liveActivity = source('../../components/terminal/TerminalLiveActivity.tsx');

  // No percentage or invented execution step list. The pending shell is explicitly
  // transient and the durable rows still come only from run.events.
  const code = liveActivity.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /percent|Math\.round\([^)]*100/i);
  assert.match(liveActivity, /run\.events/);
  assert.match(liveActivity, /data-state=\{shell \? 'pending'/);
  assert.match(liveActivity, /pendingWorkLabel\(run\?\.events/);
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


test('assistant response and execution evidence use the compact professional reading scale', () => {
  const uiverse = source('../../styles/uiverse.css');
  const sources = source('../../components/terminal/WebSourcesPanel.tsx');

  assert.match(uiverse, /\.xv-response-text,[\s\S]*?\.xv-xroga-response[\s\S]*?font-size:\s*16px\s*!important/);
  assert.match(uiverse, /@media \(min-width:\s*640px\)[\s\S]*?\.xv-response-text,[\s\S]*?font-size:\s*17px\s*!important/);
  assert.match(uiverse, /\.xv-exec-header__state\s*\{[\s\S]*?font-size:\s*15px\s*!important/);
  assert.match(uiverse, /\.xv-exec-row-label\s*\{[\s\S]*?font-size:\s*13px\s*!important/);
  assert.match(uiverse, /\.xv-ai-output-block \.xv-response-surface\s*\{/);
  assert.match(uiverse, /\.xv-ai-output-block \.xv-response-chart\s*\{[\s\S]*?height:\s*clamp\(220px, 32vw, 270px\)/);
  assert.match(uiverse, /\.xv-ai-output-block \.xv-response-card-grid,[\s\S]*?grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(sources, /xv-web-source-card__title/);
  assert.match(sources, /xv-web-source-card__snippet/);
});

test('execution motion contains universal, research and delayed-update states', () => {
  const motion = source('../../components/terminal/ExecutionMotion.tsx');
  const uiverse = source('../../styles/uiverse.css');

  assert.match(motion, /UniversalExecutionOrb/);
  assert.match(motion, /SearchScanner/);
  assert.match(motion, /StalledDots/);
  assert.match(uiverse, /--xv-exec-orb-red:\s*red/);
  assert.match(uiverse, /--xv-exec-orb-blue:\s*blue/);
  assert.match(uiverse, /\.xv-exec-search-scan/);
  assert.match(uiverse, /#007aff/);
  assert.match(uiverse, /#ff2d55/);
  assert.match(uiverse, /#34c759/);
  assert.match(uiverse, /#ff9500/);
});
