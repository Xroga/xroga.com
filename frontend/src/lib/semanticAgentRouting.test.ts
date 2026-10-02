import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const context = readFileSync(new URL('../context/TerminalChatContext.tsx', import.meta.url), 'utf8');

test('the terminal asks the authenticated semantic planner for the execution path', () => {
  assert.match(context, /api\.phase1\.plan\(/);
  assert.match(context, /semanticPlan\.dispatch\s*===\s*'chat'/);
  assert.match(context, /semanticPlan\.dispatch\s*===\s*'blocked'/);
  assert.match(context, /semanticPlan\s*\.directResponse/);
  assert.match(context, /requiresSoftwareExecution\(\s*semanticPlan/);
});

test('the production dispatch no longer uses the browser keyword phase-one router', () => {
  assert.doesNotMatch(context, /shouldRouteToPhase1\(/);
  assert.match(context, /semanticGoalContract: semanticPlan\.goalContract/);
});

test('keyword guesses cannot pre-empt or override the authenticated semantic plan', () => {
  assert.doesNotMatch(context, /if \(\s*!websiteBuildStart/);
  assert.doesNotMatch(context, /if \(isWebsiteBuildPrompt\(displayPrompt\) \|\| requiresGitHubForBuild\(displayPrompt\)\)/);
  assert.match(context, /Understanding your request…/);
});

test('a semantic build failure cannot be disguised as a generic chat fallback', () => {
  assert.match(context, /semanticBuildPlanned\s*=\s*runSwarmBuild/);
  assert.match(context, /codeBuildActive\s*\|\|\s*semanticBuildPlanned/);
  assert.match(context, /Request could not start/);
});
