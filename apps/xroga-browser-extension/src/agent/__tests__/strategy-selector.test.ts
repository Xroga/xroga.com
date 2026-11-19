import { describe, expect, it } from 'vitest';
import { describeChoice, evidenceFromOutline, rankStrategies } from '../strategy-selector';
import { ProgressTracker } from '../progress-tracker';

const form = [
  'heading "Contact"', 'textbox "Name"', 'textbox "Email"', 'textbox "Phone"', 'combobox "Country"', 'checkbox "Subscribe"',
  'button "Save"', 'link "Home"', 'link "Pricing"', 'link "Docs"', 'tab "General"', 'tab "Billing"', 'menuitem "Sign out"',
].join('\n');
const canvasEditor = ['heading "Design"', 'img "Design canvas"', 'button "Undo"', 'button "Redo"'].join('\n');
const paintedApp = 'application "App"';
const scriptApp = ['menuitem "File"', 'menuitem "Tools"', 'menuitem "Scripts panel"', 'img "Drawing canvas"', 'button "Run"'].join('\n');

const top = (outline: string, extra = {}) => rankStrategies(evidenceFromOutline(outline, { vision: true, ...extra }))[0]!.strategy;

describe('rankStrategies', () => {
  it('starts a structured form on DOM controls, not on screenshots', () => {
    expect(['DOM_A11Y', 'DOM_BATCH']).toContain(top(form));
    expect(top(form)).toBe('DOM_BATCH');
  });
  it('starts an unfamiliar canvas editor visually when the model can see', () => {
    expect(top(canvasEditor)).toBe('VISUAL_GUI');
  });
  it('does not start visually without vision', () => {
    expect(top(canvasEditor, { vision: false })).not.toBe('VISUAL_GUI');
  });
  it('treats an almost empty outline as painted or loading', () => {
    expect(top(paintedApp)).toBe('VISUAL_GUI');
  });
  it('prefers a verified command surface when one is present', () => {
    expect(top(scriptApp, { verifiedSkill: true })).toBe('APP_NATIVE');
  });
  it('prefers an authorized connected tool over the page', () => {
    expect(top(form, { connectedTool: true })).toBe('CONNECTED_TOOL');
  });
  it('is stable under layout changes: reordered and duplicated lines pick the same method', () => {
    const lines = form.split('\n');
    const shuffled = [...lines].reverse().concat(lines.slice(0, 3)).join('\n');
    expect(top(shuffled)).toBe(top(form));
  });
  it('keeps RECOVERY last and returns every strategy once, whatever the input', () => {
    for (const outline of ['', form, canvasEditor, paintedApp, scriptApp, 'x'.repeat(5000), '\u0000\u0001 canvas canvas canvas']) {
      for (const extra of [{}, { connectedTool: true }, { verifiedSkill: true }, { vision: false }]) {
        const r = rankStrategies(evidenceFromOutline(outline, extra));
        expect(r[r.length - 1]!.strategy).toBe('RECOVERY');
        expect(new Set(r.map(x => x.strategy)).size).toBe(r.length);
        expect(r.length).toBeGreaterThanOrEqual(5);
      }
    }
  });
  it('explains itself in words a log reader can follow', () => {
    expect(describeChoice(rankStrategies(evidenceFromOutline(canvasEditor, { vision: true })))).toContain('VISUAL_GUI');
  });
});

describe('ProgressTracker with an evidence-based order', () => {
  const click = { tool: 'click', args: { id: 1 }, isError: false, resultText: 'same', tabId: 1, url: 'u' };
  it('walks the chosen order, not the default ladder', () => {
    const t = new ProgressTracker();
    expect(t.reorder(['VISUAL_GUI', 'APP_NATIVE', 'RECOVERY'])).toBe(true);
    expect(t.strategy).toBe('VISUAL_GUI');
    t.record(click); t.record(click);
    expect(t.record(click).strategy).toBe('APP_NATIVE');
  });
  it('never reorders after a method has already stalled, and refuses an order without RECOVERY last', () => {
    const t = new ProgressTracker();
    expect(t.reorder(['DOM_A11Y', 'VISUAL_GUI'])).toBe(false);
    t.record(click); t.record(click); t.record(click);
    expect(t.reorder(['VISUAL_GUI', 'RECOVERY'])).toBe(false);
  });
});
