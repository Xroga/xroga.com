// Classifies every call of eval runs as productive or wasted, so wasted turns are measured, not guessed.
//   node live/waste-report.mjs [results-dir] [last-N-files] [--calls]
// A call is: ERROR (the tool failed), NOOP (an action that changed nothing), REPEAT (the same tool on the same target as the call before),
// LOOK (snapshot, read, find, screenshot, wait: needed sometimes, wasted when nothing was acted on between two of them) or WORK (an action that changed the page).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : join(import.meta.dirname, '..', 'fixtures', '.results');
const last = Number(process.argv[3] && /^\d+$/.test(process.argv[3]) ? process.argv[3] : 13);
const showCalls = process.argv.includes('--calls');
const LOOKS = new Set(['snapshot', 'read', 'find', 'screenshot', 'wait', 'diagnostics', 'plan']);

const files = readdirSync(dir)
  .filter(f => f.endsWith('-eval.json'))
  .map(f => ({ f, t: statSync(join(dir, f)).mtimeMs }))
  .sort((a, b) => a.t - b.t)
  .slice(-last);

const classify = calls => {
  const out = [];
  let prevKey = '';
  let lookStreak = 0;
  for (const c of calls) {
    const tool = c.split(' ')[0];
    const body = c.split(' => ')[1] ?? '';
    const argText = c.split(' => ')[0];
    const key = `${tool}|${(/"(?:ref|target|name|selector)":\s*(?:"[^"]*"|\{[^}]*\})/.exec(argText) ?? [''])[0]}`;
    let cls;
    if (/^error\b/.test(body)) cls = 'ERROR';
    else if (LOOKS.has(tool)) cls = tool === 'plan' ? 'PLAN' : 'LOOK';
    else if (/effect: none/.test(body) || /effect: unattributable/.test(body) && !/changed/.test(body)) cls = 'NOOP';
    else if (/effect: changed/.test(body) || tool === 'batch' || tool === 'fill_form' || tool === 'navigate' || tool === 'done') cls = 'WORK';
    else cls = 'WORK';
    if (cls !== 'LOOK' && cls !== 'PLAN' && key === prevKey && cls !== 'WORK') cls = 'REPEAT';
    lookStreak = cls === 'LOOK' ? lookStreak + 1 : 0;
    if (cls === 'LOOK' && lookStreak >= 3) cls = 'LOOK*';
    prevKey = key;
    out.push({ tool, cls, text: c.slice(0, 140).replace(/\s+/g, ' ') });
  }
  return out;
};

const total = { runs: 0, calls: 0 };
const by = {};
for (const { f } of files) {
  const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  for (const report of d.reports ?? []) {
    for (const r of report.result?.runs ?? []) {
      const rows = classify(r.calls ?? []);
      const n = rows.length || 1;
      const count = k => rows.filter(x => x.cls === k).length;
      const waste = count('ERROR') + count('NOOP') + count('REPEAT') + count('LOOK*');
      total.runs++;
      total.calls += rows.length;
      for (const x of rows) by[x.cls] = (by[x.cls] ?? 0) + 1;
      console.log(`${r.task.padEnd(16)} ${r.success ? 'PASS' : 'FAIL'} turns ${String(r.turns).padStart(3)} calls ${String(rows.length).padStart(3)} ${String(Math.round((r.ms ?? 0) / 1000)).padStart(4)}s  WORK ${count('WORK')} LOOK ${count('LOOK')} LOOK* ${count('LOOK*')} NOOP ${count('NOOP')} ERROR ${count('ERROR')} REPEAT ${count('REPEAT')}  wasted ${Math.round((100 * waste) / n)}%`);
      if (showCalls) for (const [i, x] of rows.entries()) console.log(`   ${String(i + 1).padStart(2)} ${x.cls.padEnd(6)} ${x.text}`);
    }
  }
}
console.log(`\n${total.runs} runs, ${total.calls} calls: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}`);
