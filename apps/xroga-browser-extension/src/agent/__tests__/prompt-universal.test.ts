import { describe, expect, it } from 'vitest';
import { agentSystemPrompt } from '../prompt';
import { toolsForRun } from '../tools';
import { DELEGATE_TOOL } from '../subagents';
import { BATCH_TOOL } from '../batch-plan';
import { SCRIPT_CONSOLE_TOOL } from '../command-surface-adapter';
import { MENU_PATH_TOOL } from '../menu-path';
import { FIND_SKILL_TOOL, READ_SKILL_TOOL } from '../skill-catalog';
import { SITE_ACTION_TOOL } from '../site-actions';
import { PLAN_TOOL } from '../task-plan';

const names = toolsForRun({ vision: true, pointAt: true, agentTools: [DELEGATE_TOOL, BATCH_TOOL, SCRIPT_CONSOLE_TOOL, MENU_PATH_TOOL, FIND_SKILL_TOOL, READ_SKILL_TOOL, SITE_ACTION_TOOL, PLAN_TOOL] }).map(t => t.name);
const prompt = agentSystemPrompt({ tools: names });

describe('the system prompt states only what is true of every application', () => {
  it('has no geometry rule for menus or other widgets (they open anywhere: observe the opened menu)', () => {
    expect(prompt).not.toMatch(/directly under the label|left edge of that label|same x as the label/i);
  });
  it('does not name one application or a menu path as a general method', () => {
    expect(prompt).not.toMatch(/tracedraw/i);
    expect(prompt).not.toContain('Tools > Scripts');
    expect(prompt).not.toMatch(/\["Tools","Scripts"/);
  });
  it('does not push a scripting console because a page paints its menus; it asks for evidence that one exists and is allowed', () => {
    expect(prompt).not.toMatch(/painted editor often has a scripting/i);
    expect(prompt).not.toMatch(/Prefer it to hand-clicking/i);
    expect(prompt).toMatch(/only when .*(visible|documented)/is);
  });
  it('tells the model to ground a pointer action in a fresh observation of the actual result', () => {
    expect(prompt).toMatch(/fresh|latest|current picture/i);
  });
});
