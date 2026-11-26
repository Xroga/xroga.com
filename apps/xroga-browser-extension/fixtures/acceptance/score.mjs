// Scores the answers of a live run against fixtures/acceptance/tasks.json.
//   node fixtures/acceptance/score.mjs <results dir>      (one <task name>.json per task, as run-live writes them)
//   node fixtures/acceptance/score.mjs --answers <file>   (a JSON object { "<task name>": "<answer>" })
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { scoreAnswer } from './scorers.mjs';

const tasks = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const answers = {};
if (args[0] === '--answers') Object.assign(answers, JSON.parse(readFileSync(args[1], 'utf8')));
else if (args[0] && existsSync(args[0])) {
  for (const file of readdirSync(args[0]).filter(f => f.endsWith('.json'))) {
    const json = JSON.parse(readFileSync(join(args[0], file), 'utf8'));
    const task = json.reports?.[0]?.result?.tasks?.[0] ?? json.reports?.[0]?.tasks?.[0];
    if (task) answers[file.replace(/\.json$/, '')] = String(task.answer ?? '');
  }
} else {
  console.error('usage: node fixtures/acceptance/score.mjs <results dir> | --answers <file>');
  process.exit(2);
}

let total = 0;
let counted = 0;
for (const t of tasks) {
  if (!(t.name in answers)) {
    console.log(`SKIP  ${t.name}: no answer`);
    continue;
  }
  const r = scoreAnswer(t.expect, answers[t.name]);
  total += r.score;
  counted++;
  console.log(`${r.score >= 0.999 ? 'PASS' : r.score > 0 ? 'PART' : 'FAIL'}  ${t.name}: ${r.score.toFixed(2)}  (${r.detail})`);
}
console.log(`\n${counted} tasks scored, mean ${counted ? (total / counted).toFixed(3) : 'n/a'}`);
