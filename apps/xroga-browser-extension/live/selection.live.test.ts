// Which tools does DeepSeek choose for three task classes? Real model, simulated page. Run with: pnpm vitest run --config vitest.live.config.mts
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { apiKey, runLive, type Scenario } from './harness';

const REPEATS = Number(process.env.LIVE_REPEATS ?? 3);

const TRACEDRAW: Scenario = {
  request: 'Use my already open TraceDraw tab. Make one new A4 document and draw side by side: one blue (#0000FF) rectangle, one red (#FF0000) circle, and the text Xroga. Keep everything inside the page. Then export it as SVG.',
  url: 'https://tracedraw.github.io/tracedraw/',
  title: 'TraceDraw - Welcome Screen',
  outline: [
    'menubar', '  menuitem "File"', '  menuitem "Edit"', '  menuitem "Object"', '  menuitem "Text"', '  menuitem "Effects"', '  menuitem "Page"', '  menuitem "Tools"', '  menuitem "Window"', '  menuitem "Help"',
    'toolbar', '  button "New Document"', '  button "Open"', '  button "Save"',
    'tab "Welcome Screen"', 'button "New Document Alt+Shift+N"', 'button "New from Template"', 'button "Open Document Ctrl+O"',
    'canvas "Drawing area"', 'status "Tool Hints"',
  ].join('\n'),
};

const ADS: Scenario = {
  request: 'On this open Google Ads Help tab: I want to set up a Google Ads Search campaign for a plumbing business in Dubai that wants phone leads. Use your skills to find the expert method first, then give me the exact setup plan: what to check in the account, bidding, keywords, negatives, and what must be verified and approved before any spend. Do not change anything.',
  url: 'https://support.google.com/google-ads/',
  title: 'Google Ads Help',
  outline: ['heading "Google Ads Help"', 'link "Help Center"', 'link "Community"', 'link "Announcements"', 'searchbox "Describe your issue"', 'heading "Browse help topics"', 'button "Start advertising"', 'link "Your guide to Google Ads"', 'link "8 steps to prepare your campaign for success"', 'link "Choose the right campaign type"'].join('\n'),
};

const FORM: Scenario = {
  request: 'On my open httpbin.org tab, order a pizza: customer name Grace Hopper, telephone 555-0199, email grace@example.test, Medium size, toppings Bacon and Mushroom, delivery time 18:30, instructions "Ring the bell twice", then submit the order once.',
  url: 'https://httpbin.org/forms/post',
  title: '',
  outline: ['textbox "Customer name:"', 'textbox "Telephone:"', 'textbox "E-mail address:"', 'radio "Small"', 'radio "Medium"', 'radio "Large"', 'checkbox "Bacon"', 'checkbox "Extra Cheese"', 'checkbox "Onion"', 'checkbox "Mushroom"', 'textbox "Preferred delivery time:"', 'textbox "Delivery instructions:"', 'button "Submit order"'].join('\n'),
};

const out: Record<string, unknown> = {};
const live = apiKey() ? describe : describe.skip;

live('live DeepSeek tool selection (real model, simulated page)', () => {
  for (const [name, scenario] of Object.entries({ tracedraw: TRACEDRAW, ads: ADS, form: FORM })) {
    it(`${name}: records the first tools chosen over ${REPEATS} runs`, async () => {
      const runs = [];
      for (let i = 0; i < REPEATS; i++) runs.push(await runLive(scenario));
      out[name] = runs.map(r => ({ tools: r.calls.map(c => `${c.turn}:${c.tool}`), turns: r.modelTurns, wallMs: r.wallMs, end: r.end, offered: r.toolsOffered.length }));
      mkdirSync('live/results', { recursive: true });
      writeFileSync('live/results/selection.json', JSON.stringify(out, null, 2));
      expect(runs.length).toBe(REPEATS);
    }, 600_000);
  }
});
