// Does a real DeepSeek open the console and use run_script_console on a stateful canvas-editor simulation? Real model, SIMULATED app.
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { apiKey, runLive } from './harness';
import { scriptAppSim } from './sim-script-app';

const REPEATS = Number(process.env.LIVE_REPEATS ?? 3);
const live = apiKey() ? describe : describe.skip;
const REQUEST = process.env.LIVE_REQUEST ?? 'Use my already open editor tab. Make one new A4 document and draw side by side: one blue (#0000FF) rectangle, one red (#FF0000) circle, and the text Xroga. Keep everything inside the page. Then export it as SVG.';

live('console selection (real DeepSeek, simulated stateful editor)', () => {
  it(`runs ${REPEATS} times and records the tool sequence`, async () => {
    const rows = [];
    for (let i = 0; i < REPEATS; i++) {
      const sim = scriptAppSim();
      const r = await runLive({ request: REQUEST, url: 'https://paint.example.test/app/', title: 'Editor - Welcome', outline: sim.outline(), handlers: sim.handlers, turnCap: 14 });
      rows.push({
        tools: r.calls.map(c => `${c.turn}:${c.tool}`), turns: r.modelTurns, wallMs: r.wallMs, end: r.end,
        usedConsoleTool: r.calls.some(c => c.tool === 'run_script_console'), usedFindSkill: r.calls.some(c => c.tool === 'find_skill'),
        documents: sim.stats.documents, scriptsRun: sim.stats.scriptsRun, shapes: sim.stats.shapes, exported: sim.stats.exported, simCalls: sim.stats.calls, consoleResults: r.calls.filter(c => c.tool === 'run_script_console').map(c => c.result),
      });
    }
    mkdirSync('live/results', { recursive: true });
    writeFileSync(`live/results/${process.env.LIVE_LABEL ?? 'console'}.json`, JSON.stringify(rows, null, 2));
    expect(rows.length).toBe(REPEATS);
  }, 900_000);
});
